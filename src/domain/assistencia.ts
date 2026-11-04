import type { AssistenciaReuniao, Db, TipoReuniao } from './types';
import { anoServicoDe, mesesDoAnoServico } from './serviceYear';

export const TIPOS_REUNIAO: { id: TipoReuniao; rotulo: string }[] = [
  { id: 'meio', rotulo: 'Reunião do meio de semana' },
  { id: 'fim', rotulo: 'Reunião do fim de semana' },
];

/** Média de presentes por reunião no mês (total ÷ quantidade de reuniões); null se faltar um dos dados. */
export function mediaMes(a: AssistenciaReuniao | undefined): number | null {
  if (!a || !a.reunioes || a.total === null || a.total === undefined) return null;
  return a.total / a.reunioes;
}

/** Média por mês do ano de serviço: média das médias dos meses que têm dados (como no S-88). */
export function mediaAno(db: Db, anoServico: number, tipo: TipoReuniao): number | null {
  const medias = mesesDoAnoServico(anoServico)
    .map((m) => mediaMes(db.assistencia[m]?.[tipo]))
    .filter((x): x is number => x !== null);
  return medias.length ? medias.reduce((s, x) => s + x, 0) / medias.length : null;
}

/** Anos de serviço com algum dado de assistência, do mais novo ao mais antigo. */
export function anosComAssistencia(db: Db): number[] {
  const anos = new Set<number>();
  for (const [mes, a] of Object.entries(db.assistencia))
    if (a.meio?.reunioes || a.meio?.total || a.fim?.reunioes || a.fim?.total) anos.add(anoServicoDe(mes));
  return [...anos].sort((a, b) => b - a);
}

export const formatarMedia = (n: number | null, separador = ',') => (n === null ? '' : n.toFixed(2).replace('.', separador));
