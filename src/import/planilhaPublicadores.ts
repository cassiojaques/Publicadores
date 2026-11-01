import { novoId, novoPublicador, type Db, type Esperanca, type Privilegio, type Publicador, type Sexo } from '../domain/types';
import { normalizarNome } from './relatorioCampo';

/**
 * Cadastro em lote a partir de uma planilha (.xlsx/.csv) com uma linha por publicador.
 * Colunas reconhecidas (primeira linha = cabeçalho): Nome, Grupo, Sexo, Classe/Esperança,
 * Batismo/Designação (Ancião, S. Ministerial, Ir. Batizado, Não Batizado) e Categoria
 * (Publicador, P. Regular, P. Especial, P. Auxiliar, P. Auxiliar Permanente, Irregular).
 */
export interface LinhaPlanilha {
  nome: string;
  grupo: string;
  sexo: Sexo;
  esperanca: Esperanca;
  batizado: boolean;
  privilegios: Privilegio[];
  nota: string;
}

const COLUNAS = {
  nome: ['nome', 'publicador', 'nome completo'],
  grupo: ['grupo', 'grupo de campo'],
  sexo: ['sexo', 'sex'],
  classe: ['classe', 'esperanca'],
  designacao: ['batismo', 'designacao', 'situacao'],
  categoria: ['categoria', 'tipo'],
};

const chave = (s: unknown) => normalizarNome(String(s ?? '')).replace(/\./g, '').trim();

function coluna(linha: Record<string, unknown>, nomes: string[]): string {
  for (const [k, v] of Object.entries(linha)) if (nomes.includes(chave(k))) return String(v ?? '').trim();
  return '';
}

export function lerLinhas(linhas: Record<string, unknown>[]): LinhaPlanilha[] {
  const out: LinhaPlanilha[] = [];
  for (const l of linhas) {
    const nome = coluna(l, COLUNAS.nome).replace(/\s+/g, ' ');
    if (!nome) continue;
    const designacao = chave(coluna(l, COLUNAS.designacao));
    const categoria = chave(coluna(l, COLUNAS.categoria));
    const privilegios: Privilegio[] = [];
    if (designacao.startsWith('anciao')) privilegios.push('anciao');
    if (designacao.includes('ministerial') || designacao.startsWith('servo')) privilegios.push('servo_ministerial');
    let nota = '';
    // "Irregular" é calculado pelos relatórios; não vira designação.
    if (categoria.startsWith('irregular')) nota = '';
    else if (/(^| )regular/.test(categoria)) privilegios.push('pioneiro_regular');
    else if (categoria.includes('especial')) privilegios.push('pioneiro_especial');
    else if (categoria.includes('missionario')) privilegios.push('missionario');
    else if (categoria.includes('auxiliar')) {
      nota = /permanente|continuo/.test(categoria) ? 'Pioneiro auxiliar contínuo' : 'Pioneiro auxiliar';
    }
    out.push({
      nome,
      grupo: coluna(l, COLUNAS.grupo),
      sexo: chave(coluna(l, COLUNAS.sexo)).startsWith('f') ? 'F' : 'M',
      esperanca: chave(coluna(l, COLUNAS.classe)).includes('ungid') ? 'ungido' : 'outras_ovelhas',
      batizado: !/^nao batizad/.test(designacao),
      privilegios,
      nota,
    });
  }
  return out;
}

export async function lerPlanilha(arquivo: ArrayBuffer): Promise<LinhaPlanilha[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arquivo);
  const aba = wb.Sheets[wb.SheetNames[0]];
  return lerLinhas(XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: '' }));
}

/** "G-2 (Luiz)" → { nome: "Grupo 2", dica: "Luiz" }. Outros formatos ficam como estão. */
export function interpretarGrupo(texto: string): { nome: string; dica: string | null } {
  const m = texto.match(/^\s*(?:g|grupo)\s*-?\s*(\d+)\s*(?:\((.+)\))?\s*$/i);
  if (m) return { nome: `Grupo ${Number(m[1])}`, dica: m[2]?.trim() || null };
  const p = texto.match(/\((.+)\)/);
  return { nome: texto.trim(), dica: p ? p[1].trim() : null };
}

