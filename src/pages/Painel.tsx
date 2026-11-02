import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, BookOpen, Clock, FileInput, FileSpreadsheet, Plus, UserCheck, Users, UsersRound } from 'lucide-react';
import { mesesComDados, useStore } from '../store/store';
import { mesRelatorioAtual, nomeMes, situacao } from '../domain/serviceYear';
import { Avatar, BadgeSituacao } from '../components/ui';

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
        <Indicador icone={<UserCheck size={18} />} cor="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15" rotulo="Pioneiros" valor={stats.pioneiros} />
        <Indicador icone={<AlertTriangle size={18} />} cor="bg-amber-100 text-amber-600 dark:bg-amber-500/15" rotulo="Inativos" valor={stats.atencao.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-1">
          <h2 className="font-semibold">Último relatório</h2>
          {ultimoMes ? (
            <>
              <button className="block text-left text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => navegar({ nome: 'relatorios', mes: ultimoMes })}>
                {nomeMes(ultimoMes)} · ver relatórios
              </button>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="flex items-center gap-2 text-slate-500"><UserCheck size={16} /> Participaram</dt>
                  <dd className="font-semibold tabular-nums">{stats.participaram} / {ativos.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="flex items-center gap-2 text-slate-500"><BookOpen size={16} /> Estudos bíblicos</dt>
                  <dd className="font-semibold tabular-nums">{stats.estudos}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="flex items-center gap-2 text-slate-500"><Users size={16} /> Pioneiros auxiliares</dt>
                  <dd className="font-semibold tabular-nums">{stats.auxiliares}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="flex items-center gap-2 text-slate-500"><Clock size={16} /> Horas (pioneiros)</dt>
                  <dd className="font-semibold tabular-nums">{stats.horas}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Nenhum relatório importado ainda.</p>
          )}
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Precisam de atenção</h2>
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
        </div>
      </div>
    </div>
  );
}
