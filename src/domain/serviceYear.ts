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

export type Situacao = 'ativo' | 'irregular' | 'inativo' | 'sem_dados';

/**
 * Inativo: não participou em nenhum dos últimos 6 meses.
 * Irregular: deixou de participar em ao menos um dos últimos 6 meses.
 * Considera apenas meses que já foram importados para a congregação.
 */
export function situacao(p: Publicador, mesesComDados: Set<string>, ate = mesRelatorioAtual()): Situacao {
  const janela = ultimosMeses(6, ate).filter((k) => mesesComDados.has(k));
  if (janela.length === 0) return 'sem_dados';
  const participou = janela.filter((k) => p.relatorios[k]?.participou).length;
  if (participou === 0 && janela.length === 6) return 'inativo';
  if (participou < janela.length) return 'irregular';
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
