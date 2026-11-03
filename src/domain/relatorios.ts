import { situacao, ultimosMeses } from './serviceYear';
import type { Db, Publicador, RelatorioMes } from './types';

export type StatusMes = 'relatou' | 'falta' | 'inativo';

export interface LinhaMes {
  p: Publicador;
  status: StatusMes;
  r?: RelatorioMes;
}

/**
 * Situação de cada publicador (não arquivado) num mês.
 * Quem não entregou relatório conta como "falta", exceto os inativos — marcados à mão ou
 * há 6 meses sem relatar até o mês anterior — que não são cobrados.
 */
export function statusDoMes(db: Db, mes: string, mesesComDados: Set<string>): LinhaMes[] {
  const anterior = ultimosMeses(2, mes)[0];
  return db.publicadores
    .filter((p) => !p.arquivado)
    .map((p) => {
      const r = p.relatorios[mes];
      if (r) return { p, status: 'relatou' as const, r };
      const inativo = p.inativo || situacao(p, mesesComDados, anterior) === 'inativo';
      return { p, status: inativo ? ('inativo' as const) : ('falta' as const) };
    });
}

export interface Totais {
  relatorios: number;
  estudos: number;
  horas: number;
}

/** Totais do mês como no relatório da congregação (S-1): só quem participou. */
export function totaisDoMes(linhas: LinhaMes[]) {
  const vazio = (): Totais => ({ relatorios: 0, estudos: 0, horas: 0 });
  const t = { publicadores: vazio(), auxiliares: vazio(), regulares: vazio() };
  for (const { p, r } of linhas) {
    if (!r?.participou) continue;
    const regular = p.privilegios.some((x) => x === 'pioneiro_regular' || x === 'pioneiro_especial' || x === 'missionario');
    const alvo = regular ? t.regulares : r.auxiliar ? t.auxiliares : t.publicadores;
    alvo.relatorios++;
    alvo.estudos += r.estudos ?? 0;
    alvo.horas += r.horas ?? 0;
  }
  return t;
}

export interface ResponsavelGrupo {
  funcao: 'Superintendente' | 'Ajudante';
  nome: string;
}

/**
 * Quem falta, por grupo (na ordem dos grupos; "Sem grupo" por último). Grupos sem ninguém faltando ficam de fora.
 * Cada grupo traz também o superintendente e o ajudante, quando definidos.
 */
export function faltantesPorGrupo(db: Db, linhas: LinhaMes[]): { grupo: string; responsaveis: ResponsavelGrupo[]; nomes: string[] }[] {
  const faltam = linhas.filter((l) => l.status === 'falta');
  const nomeDe = (id: string | null) => (id ? db.publicadores.find((p) => p.id === id && !p.arquivado)?.nome : undefined);
  const grupos = [
    ...db.grupos.map((g) => ({ id: g.id as string | null, nome: g.nome, sup: nomeDe(g.superintendenteId), aj: nomeDe(g.ajudanteId) })),
    { id: null, nome: 'Sem grupo', sup: undefined, aj: undefined },
  ];
  return grupos
    .map((g) => ({
      grupo: g.nome,
      responsaveis: [
        ...(g.sup ? [{ funcao: 'Superintendente' as const, nome: g.sup }] : []),
        ...(g.aj ? [{ funcao: 'Ajudante' as const, nome: g.aj }] : []),
      ],
      nomes: faltam
        .filter((l) => (l.p.grupoId ?? null) === g.id)
        .map((l) => l.p.nome)
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    }))
    .filter((g) => g.nomes.length > 0);
}

/** Nomes de quem falta, separados por grupo — para colar numa mensagem ou planilha. */
export function textoFaltantes(db: Db, linhas: LinhaMes[]): string {
  return faltantesPorGrupo(db, linhas)
    .map((g) => [g.grupo, ...g.nomes].join('\n'))
    .join('\n\n');
}
