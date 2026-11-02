import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarRange,
  Clock,
  Droplets,
  FileInput,
  Flag,
  FileSpreadsheet,
  PieChart,
  Plus,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import { mesesComDados, useStore } from '../store/store';
import type { Publicador } from '../domain/types';
import { anoServicoDe, MESES_ANO_SERVICO, mesesDoAnoServico, mesRelatorioAtual, nomeMes, situacao, totalComCreditos, ultimosMeses } from '../domain/serviceYear';
import { statusDoMes } from '../domain/relatorios';
import { Avatar, BadgeSituacao, Toggle } from '../components/ui';

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (chave: string) => MES_CURTO[Number(chave.slice(5, 7)) - 1];
const META_ANO_PIONEIRO = 600;
const META_MES_PIONEIRO = 50;
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

type HorasPioneiro = { p: Publicador; horas: number; comCredito: number };

/**
 * Horas de cada pioneiro regular no ano de serviço contra a meta de 600; o risco marca onde já deveria estar.
 * Com crédito, vale o total do mês (horas + créditos aprovados).
 */
function MetaPioneiros({ anoServico, decorridos, lista: pioneiros }: { anoServico: number; decorridos: number; lista: HorasPioneiro[] }) {
  const { navegar } = useStore();
  const [comCredito, setComCredito] = useState(true);
  const lista = useMemo(() => {
    const esperado = META_MES_PIONEIRO * decorridos;
    const restantes = 12 - decorridos;
    return pioneiros
      .map(({ p, ...h }) => {
        const horas = comCredito ? h.comCredito : h.horas;
        return { p, horas, esperado, diff: horas - esperado, porMes: restantes ? Math.max(0, Math.ceil((META_ANO_PIONEIRO - horas) / restantes)) : 0 };
      })
      .sort((a, b) => a.diff - b.diff || a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
  }, [pioneiros, decorridos, comCredito]);
  const noRitmo = lista.filter((x) => x.diff >= 0).length;
  const horas = lista.reduce((s, x) => s + x.horas, 0);
  const esperado = META_MES_PIONEIRO * decorridos * lista.length;
  const marca = `${(decorridos / 12) * 100}%`;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 dark:from-emerald-500/10 dark:to-teal-500/5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="text-emerald-600">
              <Flag size={18} />
            </span>
            Pioneiros regulares · meta de {META_ANO_PIONEIRO} horas
          </h2>
          <p className="text-sm text-slate-500">
            Ano de serviço {anoServico} · {decorridos} de 12 meses · cada um já deveria ter {META_MES_PIONEIRO * decorridos} h
          </p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm" title="Com crédito: horas + créditos aprovados de cada mês">
            <Toggle cor="emerald" checked={comCredito} onChange={(e) => setComCredito(e.target.checked)} />
            {comCredito ? 'Com crédito de horas' : 'Sem crédito de horas'}
          </label>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {noRitmo}
              <span className="text-base font-normal text-slate-400"> / {lista.length}</span>
            </p>
            <p className="text-xs text-slate-500">no ritmo</p>
          </div>
          <div>
            <p className={`text-2xl font-semibold tabular-nums ${horas >= esperado ? 'text-emerald-600' : 'text-amber-600'}`}>{pct(horas, esperado)}%</p>
            <p className="text-xs text-slate-500">
              {horas.toLocaleString('pt-BR')} de {esperado.toLocaleString('pt-BR')} h
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-5">
        {/* Régua dos meses: o mês destacado é onde a meta está agora. */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="w-32 shrink-0 sm:w-44" />
          <div className="relative h-3 flex-1">
            {MESES_ANO_SERVICO.map((m, i) => (
              <span
                key={m}
                className={`absolute -translate-x-full pr-0.5 ${i + 1 === decorridos ? 'font-semibold text-slate-700 dark:text-slate-200' : 'hidden sm:inline'}`}
                style={{ left: `${((i + 1) / 12) * 100}%` }}
              >
                {m.slice(0, 3).toLowerCase()}
              </span>
            ))}
          </div>
          <span className="w-24 shrink-0 sm:w-28" />
        </div>

        {lista.length === 0 && <p className="py-2 text-sm text-slate-500">Nenhum publicador marcado como pioneiro regular.</p>}
        {lista.map((x) => {
          const atrasado = x.diff < 0;
          const cor = !atrasado ? 'bg-emerald-500' : x.horas >= x.esperado * 0.9 ? 'bg-amber-400' : 'bg-rose-400';
          return (
            <button
              key={x.p.id}
              className="group flex w-full items-center gap-3 text-left text-sm"
              title={`${x.p.nome}: ${x.horas} h de ${x.esperado} h esperadas até agora${x.porMes && x.horas < META_ANO_PIONEIRO ? ` · precisa de ${x.porMes} h/mês para fechar ${META_ANO_PIONEIRO}` : ''}`}
              onClick={() => navegar({ nome: 'publicador', id: x.p.id })}
            >
              <span className="w-32 shrink-0 truncate group-hover:underline sm:w-44">{x.p.nome}</span>
              <div className="relative h-4 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                {/* Divisões de 50 h (um mês de meta). */}
                {Array.from({ length: 11 }, (_, i) => (
                  <span key={i} className="absolute inset-y-1 w-px bg-slate-300/70 dark:bg-slate-600/60" style={{ left: `${((i + 1) / 12) * 100}%` }} />
                ))}
                <div className={`relative h-full rounded-full ${cor}`} style={{ width: `${Math.min(100, (x.horas / META_ANO_PIONEIRO) * 100)}%` }} />
                <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-slate-800 dark:bg-white" style={{ left: marca }} />
              </div>
              <span className="w-24 shrink-0 text-right tabular-nums sm:w-28">
                <span className="font-semibold">{x.horas}</span>
                <span className="text-slate-400"> h </span>
                <span className={`text-xs ${atrasado ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {x.diff > 0 ? '+' : x.diff < 0 ? '−' : ''}
                  {Math.abs(x.diff)}
                </span>
              </span>
            </button>
          );
        })}

        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 rounded-full bg-slate-800 dark:bg-white" /> onde deveria estar ({META_MES_PIONEIRO} h por mês)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-full bg-emerald-500" /> no ritmo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-full bg-amber-400" /> até 10% abaixo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-full bg-rose-400" /> mais atrasado
          </span>
        </div>
      </div>
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

  // Pioneiros regulares: meta de 600 horas no ano de serviço (50 por mês).
  const pioneiros = useMemo(() => {
    // Sem relatório importado, a meta conta até o mês que está sendo relatado.
    const ks = mesesDoAnoServico(anoServico);
    const decorridos = ks.indexOf(ultimoMes ?? mesEsperado) + 1;
    const lista = ativos
      .filter((p) => p.privilegios.includes('pioneiro_regular'))
      .map((p) => {
        const rs = ks.slice(0, decorridos).map((k) => p.relatorios[k]);
        return { p, horas: rs.reduce((s, r) => s + (r?.horas ?? 0), 0), comCredito: rs.reduce((s, r) => s + totalComCreditos(r), 0) };
      });
    return { decorridos, lista };
  }, [ativos, ultimoMes, mesEsperado, anoServico]);

  // Aniversários de batismo no mês corrente.
  const hoje = new Date();
  const anoHoje = hoje.getFullYear();
  const mesHoje = String(hoje.getMonth() + 1).padStart(2, '0');
  const aniversarios = useMemo(
    () =>
      ativos
        .filter((p) => p.batismo && p.batismo.slice(5, 7) === mesHoje)
        .map((p) => ({ p, dia: Number(p.batismo.slice(8, 10)), anos: anoHoje - Number(p.batismo.slice(0, 4)) }))
        .sort((a, b) => a.dia - b.dia || a.p.nome.localeCompare(b.p.nome, 'pt-BR')),
    [ativos, mesHoje, anoHoje],
  );

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

      <MetaPioneiros anoServico={anoServico} {...pioneiros} />

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
        <Cartao titulo="Aniversários de batismo" icone={<Droplets size={18} />} subtitulo={nomeMes(`${anoHoje}-${mesHoje}`).split(' ')[0]}>
          {aniversarios.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum aniversário de batismo neste mês.</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {aniversarios.map((a) => (
                <li key={a.p.id}>
                  <button className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => navegar({ nome: 'publicador', id: a.p.id })}>
                    <span className="w-7 shrink-0 text-center font-semibold tabular-nums text-sky-600 dark:text-sky-400">{a.dia}</span>
                    <span className="flex-1 truncate">{a.p.nome}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {a.anos} {a.anos === 1 ? 'ano' : 'anos'}
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
