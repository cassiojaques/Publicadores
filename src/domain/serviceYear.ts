import type { Publicador, RelatorioMes } from './types';

export const MESES_ANO_SERVICO = [
  'Setembro', 'Outubro', 'Novembro', 'Dezembro', 'Janeiro', 'Fevereiro',
  'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto',
];

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function chaveMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function nomeMes(chave: string): string {
  const [a, m] = chave.split('-').map(Number);
  return `${NOMES_MES[m - 1]} de ${a}`;
}

/** Ano de serviço 2026 = setembro/2025 a agosto/2026. */
export function anoServicoDe(chave: string): number {
  const [a, m] = chave.split('-').map(Number);
  return m >= 9 ? a + 1 : a;
}

/** "Ano de Serviço 2026 (Setembro 2025 – Agosto 2026)". */
export function rotuloAnoServico(anoServico: number): string {
  return `Ano de Serviço ${anoServico} (Setembro ${anoServico - 1} – Agosto ${anoServico})`;
}

export function anoServicoAtual(hoje = new Date()): number {
  return anoServicoDe(chaveMes(hoje.getFullYear(), hoje.getMonth() + 1));
}

/** As 12 chaves "AAAA-MM" de um ano de serviço, de setembro a agosto. */
export function mesesDoAnoServico(anoServico: number): string[] {
  const meses: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((8 + i) % 12) + 1;
    meses.push(chaveMes(m >= 9 ? anoServico - 1 : anoServico, m));
  }
  return meses;
}

/** Mês anterior ao atual — o que normalmente está sendo relatado. */
export function mesRelatorioAtual(hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return chaveMes(d.getFullYear(), d.getMonth() + 1);
}

export function ultimosMeses(n: number, ate: string): string[] {
  const [a, m] = ate.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(a, m - 1 - i, 1);
    out.push(chaveMes(d.getFullYear(), d.getMonth() + 1));
  }
  return out;
}

/** Anos com relatório, mais o atual e os dois anteriores (para poder lançar meses passados). */
export function anosServicoComDados(p: Publicador, hoje = new Date()): number[] {
  const anos = new Set(Object.keys(p.relatorios).map(anoServicoDe));
  const atual = anoServicoAtual(hoje);
  for (let a = atual - 2; a <= atual; a++) anos.add(a);
  return [...anos].sort((a, b) => b - a);
}

/** Horas + créditos aproveitados não passam disso no mês. */
export const LIMITE_HORAS_COM_CREDITO = 55;

/** Créditos aproveitados: só o que cabe até completar 55 h com as horas do mês. */
export function creditosAprovados(r: Pick<RelatorioMes, 'horas' | 'creditos'> | undefined): number {
  const creditos = r?.creditos ?? 0;
  return Math.max(0, Math.min(creditos, LIMITE_HORAS_COM_CREDITO - (r?.horas ?? 0)));
}

export function totalComCreditos(r: Pick<RelatorioMes, 'horas' | 'creditos'> | undefined): number {
  return (r?.horas ?? 0) + creditosAprovados(r);
}

export function totaisAnoServico(p: Publicador, anoServico: number) {
  let horas = 0;
  let mesesParticipou = 0;
  let estudos = 0;
  let creditos = 0;
  let aprovados = 0;
  for (const k of mesesDoAnoServico(anoServico)) {
    const r = p.relatorios[k];
    if (!r) continue;
    horas += r.horas ?? 0;
    estudos += r.estudos ?? 0;
    creditos += r.creditos ?? 0;
    aprovados += creditosAprovados(r);
    if (r.participou) mesesParticipou++;
  }
  return { horas, mesesParticipou, estudos, creditos, aprovados, totalComCreditos: horas + aprovados };
}

/** Dia do mês seguinte até o qual o relatório do mês ainda pode ser entregue. */
export const PRAZO_RELATORIO = 20;

/**
 * Último mês cujo prazo de entrega já passou. Até o dia 20 o mês anterior ainda está
 * sendo relatado e não conta como falta (em 02/11 o último fechado é setembro; em 21/11, outubro).
 */
export function ultimoMesFechado(hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - (hoje.getDate() > PRAZO_RELATORIO ? 1 : 2), 1);
  return chaveMes(d.getFullYear(), d.getMonth() + 1);
}

/**
 * Último mês que conta para o publicador: o mês fechado (prazo até o dia 20) ou, se o relatório
 * dele já foi cadastrado, o mês recém-terminado — sem esperar o prazo.
 */
export function mesReferenciaSituacao(p: Publicador, hoje = new Date()): string {
  const recente = mesRelatorioAtual(hoje);
  return p.relatorios[recente] ? recente : ultimoMesFechado(hoje);
}

export type Situacao = 'ativo' | 'inativo';

/**
 * Inativo: marcado manualmente, ou não participou em nenhum dos últimos 6 meses fechados
 * (considerando apenas meses que já têm relatórios na congregação). Os demais são ativos.
 */
export function situacao(p: Publicador, mesesComDados: Set<string>, ate = mesReferenciaSituacao(p)): Situacao {
  if (p.inativo) return 'inativo';
  const janela = ultimosMeses(6, ate).filter((k) => mesesComDados.has(k));
  if (janela.length === 6 && !janela.some((k) => p.relatorios[k]?.participou)) return 'inativo';
  return 'ativo';
}

export function relatorioVazio(): RelatorioMes {
  return { participou: false, estudos: null, auxiliar: false, horas: null, obs: '' };
}

export function formatarData(iso: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Anos completos desde a data "AAAA-MM-DD" até hoje (idade, tempo de batismo...). null se a data for vazia ou futura. */
export function anosCompletos(iso: string, hoje = new Date()): number | null {
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return null;
  let anos = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) anos--;
  return anos < 0 ? null : anos;
}

/** "34 anos", "1 ano" ou "menos de 1 ano"; '' se não houver data. */
export function textoAnos(iso: string, hoje = new Date()): string {
  const n = anosCompletos(iso, hoje);
  if (n === null) return '';
  return n === 0 ? 'menos de 1 ano' : `${n} ${n === 1 ? 'ano' : 'anos'}`;
}

const MESES_POR_NOME =Object.fromEntries(
  NOMES_MES.map((n, i) => [n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().slice(0, 3), i + 1]),
);

/**
 * Converte uma data digitada ou colada em "AAAA-MM-DD".
 * Aceita 15/03/1990, 15-03-1990, 15.03.1990, 15/3/90, 1990-03-15, 15031990 e "15 de março de 1990".
 * Retorna null se não for uma data válida.
 */
export function interpretarData(texto: string): string | null {
  const s = texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let d: number, m: number, a: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [a, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2}|\d{4})$/))) [d, m, a] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{2})(\d{2})(\d{4})$/))) [d, m, a] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]{3})[a-z]*\.?\s*(?:de\s+)?(\d{4})$/)) && MESES_POR_NOME[r[2]])
    [d, m, a] = [+r[1], MESES_POR_NOME[r[2]], +r[3]];
  else return null;
  if (a < 100) a += a > new Date().getFullYear() % 100 ? 1900 : 2000;
  const data = new Date(a, m - 1, d);
  if (data.getFullYear() !== a || data.getMonth() !== m - 1 || data.getDate() !== d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
