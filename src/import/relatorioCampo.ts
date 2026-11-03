import type { Db, Publicador, RelatorioMes } from '../domain/types';
import { auxiliarNoMes, novoPublicador } from '../domain/types';
import { chaveMes, mesRelatorioAtual } from '../domain/serviceYear';

/**
 * Importador do relatório de campo mensal.
 *
 * Planilha (.xlsx/.csv ou colada do Google Planilhas), primeira linha = cabeçalho:
 *   Nome | Participou | Estudos | Horas | Observações | Enviado em
 * Sem coluna de mês, o mês sai de "Enviado em" (o mês anterior ao envio) e pode ser trocado na prévia.
 *
 * JSON também é aceito:
 *   [ {nome, mes, participou, estudos, auxiliar, horas, observacoes}, ... ]
 *   { mes: "2026-09", relatorios: [ {nome, participou, ...}, ... ] }
 * Os nomes de campo são procurados por apelidos (ver ALIASES).
 */
export interface LinhaImportada {
  mes: string; // AAAA-MM
  id?: string;
  nome: string;
  relatorio: RelatorioMes;
}

/** Linha lida do arquivo, antes de definir o mês (planilhas não trazem o mês). */
export interface LinhaLida extends Omit<LinhaImportada, 'mes'> {
  mes: string | null;
  /** Mês sugerido pela data de envio: o anterior ao envio. */
  mesEnvio: string | null;
}

const ALIASES = {
  id: ['id', 'publicadorId', 'publisherId', 'codigo'],
  nome: ['nome', 'name', 'publicador', 'publisher', 'nomeCompleto'],
  mes: ['mes', 'month', 'periodo', 'competencia', 'data'],
  ano: ['ano', 'year'],
  participou: ['participou', 'participouNoMinisterio', 'participou_no_ministerio', 'shared', 'pregou'],
  estudos: ['estudos', 'estudosBiblicos', 'estudos_biblicos', 'bibleStudies', 'studies'],
  auxiliar: ['auxiliar', 'pioneiroAuxiliar', 'pioneiro_auxiliar', 'auxiliaryPioneer'],
  horas: ['horas', 'hours'],
  creditos: ['creditos', 'créditos', 'credito', 'crédito', 'creditosHoras', 'credits'],
  obs: ['obs', 'observacoes', 'observações', 'observacao', 'observação', 'comentarios', 'remarks', 'notes'],
  enviado: ['enviado em', 'enviadoEm', 'enviado', 'data de envio', 'carimbo de data/hora', 'timestamp'],
};

function pegar(o: Record<string, unknown>, chaves: string[]): unknown {
  for (const k of chaves) if (k in o) return o[k];
  const lower = Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of chaves) if (k.toLowerCase() in lower) return lower[k.toLowerCase()];
  return undefined;
}

function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  if (typeof v === 'string') return ['sim', 's', 'yes', 'y', 'true', '1', 'x'].includes(v.trim().toLowerCase());
  return false;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function normalizarMes(v: unknown, ano?: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})/))) return chaveMes(+m[1], +m[2]);
  if ((m = s.match(/^(\d{1,2})[/-](\d{4})$/))) return chaveMes(+m[2], +m[1]);
  if ((m = s.match(/^\d{1,2}[/-](\d{1,2})[/-](\d{4})$/))) return chaveMes(+m[2], +m[1]);
  if (/^\d{1,2}$/.test(s) && ano) return chaveMes(Number(ano), Number(s));
  return null;
}

export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mês anterior à data de envio ("01/11/2026, 15:19" → "2026-10"). */
export function mesDoEnvio(v: unknown): string | null {
  let d: Date | null = null;
  if (v instanceof Date && !isNaN(+v)) d = v;
  else if (typeof v === 'string') {
    const br = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const iso = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (br) d = new Date(+br[3], +br[2] - 1, +br[1]);
    else if (iso) d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
  }
  return d ? mesRelatorioAtual(d) : null;
}

