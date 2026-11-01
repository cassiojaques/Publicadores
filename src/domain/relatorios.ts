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

/** Nomes de quem falta, separados por grupo — para colar numa mensagem ou planilha. */
export function textoFaltantes(db: Db, linhas: LinhaMes[]): string {
  const faltam = linhas.filter((l) => l.status === 'falta');
  const grupos = [...db.grupos.map((g) => ({ id: g.id as string | null, nome: g.nome })), { id: null, nome: 'Sem grupo' }];
  return grupos
    .map((g) => {
      const nomes = faltam
        .filter((l) => l.p.grupoId === g.id)
        .map((l) => l.p.nome)
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
      return nomes.length ? [g.nome, ...nomes].join('\n') : '';
    })
    .filter(Boolean)
    .join('\n\n');
}
