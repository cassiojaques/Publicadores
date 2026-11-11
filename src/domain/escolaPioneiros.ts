import type { Publicador } from './types';

/** Anos de espera para repetir a escola depois de cursá-la. */
export const ANOS_ENTRE_ESCOLAS = 5;
/** Idade mínima no primeiro dia da escola (menores só com um dos pais/responsável na turma). */
export const IDADE_MINIMA_ESCOLA = 18;

export type MotivoEscola = 'primeira' | 'repeticao' | 'reconvite' | 'outra';

export const DICA_ESCOLA: Record<MotivoEscola, string> = {
  outra: 'o publicador quer fazer em outra data',
  primeira: 'primeira vez (começou como pioneiro até 1.º de setembro do ano anterior)',
  repeticao: `${ANOS_ENTRE_ESCOLAS} anos depois da última escola`,
  reconvite: 'não cursou ou perdeu mais da metade; convidar de novo (confira se continua no serviço de pioneiro sem interrupção)',
};

export interface ProximaEscola {
  ano: number;
  motivo: MotivoEscola;
  /** Quando `motivo` é "outra": o ano que a regra daria e o motivo escrito pelo usuário. */
  anoCalculado?: number | null;
  detalhe?: string;
}

type DadosEscola = Pick<Publicador, 'escolaPioneiros' | 'escolaNaoConcluida' | 'inicioPioneiro'> &
  Partial<Pick<Publicador, 'escolaOutraData' | 'escolaOutroAno' | 'escolaOutroMotivo'>>;

/** Texto de apoio (tooltip) com o motivo, incluindo o que o usuário escreveu em "outra data". */
export function dicaEscola(e: ProximaEscola): string {
  const base = DICA_ESCOLA[e.motivo];
  if (e.motivo !== 'outra') return base;
  return [base + (e.detalhe ? `: ${e.detalhe}` : ''), e.anoCalculado ? `(pela regra seria ${e.anoCalculado})` : ''].filter(Boolean).join(' ');
}

/**
 * Próximo ano da Escola de Pioneiros do publicador, ou null se não há dados para calcular.
 *  - Já cursou em Y: de novo só depois de 5 anos (Y + 5).
 *  - Foi convidado, mas não conseguiu cursar ou perdeu mais da metade das aulas: no ano seguinte (Y + 1).
 *  - Nunca cursou: quem começou como pioneiro até 1.º de setembro do ano X faz a escola em X + 1;
 *    quem começou depois, em X + 2.
 *  - Quer fazer em outra data: vale o ano escolhido (a regra continua disponível em `anoCalculado`).
 */
export function proximaEscola(p: DadosEscola): ProximaEscola | null {
  const calculada = escolaCalculada(p);
  if (p.escolaOutraData && p.escolaOutroAno)
    return { ano: p.escolaOutroAno, motivo: 'outra', anoCalculado: calculada?.ano ?? null, detalhe: (p.escolaOutroMotivo ?? '').trim() };
  return calculada;
}

function escolaCalculada(p: DadosEscola): ProximaEscola | null {
  if (p.escolaPioneiros) {
    return p.escolaNaoConcluida
      ? { ano: p.escolaPioneiros + 1, motivo: 'reconvite' }
      : { ano: p.escolaPioneiros + ANOS_ENTRE_ESCOLAS, motivo: 'repeticao' };
  }
  const [a, m, d] = (p.inicioPioneiro ?? '').split('-').map(Number);
  if (!a || !m || !d) return null;
  const ateSetembro = m < 9 || (m === 9 && d === 1);
  return { ano: a + (ateSetembro ? 1 : 2), motivo: 'primeira' };
}

/** Já com menos de 18 anos no fim do ano da escola (então com certeza menor no primeiro dia). */
export function menorDeIdadeNaEscola(nascimento: string, ano: number): boolean {
  const a = Number(nascimento.split('-')[0]);
  return !!a && ano - a < IDADE_MINIMA_ESCOLA;
}