function deObjetos(lista: unknown[], mesGeral: string | null, ignorarSemNome: boolean): LinhaLida[] {
  const out: LinhaLida[] = [];
  lista.forEach((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`Registro ${i + 1} inválido.`);
    const o = item as Record<string, unknown>;
    const mes = normalizarMes(pegar(o, ALIASES.mes), pegar(o, ALIASES.ano)) ?? mesGeral;
    const nome = String(pegar(o, ALIASES.nome) ?? '').trim().replace(/\s+/g, ' ');
    if (!nome) {
      if (ignorarSemNome) return;
      throw new Error(`Registro ${i + 1}: nome do publicador não informado.`);
    }
    const horas = numero(pegar(o, ALIASES.horas));
    const estudos = numero(pegar(o, ALIASES.estudos));
    const creditos = numero(pegar(o, ALIASES.creditos));
    const p = pegar(o, ALIASES.participou);
    const id = pegar(o, ALIASES.id);
    out.push({
      mes,
      mesEnvio: mesDoEnvio(pegar(o, ALIASES.enviado)),
      id: id === undefined || id === '' ? undefined : String(id),
      nome,
      relatorio: {
        // Se o campo não vier, considera que participou quem relatou horas ou estudos.
        participou: p === undefined || p === '' ? (horas ?? 0) > 0 || (estudos ?? 0) > 0 : bool(p),
        estudos,
        auxiliar: bool(pegar(o, ALIASES.auxiliar)),
        horas,
        ...(creditos !== null && { creditos }),
        obs: String(pegar(o, ALIASES.obs) ?? '').trim(),
      },
    });
  });
  return out;
}

/** Lê o JSON sem exigir o mês (a prévia pede o mês quando faltar). */
export function lerJsonRelatorio(texto: string): LinhaLida[] {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  let mesGeral: string | null = null;
  let lista: unknown[];
  if (Array.isArray(dados)) lista = dados;
  else if (dados && typeof dados === 'object') {
    const o = dados as Record<string, unknown>;
    mesGeral = normalizarMes(pegar(o, ALIASES.mes), pegar(o, ALIASES.ano));
    const arr = Object.values(o).find(Array.isArray);
    if (!arr) throw new Error('Não encontrei a lista de relatórios dentro do JSON.');
    lista = arr;
  } else throw new Error('Formato de JSON não reconhecido.');

  return deObjetos(lista, mesGeral, false);
}

export function analisarJson(texto: string): LinhaImportada[] {
  return lerJsonRelatorio(texto).map((l, i) => {
    if (!l.mes) throw new Error(`Registro ${i + 1} (${l.nome}): mês não informado.`);
    return { id: l.id, nome: l.nome, relatorio: l.relatorio, mes: l.mes };
  });
}

/** Planilha .xlsx/.xls/.ods/.csv com cabeçalho na primeira linha. */
export async function lerPlanilhaRelatorio(arquivo: ArrayBuffer): Promise<LinhaLida[]> {
  const XLSX = await import('xlsx');
  const b = new Uint8Array(arquivo);
  const binario = (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf);
  if (!binario) {
    let texto: string;
    try {
      texto = new TextDecoder('utf-8', { fatal: true }).decode(b);
    } catch {
      texto = new TextDecoder('windows-1252').decode(b);
    }
    return lerColadoRelatorio(texto.replace(/^\uFEFF/, ''));
  }
  const wb = XLSX.read(b, { cellDates: true });
  const aba = wb.Sheets[wb.SheetNames[0]];
  return deObjetos(XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: '', raw: true }), null, true);
}

/** Texto copiado de uma planilha (tabulação) ou CSV (; ou ,), com o cabeçalho na primeira linha. */
export function lerColadoRelatorio(texto: string): LinhaLida[] {
  const linhas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const sep = linhas[0].includes('\t') ? '\t' : linhas[0].includes(';') ? ';' : ',';
  const celulas = (l: string) => (sep === ',' ? l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/) : l.split(sep)).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const cab = celulas(linhas[0]);
  const objs = linhas.slice(1).map((l) => {
    const cel = celulas(l);
    return Object.fromEntries(cab.map((c, i) => [c, cel[i] ?? '']));
  });
  return deObjetos(objs, null, true);
}

