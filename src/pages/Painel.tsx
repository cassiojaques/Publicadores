import { useMemo, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarHeart,
  CalendarRange,
  Clock,
  Droplets,
  FileInput,
  FileSpreadsheet,
  PieChart,
  Plus,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import { mesesComDados, useStore } from '../store/store';
import { anoServicoDe, mesesDoAnoServico, mesRelatorioAtual, nomeMes, situacao, ultimosMeses } from '../domain/serviceYear';
import { statusDoMes } from '../domain/relatorios';
import { Avatar, BadgeSituacao } from '../components/ui';

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (chave: string) => MES_CURTO[Number(chave.slice(5, 7)) - 1];
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

function Indicador({ icone, rotulo, valor, detalhe, cor }: { icone: ReactNode; rotulo: string; valor: ReactNode; detalhe?: string; cor: string }) {
  return (
    <div className="card relative overflow-hidden p-4">
      {/* Faixa colorida no topo, na cor do ícone. */}
      <span className={`absolute inset-x-0 top-0 h-1 bg-current opacity-70 ${cor.split(' ').find((c) => c.startsWith('text-'))}`} />
      <div className="flex items-center gap-3">
        <span className={`rounded-lg p-2 ${cor}`}>{icone}</span>
        <span className="text-sm text-slate-500">{rotulo}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

function Cartao({ titulo, icone, subtitulo, className = '', children }: { titulo: string; icone: ReactNode; subtitulo?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`card p-5 ${className}`}>
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="text-indigo-500">{icone}</span> {titulo}
      </h2>
      {subtitulo && <div className="text-sm text-slate-500">{subtitulo}</div>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Barra horizontal de proporção com rótulo e valor. */
function Barra({ rotulo, valor, total, cor = 'bg-indigo-500', detalhe }: { rotulo: ReactNode; valor: number; total: number; cor?: string; detalhe?: string }) {
  return (
    <div>
      <div className="flex justify-between gap-2 text-sm">
        <span className="truncate">{rotulo}</span>
        <span className="shrink-0 tabular-nums text-slate-500">{detalhe ?? `${valor} / ${total}`}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct(valor, total)}%` }} />
      </div>
    </div>
  );
}

function Linha({ icone, rotulo, valor }: { icone?: ReactNode; rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="flex items-center gap-2 text-slate-500">{icone} {rotulo}</dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

export function Painel() {
  const { db, navegar } = useStore();
  const ativos = useMemo(() => db.publicadores.filter((p) => !p.arquivado), [db.publicadores]);
  const meses = useMemo(() => mesesComDados(db), [db]);
  const ultimoMes = db.importacoes.at(-1)?.mes ?? null;
  const mesEsperado = mesRelatorioAtual();

  const stats = useMemo(() => {
    const sit = ativos.map((p) => ({ p, s: situacao(p, meses) }));
    const doMes = ultimoMes ? ativos.map((p) => p.relatorios[ultimoMes]).filter(Boolean) : [];
    return {
      pioneiros: ativos.filter((p) => p.privilegios.includes('pioneiro_regular') || p.privilegios.includes('pioneiro_especial')).length,
      anciaos: ativos.filter((p) => p.privilegios.includes('anciao')).length,
      servos: ativos.filter((p) => p.privilegios.includes('servo_ministerial')).length,
      atencao: sit.filter((x) => x.s === 'inativo'),
      participaram: doMes.filter((r) => r!.participou).length,
      estudos: doMes.reduce((s, r) => s + (r!.estudos ?? 0), 0),
      horas: doMes.reduce((s, r) => s + (r!.horas ?? 0), 0),
      auxiliares: doMes.filter((r) => r!.auxiliar).length,
      semGrupo: ativos.filter((p) => !p.grupoId).length,
    };
  }, [ativos, meses, ultimoMes]);

  // Participação mês a mês nos últimos 12 meses.
  const historico = useMemo(
    () =>
      ultimosMeses(12, ultimoMes ?? mesEsperado).map((k) => ({
        k,
        temDados: meses.has(k),
        participaram: ativos.filter((p) => p.relatorios[k]?.participou).length,
        estudos: ativos.reduce((s, p) => s + (p.relatorios[k]?.estudos ?? 0), 0),
      })),
    [ativos, meses, ultimoMes, mesEsperado],
  );
  const maxHist = Math.max(1, ...historico.map((h) => h.participaram));
  const comDados = historico.filter((h) => h.temDados);
  const mediaPart = comDados.length ? Math.round(comDados.reduce((s, h) => s + h.participaram, 0) / comDados.length) : 0;

  // Entrega do último relatório por grupo de campo.
  const porGrupo = useMemo(() => {
    if (!ultimoMes) return [];
    const linhas = statusDoMes(db, ultimoMes, meses);
    const grupos = [...db.grupos.map((g) => ({ id: g.id as string | null, nome: g.nome })), { id: null, nome: 'Sem grupo' }];
    return grupos
      .map((g) => {
        const doGrupo = linhas.filter((l) => l.p.grupoId === g.id && l.status !== 'inativo');
        return { ...g, relatou: doGrupo.filter((l) => l.status === 'relatou').length, total: doGrupo.length };
      })
      .filter((g) => g.total > 0);
  }, [db, meses, ultimoMes]);
  const faltam = porGrupo.reduce((s, g) => s + g.total - g.relatou, 0);

  const composicao = useMemo(
    () => ({
      irmaos: ativos.filter((p) => p.sexo === 'M').length,
      irmas: ativos.filter((p) => p.sexo === 'F').length,
      batizados: ativos.filter((p) => p.batizado).length,
      naoBatizados: ativos.filter((p) => !p.batizado).length,
      ungidos: ativos.filter((p) => p.esperanca === 'ungido').length,
      auxPermanentes: ativos.filter((p) => p.auxiliarPermanente).length,
    }),
    [ativos],
  );

  // Totais do ano de serviço do último relatório.
  const anoServico = anoServicoDe(ultimoMes ?? mesEsperado);
  const ano = useMemo(() => {
    const ks = mesesDoAnoServico(anoServico).filter((k) => meses.has(k));
    let horas = 0;
    let estudos = 0;
    let relatorios = 0;
    let auxiliares = 0;
    for (const p of ativos)
      for (const k of ks) {
        const r = p.relatorios[k];
        if (!r?.participou) continue;
        relatorios++;
        horas += r.horas ?? 0;
        estudos += r.estudos ?? 0;
        if (r.auxiliar) auxiliares++;
      }
    return { meses: ks.length, horas, relatorios, auxiliares, mediaEstudos: ks.length ? Math.round(estudos / ks.length) : 0 };
  }, [ativos, meses, anoServico]);

  // Aniversários de nascimento e de batismo no mês corrente.
  const hoje = new Date();
  const anoHoje = hoje.getFullYear();
  const mesHoje = String(hoje.getMonth() + 1).padStart(2, '0');
  const aniversarios = useMemo(() => {
    const lista: { p: (typeof ativos)[number]; dia: number; anos: number; tipo: 'nascimento' | 'batismo' }[] = [];
    for (const p of ativos)
      for (const tipo of ['nascimento', 'batismo'] as const) {
        const d = p[tipo];
        if (!d || d.slice(5, 7) !== mesHoje) continue;
        lista.push({ p, tipo, dia: Number(d.slice(8, 10)), anos: anoHoje - Number(d.slice(0, 4)) });
      }
    return lista.sort((a, b) => a.dia - b.dia || a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
  }, [ativos, mesHoje, anoHoje]);

  if (db.publicadores.length === 0)
    return (
      <div className="mx-auto max-w-2xl space-y-4 pt-10 text-center">
        <h1 className="text-2xl font-semibold">Bem-vindo{db.congregacao.nome ? `, ${db.congregacao.nome}` : ''}!</h1>
        <p className="text-slate-500">Comece cadastrando os grupos de campo e os publicadores, ou importe-os de uma planilha.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => navegar({ nome: 'importar' })}>
            <FileSpreadsheet size={16} /> Importar planilha
          </button>
          <button className="btn-outline" onClick={() => navegar({ nome: 'grupos' })}>
            <UsersRound size={16} /> Criar grupos
          </button>
          <button className="btn-outline" onClick={() => navegar({ nome: 'publicadores' })}>
            <Plus size={16} /> Adicionar publicadores
          </button>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Painel</h1>
          <p className="text-sm text-slate-500">{db.congregacao.nome}</p>
        </div>
        {ultimoMes !== mesEsperado && (
          <button className="btn-outline" onClick={() => navegar({ nome: 'importar' })}>
            <FileInput size={16} /> Importar relatório de {nomeMes(mesEsperado)}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador icone={<Users size={18} />} cor="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15" rotulo="Publicadores" valor={ativos.length} detalhe={`${stats.anciaos} anciãos · ${stats.servos} servos`} />
        <Indicador icone={<UsersRound size={18} />} cor="bg-sky-100 text-sky-600 dark:bg-sky-500/15" rotulo="Grupos de campo" valor={db.grupos.length} detalhe={stats.semGrupo ? `${stats.semGrupo} sem grupo` : 'Todos em grupos'} />
        <Indicador icone={<UserCheck size={18} />} cor="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15" rotulo="Pioneiros" valor={stats.pioneiros} detalhe={ultimoMes ? `+ ${stats.auxiliares} auxiliares em ${mesCurto(ultimoMes)}` : undefined} />
        <Indicador icone={<AlertTriangle size={18} />} cor="bg-amber-100 text-amber-600 dark:bg-amber-500/15" rotulo="Inativos" valor={stats.atencao.length} detalhe={`${pct(stats.atencao.length, ativos.length)}% dos publicadores`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao
          titulo="Último relatório"
          icone={<FileInput size={18} />}
          subtitulo={
            ultimoMes && (
              <button className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => navegar({ nome: 'relatorios', mes: ultimoMes })}>
                {nomeMes(ultimoMes)} · ver relatórios
              </button>
            )
          }
        >
          {ultimoMes ? (
            <dl className="space-y-3 text-sm">
              <Linha icone={<UserCheck size={16} />} rotulo="Participaram" valor={`${stats.participaram} / ${ativos.length}`} />
              <Linha icone={<BookOpen size={16} />} rotulo="Estudos bíblicos" valor={stats.estudos} />
              <Linha icone={<Users size={16} />} rotulo="Pioneiros auxiliares" valor={stats.auxiliares} />
              <Linha icone={<Clock size={16} />} rotulo="Horas (pioneiros)" valor={stats.horas} />
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Nenhum relatório importado ainda.</p>
          )}
        </Cartao>

        <Cartao
          titulo="Participação nos últimos 12 meses"
          icone={<TrendingUp size={18} />}
          subtitulo={comDados.length ? `Média de ${mediaPart} publicadores por mês` : 'Sem relatórios no período'}
          className="lg:col-span-2"
        >
          <div className="flex h-40 items-end gap-1.5 sm:gap-2">
            {historico.map((h) => (
              <div key={h.k} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${nomeMes(h.k)}: ${h.temDados ? `${h.participaram} participaram · ${h.estudos} estudos` : 'sem relatório'}`}>
                <span className="text-[10px] tabular-nums text-slate-500">{h.temDados ? h.participaram : ''}</span>
                <div
                  className={`w-full rounded-t-md ${h.temDados ? (h.k === ultimoMes ? 'bg-indigo-600' : 'bg-indigo-300 dark:bg-indigo-500/50') : 'bg-slate-100 dark:bg-slate-800'}`}
                  style={{ height: h.temDados ? `${Math.max(4, (h.participaram / maxHist) * 100)}%` : '4px' }}
                />
                <span className="text-[10px] text-slate-500">{mesCurto(h.k)}</span>
              </div>
            ))}
          </div>
        </Cartao>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Cartao titulo="Entrega por grupo" icone={<UsersRound size={18} />} subtitulo={ultimoMes ? `${nomeMes(ultimoMes)} · ${faltam ? `faltam ${faltam}` : 'todos entregaram'}` : undefined}>
          {porGrupo.length ? (
            <div className="space-y-3">
              {porGrupo.map((g) => (
                <Barra key={g.id ?? 'sem'} rotulo={g.nome} valor={g.relatou} total={g.total} cor={g.relatou === g.total ? 'bg-emerald-500' : 'bg-indigo-500'} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhum relatório importado ainda.</p>
          )}
        </Cartao>

        <Cartao titulo="Composição" icone={<PieChart size={18} />} subtitulo={`${ativos.length} publicadores`}>
          <div className="space-y-3">
            <Barra rotulo="Irmãos" valor={composicao.irmaos} total={ativos.length} cor="bg-sky-500" detalhe={`${composicao.irmaos} · ${pct(composicao.irmaos, ativos.length)}%`} />
            <Barra rotulo="Irmãs" valor={composicao.irmas} total={ativos.length} cor="bg-rose-400" detalhe={`${composicao.irmas} · ${pct(composicao.irmas, ativos.length)}%`} />
            <Barra rotulo="Batizados" valor={composicao.batizados} total={ativos.length} cor="bg-emerald-500" detalhe={`${composicao.batizados} · ${pct(composicao.batizados, ativos.length)}%`} />
            <dl className="space-y-2 pt-1 text-sm">
              <Linha rotulo="Não batizados" valor={composicao.naoBatizados} />
              <Linha rotulo="Pioneiros auxiliares permanentes" valor={composicao.auxPermanentes} />
              {composicao.ungidos > 0 && <Linha rotulo="Ungidos" valor={composicao.ungidos} />}
            </dl>
          </div>
        </Cartao>

        <Cartao titulo={`Ano de serviço ${anoServico}`} icone={<CalendarRange size={18} />} subtitulo={`${ano.meses} de 12 meses com relatório`}>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct(ano.meses, 12)}%` }} />
          </div>
          <dl className="space-y-3 text-sm">
            <Linha icone={<FileInput size={16} />} rotulo="Relatórios entregues" valor={ano.relatorios} />
            <Linha icone={<BookOpen size={16} />} rotulo="Estudos por mês (média)" valor={ano.mediaEstudos} />
            <Linha icone={<Users size={16} />} rotulo="Meses de pioneiro auxiliar" valor={ano.auxiliares} />
            <Linha icone={<Clock size={16} />} rotulo="Horas (pioneiros)" valor={ano.horas.toLocaleString('pt-BR')} />
          </dl>
        </Cartao>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao titulo="Aniversários do mês" icone={<CalendarHeart size={18} />} subtitulo={nomeMes(`${anoHoje}-${mesHoje}`).split(' ')[0]}>
          {aniversarios.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum aniversário de nascimento ou batismo neste mês.</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {aniversarios.map((a) => (
                <li key={`${a.p.id}-${a.tipo}`}>
                  <button className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => navegar({ nome: 'publicador', id: a.p.id })}>
                    <span className="w-7 shrink-0 text-center font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">{a.dia}</span>
                    <span className="flex-1 truncate">{a.p.nome}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                      {a.tipo === 'batismo' ? <Droplets size={13} className="text-sky-500" /> : <CalendarHeart size={13} className="text-rose-500" />}
                      {a.tipo === 'batismo' ? `${a.anos} ${a.anos === 1 ? 'ano' : 'anos'} de batismo` : `${a.anos} anos`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Precisam de atenção" icone={<AlertTriangle size={18} />} subtitulo={stats.atencao.length > 8 ? `Mostrando 8 de ${stats.atencao.length}` : undefined} className="lg:col-span-2">
          {stats.atencao.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum publicador inativo.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {stats.atencao.slice(0, 8).map(({ p, s }) => (
                <li key={p.id}>
                  <button className="flex w-full items-center gap-3 py-2 text-left text-sm" onClick={() => navegar({ nome: 'publicador', id: p.id })}>
                    <Avatar nome={p.nome} tamanho={28} />
                    <span className="flex-1">{p.nome}</span>
                    <span className="text-xs text-slate-400">{db.grupos.find((g) => g.id === p.grupoId)?.nome ?? 'Sem grupo'}</span>
                    <BadgeSituacao s={s} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}