export interface PreviaPlanilha {
  novos: LinhaPlanilha[];
  existentes: { linha: LinhaPlanilha; publicador: Publicador }[];
  gruposNovos: string[];
}

export function preverPlanilha(db: Db, linhas: LinhaPlanilha[]): PreviaPlanilha {
  const porNome = new Map(db.publicadores.map((p) => [normalizarNome(p.nome), p]));
  const nomesGrupos = new Set(db.grupos.map((g) => chave(g.nome)));
  const gruposNovos = [
    ...new Set(linhas.filter((l) => l.grupo).map((l) => interpretarGrupo(l.grupo).nome)),
  ].filter((n) => !nomesGrupos.has(chave(n)));
  const novos: LinhaPlanilha[] = [];
  const existentes: PreviaPlanilha['existentes'] = [];
  for (const linha of linhas) {
    const p = porNome.get(normalizarNome(linha.nome));
    if (p) existentes.push({ linha, publicador: p });
    else novos.push(linha);
  }
  gruposNovos.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  return { novos, existentes, gruposNovos };
}

/**
 * Aplica a planilha: cria grupos e publicadores novos e, se pedido, atualiza os existentes.
 * Quando o grupo traz um nome entre parênteses, define como superintendente o irmão do grupo
 * com esse primeiro nome (preferindo anciãos), se ainda não houver um.
 */
export function aplicarPlanilha(db: Db, previa: PreviaPlanilha, atualizarExistentes: boolean) {
  const grupoPorNome = new Map(db.grupos.map((g) => [chave(g.nome), g]));
  const dicas = new Map<string, string>();
  const grupoId = (texto: string): string | null => {
    if (!texto) return null;
    const { nome, dica } = interpretarGrupo(texto);
    let g = grupoPorNome.get(chave(nome));
    if (!g) {
      g = { id: novoId(), nome, superintendenteId: null, ajudanteId: null };
      db.grupos.push(g);
      grupoPorNome.set(chave(nome), g);
    }
    if (dica) dicas.set(g.id, dica);
    return g.id;
  };
  const dados = (l: LinhaPlanilha) => ({
    sexo: l.sexo,
    esperanca: l.esperanca,
    batizado: l.batizado,
    privilegios: l.privilegios,
    grupoId: grupoId(l.grupo),
  });

  let criados = 0;
  let atualizados = 0;
  for (const l of previa.novos) {
    db.publicadores.push(novoPublicador({ nome: l.nome, anotacoes: l.nota, ...dados(l) }));
    criados++;
  }
  if (atualizarExistentes)
    for (const { linha, publicador } of previa.existentes) {
      const p = db.publicadores.find((x) => x.id === publicador.id);
      if (!p) continue;
      Object.assign(p, dados(linha));
      if (linha.nota && !p.anotacoes.includes(linha.nota)) p.anotacoes = [p.anotacoes, linha.nota].filter(Boolean).join('\n');
      atualizados++;
    }

  for (const g of db.grupos) {
    const dica = dicas.get(g.id);
    if (!dica || g.superintendenteId) continue;
    const primeiro = chave(dica).split(' ')[0];
    const candidatos = db.publicadores
      .filter((p) => p.grupoId === g.id && p.sexo === 'M' && !p.arquivado && chave(p.nome).split(' ')[0] === primeiro)
      .sort((a, b) => peso(a) - peso(b));
    if (candidatos.length === 1 || (candidatos.length > 1 && peso(candidatos[0]) < peso(candidatos[1])))
      g.superintendenteId = candidatos[0].id;
  }
  db.grupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  return { criados, atualizados };
}

const peso = (p: Publicador) => (p.privilegios.includes('anciao') ? 0 : p.privilegios.includes('servo_ministerial') ? 1 : 2);
