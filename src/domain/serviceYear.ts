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

export function anosServicoComDados(p: Publicador): number[] {
  const anos = new Set(Object.keys(p.relatorios).map(anoServicoDe));
  anos.add(anoServicoAtual());
  return [...anos].sort((a, b) => b - a);
}

export function totaisAnoServico(p: Publicador, anoServico: number) {
  let horas = 0;
  let mesesParticipou = 0;
  let estudos = 0;
  for (const k of mesesDoAnoServico(anoServico)) {
    const r = p.relatorios[k];
    if (!r) continue;
    horas += r.horas ?? 0;
    estudos += r.estudos ?? 0;
    if (r.participou) mesesParticipou++;
  }
  return { horas, mesesParticipou, estudos };
}

export type Situacao = 'ativo' | 'inativo';

/**
 * Inativo: marcado manualmente, ou não participou em nenhum dos últimos 6 meses
 * (considerando apenas meses que já têm relatórios na congregação). Os demais são ativos.
 */
export function situacao(p: Publicador, mesesComDados: Set<string>, ate = mesRelatorioAtual()): Situacao {
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

const MESES_POR_NOME = Object.fromEntries(
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