/** Mês mais comum entre as datas de envio; sem datas, o mês anterior ao atual. */
export function mesSugerido(linhas: LinhaLida[]): string {
  const conta = new Map<string, number>();
  for (const l of linhas) if (l.mesEnvio) conta.set(l.mesEnvio, (conta.get(l.mesEnvio) ?? 0) + 1);
  return [...conta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? mesRelatorioAtual();
}

/** Completa o mês de quem não trouxe mês no arquivo. */
export function comMes(linhas: LinhaLida[], mes: string): LinhaImportada[] {
  return linhas.map((l) => ({ id: l.id, nome: l.nome, relatorio: l.relatorio, mes: l.mes ?? mes }));
}

/** Pioneiro regular/especial, missionário ou auxiliar permanente: relatam horas normalmente. */
export function relataHoras(p: Publicador): boolean {
  return p.auxiliarPermanente || p.privilegios.some((x) => x === 'pioneiro_regular' || x === 'pioneiro_especial' || x === 'missionario');
}

/** Inativo que participou no mês mais recente do seu histórico volta a ser ativo. */
function reativaria(p: Publicador, linha: LinhaImportada): boolean {
  if (!p.inativo || !linha.relatorio.participou) return false;
  return Object.keys(p.relatorios).every((m) => m <= linha.mes);
}

export interface ItemPrevia {
  linha: LinhaImportada;
  publicador: Publicador | null;
  /** Já existia relatório deste mês para o publicador. */
  sobrescreve: boolean;
  /** Publicador marcado como inativo que voltou a participar — será reativado. */
  reativa: boolean;
}

export interface Previa {
  meses: string[];
  itens: ItemPrevia[];
  /** Publicadores (não arquivados) sem relatório nos meses importados. */
  semRelatorio: Publicador[];
}

export function prever(db: Db, linhas: LinhaImportada[]): Previa {
  const porNome = new Map(db.publicadores.map((p) => [normalizarNome(p.nome), p]));
  const porId = new Map(db.publicadores.map((p) => [p.id, p]));
  const itens = linhas.map((l) => {
    const publicador = (l.id && porId.get(l.id)) || porNome.get(normalizarNome(l.nome)) || null;
    // Quem foi designado pioneiro auxiliar (no mês ou permanente) conta como auxiliar mesmo que o arquivo não diga.
    const auxiliar = l.relatorio.auxiliar || (!!publicador && auxiliarNoMes(publicador, l.mes));
    const linha = { ...l, relatorio: { ...l.relatorio, auxiliar } };
    return {
      linha,
      publicador,
      sobrescreve: !!publicador?.relatorios[linha.mes],
      reativa: !!publicador && reativaria(publicador, linha),
    };
  });
  const meses = [...new Set(linhas.map((l) => l.mes))].sort();
  const relataram = new Set(itens.filter((i) => i.publicador).map((i) => `${i.publicador!.id}|${i.linha.mes}`));
  const semRelatorio = db.publicadores.filter(
    (p) => !p.arquivado && meses.some((m) => !relataram.has(`${p.id}|${m}`)),
  );
  return { meses, itens, semRelatorio };
}

/** Grava os relatórios no banco. Retorna quantos registros foram aplicados. */
export function aplicar(db: Db, previa: Previa, arquivo: string, criarNaoEncontrados: boolean): number {
  let n = 0;
  for (const item of previa.itens) {
    let p = item.publicador ? db.publicadores.find((x) => x.id === item.publicador!.id) : undefined;
    if (!p && criarNaoEncontrados) {
      p = novoPublicador({ nome: item.linha.nome });
      db.publicadores.push(p);
    }
    if (!p) continue;
    if (reativaria(p, item.linha)) p.inativo = false;
    // Créditos costumam ser digitados no cartão: sem a coluna na importação, mantém os que já existiam.
    const creditos = p.relatorios[item.linha.mes]?.creditos;
    p.relatorios[item.linha.mes] = { ...(creditos != null && { creditos }), ...item.linha.relatorio };
    // Marcar/desmarcar PA na prévia também vale como designação do mês.
    if (!p.auxiliarPermanente) {
      const mes = item.linha.mes;
      const tem = p.auxiliarMeses.includes(mes);
      if (item.linha.relatorio.auxiliar && !tem) p.auxiliarMeses = [...p.auxiliarMeses, mes].sort();
      if (!item.linha.relatorio.auxiliar && tem) p.auxiliarMeses = p.auxiliarMeses.filter((m) => m !== mes);
    }
    n++;
  }
  const data = new Date().toISOString();
  for (const mes of previa.meses) {
    // Reimportar o mesmo mês acrescenta ao histórico; só o registro "mês criado à mão/no cartão" é substituído.
    db.importacoes = db.importacoes.filter((i) => i.mes !== mes || (i.arquivo && i.arquivo !== '(manual)'));
    db.importacoes.push({ mes, arquivo, data, registros: previa.itens.filter((i) => i.linha.mes === mes).length });
  }
  db.importacoes.sort((a, b) => a.mes.localeCompare(b.mes) || a.data.localeCompare(b.data));
  return n;
}
