import { novoId, novoPublicador, type Db, type Esperanca, type Privilegio, type Publicador, type Sexo } from '../domain/types';
import { normalizarNome } from './relatorioCampo';

/**
 * Cadastro em lote a partir de uma planilha (.xlsx/.csv) com uma linha por publicador.
 * Colunas reconhecidas (primeira linha = cabeçalho): Nome, Grupo, Sexo, Batizado (Sim/Não),
 * Situação (Publicador, Inativo, Pioneiro Regular/Especial, Pioneiro Auxiliar,
 * Pioneiro Auxiliar Permanente), Privilégio (Ancião, Servo Ministerial) e, opcional, Classe/Esperança.
 * Também aceita o formato antigo (Batismo/Designação e Categoria).
 */
export type AuxiliarPlanilha = 'nao' | 'mes' | 'permanente';

export interface LinhaPlanilha {
  nome: string;
  grupo: string;
  sexo: Sexo;
  esperanca: Esperanca;
  batizado: boolean;
  privilegios: Privilegio[];
  inativo: boolean;
  auxiliar: AuxiliarPlanilha;
}

const COLUNAS = {
  nome: ['nome', 'publicador', 'nome completo'],
  grupo: ['grupo', 'grupo de campo'],
  sexo: ['sexo', 'sex'],
  classe: ['classe', 'esperanca'],
  batizado: ['batizado', 'batizada', 'batismo'],
  situacao: ['situacao', 'categoria', 'tipo'],
  privilegio: ['privilegio', 'privilegios', 'designacao'],
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
    const batismo = chave(coluna(l, COLUNAS.batizado));
    // No formato antigo a coluna "Batismo" também traz Ancião/S. Ministerial.
    const privilegio = `${chave(coluna(l, COLUNAS.privilegio))} ${batismo}`;
    const situacao = chave(coluna(l, COLUNAS.situacao));
    const privilegios: Privilegio[] = [];
    if (privilegio.includes('anciao')) privilegios.push('anciao');
    if (privilegio.includes('ministerial') || /(^| )(servo|sm)( |$)/.test(privilegio)) privilegios.push('servo_ministerial');
    let auxiliar: AuxiliarPlanilha = 'nao';
    // "Irregular" é calculado pelos relatórios; não vira situação.
    if (situacao.includes('auxiliar')) auxiliar = /permanente|continuo/.test(situacao) ? 'permanente' : 'mes';
    else if (situacao.includes('especial')) privilegios.push('pioneiro_especial');
    else if (situacao.includes('missionario')) privilegios.push('missionario');
    else if (/(^| )regular/.test(situacao)) privilegios.push('pioneiro_regular');
    out.push({
      nome,
      grupo: coluna(l, COLUNAS.grupo),
      sexo: chave(coluna(l, COLUNAS.sexo)).startsWith('f') ? 'F' : 'M',
      esperanca: chave(coluna(l, COLUNAS.classe)).includes('ungid') ? 'ungido' : 'outras_ovelhas',
      batizado: !/^n(ao)?( |$)/.test(batismo),
      privilegios,
      inativo: situacao.startsWith('inativ'),
      auxiliar,
    });
  }
  return out;
}

export async function lerPlanilha(arquivo: ArrayBuffer): Promise<LinhaPlanilha[]> {
  const XLSX = await import('xlsx');
  const b = new Uint8Array(arquivo);
  // .xlsx/.ods (zip) e .xls são binários; o resto é CSV, que pode vir em UTF-8 ou no Windows-1252 do Excel.
  const binario = (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf);
  let texto = '';
  if (!binario)
    try {
      texto = new TextDecoder('utf-8', { fatal: true }).decode(b);
    } catch {
      texto = new TextDecoder('windows-1252').decode(b);
    }
  const wb = binario ? XLSX.read(b) : XLSX.read(texto.replace(/^\uFEFF/, ''), { type: 'string' });
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
 * Quem está como "Pioneiro auxiliar" (sem ser permanente) fica designado em `mesAuxiliar`.
 * Quando o grupo traz um nome entre parênteses, define como superintendente o irmão do grupo
 * com esse primeiro nome (preferindo anciãos), se ainda não houver um.
 */
export function aplicarPlanilha(db: Db, previa: PreviaPlanilha, atualizarExistentes: boolean, mesAuxiliar: string) {
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
    inativo: l.inativo,
    auxiliarPermanente: l.auxiliar === 'permanente',
    grupoId: grupoId(l.grupo),
  });
  const marcarMes = (p: Publicador, l: LinhaPlanilha) => {
    if (l.auxiliar === 'mes' && !p.auxiliarMeses.includes(mesAuxiliar)) p.auxiliarMeses = [...p.auxiliarMeses, mesAuxiliar].sort();
  };

  let criados = 0;
  let atualizados = 0;
  for (const l of previa.novos) {
    const p = novoPublicador({ nome: l.nome, ...dados(l) });
    marcarMes(p, l);
    db.publicadores.push(p);
    criados++;
  }
  if (atualizarExistentes)
    for (const { linha, publicador } of previa.existentes) {
      const p = db.publicadores.find((x) => x.id === publicador.id);
      if (!p) continue;
      Object.assign(p, dados(linha));
      marcarMes(p, linha);
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
