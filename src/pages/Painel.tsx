import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Droplets,
  FileInput,
  Flag,
  FileSpreadsheet,
  Plus,
  UserCheck,
  Users,
  UsersRound,
  UserX,
} from 'lucide-react';
import { mesesComDados, useStore } from '../store/store';
import type { Publicador } from '../domain/types';
import { anoServicoDe, MESES_ANO_SERVICO, mesesDoAnoServico, mesRelatorioAtual, nomeMes, situacao, totalComCreditos } from '../domain/serviceYear';
import { Avatar, BadgeSituacao, Toggle } from '../components/ui';

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (chave: string) => MES_CURTO[Number(chave.slice(5, 7)) - 1];
const META_ANO_PIONEIRO = 600;
const META_MES_PIONEIRO = 50;
const MESES_SEM_PARTICIPAR = 3;
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

function Indicador({ icone, rotulo, valor, detalhe, cor, onClick }: { icone: ReactNode; rotulo: string; valor: ReactNode; detalhe?: string; cor: string; onClick: () => void }) {
  return (
    <button className="card relative overflow-hidden p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md" onClick={onClick} title={`Ver ${rotulo.toLowerCase()}`}>
      {/* Faixa colorida no topo, na cor do ícone. */}
      <span className={`absolute inset-x-0 top-0 h-1 bg-current opacity-70 ${cor.split(' ').find((c) => c.startsWith('text-'))}`} />
      <div className="flex items-center gap-3">
        <span className={`rounded-lg p-2 ${cor}`}>{icone}</span>
        <span className="text-sm text-slate-500">{rotulo}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
    </button>
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

/** Publicadores há 3 meses ou mais seguidos sem participar no ministério, com uma barra por mês sem relatar. */
function SemParticipar({ ate, lista }: { ate: string | null; lista: { p: Publicador; meses: number }[] }) {
  const { db, navegar } = useStore();
  const ESCALA = 12;
  const faixas = [
    { rotulo: '3 a 5 meses', cor: 'bg-amber-400', n: lista.filter((x) => x.meses < 6).length },
    { rotulo: '6 a 11 meses', cor: 'bg-orange-500', n: lista.filter((x) => x.meses >= 6 && x.meses < 12).length },
    { rotulo: '12 meses ou mais', cor: 'bg-rose-500', n: lista.filter((x) => x.meses >= 12).length },
  ];
  const corDe = (m: number) => (m >= 12 ? 'bg-rose-500' : m >= 6 ? 'bg-orange-500' : 'bg-amber-400');
  return (
    <Cartao
      titulo="Irregulares"
      icone={<UserX size={18} />}
      subtitulo={ate ? `${lista.length} ativos há ${MESES_SEM_PARTICIPAR} meses ou mais sem participar · até ${nomeMes(ate)}` : 'Sem relatórios ainda'}
    >
      {lista.length === 0 ? (
        <p className="text-sm text-slate-500">Todos os ativos participaram em pelo menos um dos últimos {MESES_SEM_PARTICIPAR} meses.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {faixas.map((f) => (
              <span key={f.rotulo} className="flex items-center gap-1.5">
                <span className={`h-2 w-3 rounded-full ${f.cor}`} /> {f.rotulo} <b className="tabular-nums text-slate-700 dark:text-slate-200">{f.n}</b>
              </span>
            ))}
          </div>
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {lista.map((x) => (
              <button
                key={x.p.id}
                className="group flex w-full items-center gap-3 text-left text-sm"
                title={`${x.p.nome}: ${x.meses} meses seguidos sem participar`}
                onClick={() => navegar({ nome: 'publicador', id: x.p.id })}
              >
                <span className="w-32 shrink-0 truncate group-hover:underline sm:w-52">{x.p.nome}</span>
                <span className="hidden w-16 shrink-0 truncate text-xs text-slate-400 sm:inline">{db.grupos.find((g) => g.id === x.p.grupoId)?.nome ?? 'Sem grupo'}</span>
                <div className="relative h-4 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                  {/* Uma divisão por mês. */}
                  {Array.from({ length: ESCALA - 1 }, (_, i) => (
                    <span key={i} className="absolute inset-y-1 w-px bg-slate-300/70 dark:bg-slate-600/60" style={{ left: `${((i + 1) / ESCALA) * 100}%` }} />
                  ))}
                  <div className={`relative h-full rounded-full ${corDe(x.meses)}`} style={{ width: `${(Math.min(x.meses, ESCALA) / ESCALA) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 whitespace-nowrap text-right tabular-nums">
                  <span className="font-semibold">{x.meses > ESCALA ? `${ESCALA}+` : x.meses}</span>
                  <span className="text-slate-400"> {x.meses === 1 ? 'mês' : 'meses'}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Cartao>
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
  const mesEsperado = mesRelatorioAtual();
  // Meses futuros (lançados por engano no cartão) não contam como último relatório.
  const ultimoMes = db.importacoes.filter((i) => i.mes <= mesEsperado).at(-1)?.mes ?? null;

  const stats = useMemo(() => {
    const sit = ativos.map((p) => ({ p, s: situacao(p, meses) }));
    const doMes = ultimoMes ? ativos.map((p) => p.relatorios[ultimoMes]).filter(Boolean) : [];
    return {
      pioneiros: ativos.filter((p) => p.privilegios.includes('pioneiro_regular') || p.privilegios.includes('pioneiro_especial')).length,
      atencao: sit.filter((x) => x.s === 'inativo'),
      auxiliares: doMes.filter((r) => r!.auxiliar).length,
      semGrupo: ativos.filter((p) => !p.grupoId).length,
    };
  }, [ativos, meses, ultimoMes]);

  // Ano de serviço do último relatório.
  const anoServico = anoServicoDe(ultimoMes ?? mesEsperado);
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

  // Meses seguidos sem participar, contados para trás a partir do último mês que já tem relatos
  // (um mês recém-aberto, ainda sem ninguém relatado, não conta como falta).
  // Quem já está inativo fica de fora: aparece no quadro de inativos.
  const semParticipar = useMemo(() => {
    const inativos = new Set(stats.atencao.map((x) => x.p.id));
    const comRelatos = [...meses].filter((k) => k <= mesEsperado && ativos.some((p) => p.relatorios[k]?.participou)).sort().reverse();
    const lista = ativos
      .filter((p) => !inativos.has(p.id))
      .map((p) => {
        const i = comRelatos.findIndex((k) => p.relatorios[k]?.participou);
        return { p, meses: i === -1 ? comRelatos.length : i };
      })
      .filter((x) => x.meses >= MESES_SEM_PARTICIPAR)
      .sort((a, b) => b.meses - a.meses || a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
    return { ate: comRelatos[0] ?? null, lista };
  }, [ativos, meses, mesEsperado, stats.atencao]);

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

  const primeiroAno = aniversarios.filter((a) => a.anos === 1);

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

      {primeiroAno.length > 0 && (
        <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-4 dark:border-sky-500/30 dark:from-sky-500/10 dark:to-indigo-500/5">
          <span className="rounded-full bg-sky-100 p-2 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300">
            <Droplets size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {primeiroAno.length === 1 ? 'Completa' : 'Completam'} 1 ano de batismo em {nomeMes(`${anoHoje}-${mesHoje}`).split(' ')[0].toLowerCase()}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {primeiroAno.map((a) => (
                <button
                  key={a.p.id}
                  className="rounded-full bg-white px-3 py-1 text-sm shadow-sm ring-1 ring-sky-200 hover:ring-sky-400 dark:bg-slate-900 dark:ring-sky-500/30"
                  onClick={() => navegar({ nome: 'publicador', id: a.p.id })}
                >
                  {a.p.nome} <span className="text-slate-500">· dia {a.dia}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Indicador icone={<Users size={18} />} cor="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15" rotulo="Publicadores ativos" valor={ativos.length - stats.atencao.length} detalhe={`Total ${ativos.length} · ${stats.atencao.length} inativos`} onClick={() => navegar({ nome: 'publicadores', filtro: { situacoes: ['ativo'] } })} />
        <Indicador icone={<UsersRound size={18} />} cor="bg-sky-100 text-sky-600 dark:bg-sky-500/15" rotulo="Grupos de campo" valor={db.grupos.length} detalhe={stats.semGrupo ? `${stats.semGrupo} sem grupo` : 'Todos em grupos'} onClick={() => navegar({ nome: 'grupos' })} />
        <Indicador icone={<UserCheck size={18} />} cor="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15" rotulo="Pioneiros" valor={stats.pioneiros} detalhe={ultimoMes ? `+ ${stats.auxiliares} auxiliares em ${mesCurto(ultimoMes)}` : undefined} onClick={() => navegar({ nome: 'publicadores', filtro: { designacoes: ['pioneiro_regular', 'pioneiro_especial'] } })} />
        <Indicador icone={<AlertTriangle size={18} />} cor="bg-amber-100 text-amber-600 dark:bg-amber-500/15" rotulo="Inativos" valor={stats.atencao.length} detalhe={`${pct(stats.atencao.length, ativos.length)}% dos publicadores`} onClick={() => navegar({ nome: 'publicadores', filtro: { situacoes: ['inativo'] } })} />

        <div className="card relative col-span-2 flex flex-col overflow-hidden p-4 lg:col-span-1">
          <span className="absolute inset-x-0 top-0 h-1 bg-sky-500 opacity-70" />
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-sky-100 p-2 text-sky-600 dark:bg-sky-500/15">
              <Droplets size={18} />
            </span>
            <span className="text-sm text-slate-500">Batismo em {nomeMes(`${anoHoje}-${mesHoje}`).split(' ')[0].toLowerCase()}</span>
          </div>
          {aniversarios.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">Nenhum aniversário de batismo neste mês.</p>
          ) : (
            <ul className="mt-2 max-h-24 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {aniversarios.map((a) => (
                <li key={a.p.id}>
                  <button
                    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    title={`${a.p.nome} · ${a.anos} ${a.anos === 1 ? 'ano' : 'anos'} de batismo`}
                    onClick={() => navegar({ nome: 'publicador', id: a.p.id })}
                  >
                    <span className="w-5 shrink-0 text-right font-semibold tabular-nums text-sky-600 dark:text-sky-400">{a.dia}</span>
                    <span className="flex-1 truncate">{a.p.nome}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {a.anos} {a.anos === 1 ? 'ano' : 'anos'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <MetaPioneiros anoServico={anoServico} {...pioneiros} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SemParticipar {...semParticipar} />

        <Cartao titulo="Inativos" icone={<AlertTriangle size={18} />} subtitulo={`${stats.atencao.length} ${stats.atencao.length === 1 ? 'publicador' : 'publicadores'} · marcados à mão ou 6 meses sem participar`}>
          {stats.atencao.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum publicador inativo.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto pr-1 dark:divide-slate-800">
              {stats.atencao.map(({ p, s }) => (
                <li key={p.id}>
                  <button className="flex w-full items-center gap-3 py-2 text-left text-sm" onClick={() => navegar({ nome: 'publicador', id: p.id })}>
                    <Avatar nome={p.nome} tamanho={28} />
                    <span className="flex-1 truncate">{p.nome}</span>
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
