import type { Db, Publicador, RelatorioMes } from '../domain/types';
import { novoPublicador } from '../domain/types';
import { chaveMes } from '../domain/serviceYear';

/**
 * Importador do relatório de campo mensal.
 *
 * PROVISÓRIO: aceita formatos comuns até recebermos o JSON real do outro sistema.
 * Formatos aceitos:
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

const ALIASES = {
  id: ['id', 'publicadorId', 'publisherId', 'codigo'],
  nome: ['nome', 'name', 'publicador', 'publisher', 'nomeCompleto'],
  mes: ['mes', 'month', 'periodo', 'competencia', 'data'],
  ano: ['ano', 'year'],
  participou: ['participou', 'participouNoMinisterio', 'participou_no_ministerio', 'shared', 'pregou'],
  estudos: ['estudos', 'estudosBiblicos', 'estudos_biblicos', 'bibleStudies', 'studies'],
  auxiliar: ['auxiliar', 'pioneiroAuxiliar', 'pioneiro_auxiliar', 'auxiliaryPioneer'],
  horas: ['horas', 'hours'],
  obs: ['obs', 'observacoes', 'observações', 'observacao', 'comentarios', 'remarks', 'notes'],
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

export function analisarJson(texto: string): LinhaImportada[] {
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

  return lista.map((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`Registro ${i + 1} inválido.`);
    const o = item as Record<string, unknown>;
    const mes = normalizarMes(pegar(o, ALIASES.mes), pegar(o, ALIASES.ano)) ?? mesGeral;
    const nome = String(pegar(o, ALIASES.nome) ?? '').trim();
    if (!mes) throw new Error(`Registro ${i + 1} (${nome || 'sem nome'}): mês não informado.`);
    if (!nome) throw new Error(`Registro ${i + 1}: nome do publicador não informado.`);
    const horas = numero(pegar(o, ALIASES.horas));
    const estudos = numero(pegar(o, ALIASES.estudos));
    const p = pegar(o, ALIASES.participou);
    const id = pegar(o, ALIASES.id);
    return {
      mes,
      id: id === undefined ? undefined : String(id),
      nome,
      relatorio: {
        // Se o campo não vier, considera que participou quem relatou horas ou estudos.
        participou: p === undefined ? (horas ?? 0) > 0 || (estudos ?? 0) > 0 : bool(p),
        estudos,
        auxiliar: bool(pegar(o, ALIASES.auxiliar)),
        horas,
        obs: String(pegar(o, ALIASES.obs) ?? ''),
      },
    };
  });
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
  const itens = linhas.map((linha) => {
    const publicador = (linha.id && porId.get(linha.id)) || porNome.get(normalizarNome(linha.nome)) || null;
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
    p.relatorios[item.linha.mes] = item.linha.relatorio;
    n++;
  }
  const data = new Date().toISOString();
  for (const mes of previa.meses) {
    db.importacoes = db.importacoes.filter((i) => i.mes !== mes);
    db.importacoes.push({ mes, arquivo, data, registros: previa.itens.filter((i) => i.linha.mes === mes).length });
  }
  db.importacoes.sort((a, b) => a.mes.localeCompare(b.mes));
  return n;
}
