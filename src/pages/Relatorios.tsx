import { useMemo, useState } from 'react';
import { CalendarPlus, ClipboardCopy, ClipboardList, FileInput, Search, Trash2, X } from 'lucide-react';
import {
  definirAuxiliar, definirRelatorio, excluirMes, excluirRelatorio, garantirMes, mesesComDados, useStore,
} from '../store/store';
import { mesRelatorioAtual, nomeMes } from '../domain/serviceYear';
import { statusDoMes, textoFaltantes, totaisDoMes, type LinhaMes, type StatusMes } from '../domain/relatorios';
import { auxiliarNoMes, type RelatorioMes } from '../domain/types';
import { Avatar, BadgesPrivilegio, Confirmar, Modal, Toggle, Vazio } from '../components/ui';

const ROTULO_STATUS: Record<StatusMes, { t: string; c: string }> = {
  relatou: { t: 'Relatou', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  falta: { t: 'Falta', c: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  inativo: { t: 'Inativo', c: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

type Filtro = 'falta' | 'relatou' | 'inativo' | 'todos';

export function Relatorios({ mesInicial }: { mesInicial?: string }) {
  const { db, atualizar, toast, navegar } = useStore();
  const meses = useMemo(() => mesesComDados(db), [db]);
  const lista = useMemo(() => [...meses].sort().reverse(), [meses]);
  const [mesSel, setMesSel] = useState<string | undefined>(mesInicial);
  const mes = mesSel && meses.has(mesSel) ? mesSel : lista[0];
  const [novoMes, setNovoMes] = useState<string | null>(null);
  const [excluir, setExcluir] = useState(false);

  if (!mes)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <div className="card">
          <Vazio icone={<ClipboardList size={40} />} titulo="Nenhum relatório ainda">
            <p className="text-sm">Importe o relatório de campo do mês ou crie um mês para preencher à mão.</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-primary" onClick={() => navegar({ nome: 'importar' })}>
                <FileInput size={16} /> Importar relatório
              </button>
              <button className="btn-outline" onClick={() => setNovoMes(mesRelatorioAtual())}>
                <CalendarPlus size={16} /> Novo mês
              </button>
            </div>
          </Vazio>
        </div>
        <NovoMes valor={novoMes} setValor={setNovoMes} onCriar={(m) => setMesSel(m)} />
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-sm text-slate-500">Alterações aqui atualizam os cartões S-21 na hora.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => setNovoMes(mesRelatorioAtual())}>
            <CalendarPlus size={16} /> Novo mês
          </button>
          <button className="btn-primary" onClick={() => navegar({ nome: 'importar' })}>
            <FileInput size={16} /> Importar
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[240px_1fr]">
        <ListaMeses meses={lista} atual={mes} onEscolher={setMesSel} />
        <DetalheMes key={mes} mes={mes} onExcluirMes={() => setExcluir(true)} />
      </div>

      <NovoMes valor={novoMes} setValor={setNovoMes} onCriar={(m) => setMesSel(m)} />
      <Confirmar
        aberto={excluir}
        perigo
        titulo={`Excluir ${nomeMes(mes)}`}
        textoBotao="Excluir o mês"
        mensagem={
          <>
            Isto apaga os relatórios de <b>{nomeMes(mes)}</b> de todos os publicadores, inclusive dos cartões S-21. Use
            se importou o mês errado; depois você pode importar de novo.
          </>
        }
        onFechar={() => setExcluir(false)}
        onConfirmar={() => {
          atualizar((d) => excluirMes(d, mes));
          setMesSel(undefined);
          toast(`${nomeMes(mes)} excluído.`);
        }}
      />
    </div>
  );
}

function ListaMeses({ meses: ms, atual, onEscolher }: { meses: string[]; atual: string; onEscolher: (m: string) => void }) {
  const db = useStore((e) => e.db);
  const meses = useMemo(() => mesesComDados(db), [db]);
  return (
    <nav className="card max-h-[70vh] overflow-y-auto p-1.5">
      {ms.map((m) => {
        const linhas = statusDoMes(db, m, meses);
        const esperados = linhas.filter((l) => l.status !== 'inativo').length;
        const relatou = linhas.filter((l) => l.status === 'relatou').length;
        const faltam = linhas.filter((l) => l.status === 'falta').length;
        const pct = esperados ? Math.round((relatou / esperados) * 100) : 100;
        return (
          <button
            key={m}
            onClick={() => onEscolher(m)}
            className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
              m === atual ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <span className="flex items-center justify-between gap-2 text-sm">
              <span className={m === atual ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'font-medium'}>{nomeMes(m)}</span>
              {faltam > 0 ? (
                <span className="badge bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">faltam {faltam}</span>
              ) : (
                <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">completo</span>
              )}
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              {relatou} de {esperados} relataram
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function NovoMes({ valor, setValor, onCriar }: { valor: string | null; setValor: (v: string | null) => void; onCriar: (m: string) => void }) {
  const { db, atualizar } = useStore();
  const existe = !!valor && mesesComDados(db).has(valor);
  return (
    <Modal
      aberto={valor !== null}
      titulo="Novo mês"
      largura="max-w-sm"
      onFechar={() => setValor(null)}
      rodape={
        <>
          <button className="btn-ghost" onClick={() => setValor(null)}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!valor}
            onClick={() => {
              if (!valor) return;
              if (!existe) atualizar((d) => garantirMes(d, valor, '(manual)'));
              onCriar(valor);
              setValor(null);
            }}
          >
            {existe ? 'Abrir' : 'Criar'}
          </button>
        </>
      }
    >
      <label className="label" htmlFor="novo-mes">
        Mês do relatório
      </label>
      <input id="novo-mes" type="month" className="input" value={valor ?? ''} onChange={(e) => setValor(e.target.value)} />
      <p className="mt-2 text-xs text-slate-500">
        {existe ? 'Este mês já existe.' : 'Todos os publicadores aparecerão como faltando até você preencher os relatórios.'}
      </p>
    </Modal>
  );
}

function DetalheMes({ mes, onExcluirMes }: { mes: string; onExcluirMes: () => void }) {
  const { db, atualizar, toast, navegar } = useStore();
  const [filtro, setFiltro] = useState<Filtro>('falta');
  const [grupo, setGrupo] = useState('todos');
  const [q, setQ] = useState('');
  // Linhas editadas nesta aba continuam visíveis mesmo mudando de situação (ex.: de "Falta" para "Relatou").
  const [editadas, setEditadas] = useState<Set<string>>(new Set());
  const mudarFiltro = (f: Filtro) => {
    setFiltro(f);
    setEditadas(new Set());
  };

  const meses = useMemo(() => mesesComDados(db), [db]);
  const linhas = useMemo(() => statusDoMes(db, mes, meses), [db, mes, meses]);
  const totais = useMemo(() => totaisDoMes(linhas), [linhas]);
  const conta = (s: StatusMes) => linhas.filter((l) => l.status === s).length;
  const importacao = db.importacoes.find((i) => i.mes === mes);
  const ordemGrupo = new Map(db.grupos.map((g, i) => [g.id, i]));

  const visiveis = linhas
    .filter((l) => filtro === 'todos' || l.status === filtro || editadas.has(l.p.id))
    .filter((l) => grupo === 'todos' || (grupo === 'sem' ? !l.p.grupoId : l.p.grupoId === grupo))
    .filter((l) => !q.trim() || l.p.nome.toLowerCase().includes(q.trim().toLowerCase()))
    .sort(
      (a, b) =>
        (ordemGrupo.get(a.p.grupoId ?? '') ?? 1e9) - (ordemGrupo.get(b.p.grupoId ?? '') ?? 1e9) ||
        a.p.nome.localeCompare(b.p.nome, 'pt-BR', { numeric: true }),
    );

  async function copiarFaltantes() {
    const texto = textoFaltantes(db, linhas);
    try {
      await navigator.clipboard.writeText(texto);
      toast(`${conta('falta')} nomes copiados, separados por grupo.`);
    } catch {
      toast('Não foi possível copiar.', 'erro');
    }
  }

  const abas: [Filtro, string, number][] = [
    ['falta', 'Faltam', conta('falta')],
    ['relatou', 'Relataram', conta('relatou')],
    ['inativo', 'Inativos', conta('inativo')],
    ['todos', 'Todos', linhas.length],
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{nomeMes(mes)}</h2>
            <p className="text-xs text-slate-500">
              {importacao?.arquivo && importacao.arquivo !== '(manual)'
                ? `Importado de ${importacao.arquivo} em ${new Date(importacao.data).toLocaleDateString('pt-BR')}`
                : 'Preenchido manualmente'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={copiarFaltantes} disabled={conta('falta') === 0}>
              <ClipboardCopy size={16} /> Copiar quem falta
            </button>
            <button className="btn-ghost text-rose-600" onClick={onExcluirMes} title="Excluir o mês inteiro">
              <Trash2 size={16} /> Excluir mês
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <Resumo titulo="Publicadores" t={totais.publicadores} />
          <Resumo titulo="Pioneiros auxiliares" t={totais.auxiliares} horas />
          <Resumo titulo="Pioneiros regulares" t={totais.regulares} horas />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
            {abas.map(([id, rotulo, n]) => (
              <button
                key={id}
                onClick={() => mudarFiltro(id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  filtro === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {rotulo} <span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>
          <select className="input w-auto" value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo">
            <option value="todos">Todos os grupos</option>
            {db.grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
            <option value="sem">Sem grupo</option>
          </select>
          <div className="relative min-w-[160px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Nome…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {visiveis.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            {filtro === 'falta' ? 'Ninguém faltando. 🎉' : 'Nenhum publicador neste filtro.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Nome</th>
                  <th className="th">Grupo</th>
                  <th className="th">Situação</th>
                  <th className="th text-center">Participou</th>
                  <th className="th text-center">Estudos</th>
                  <th className="th text-center">Pion. aux.</th>
                  <th className="th text-center">Horas</th>
                  <th className="th">Observações</th>
                  <th className="th w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visiveis.map((l) => (
                  <Linha key={l.p.id} l={l} mes={mes} grupo={db.grupos.find((g) => g.id === l.p.grupoId)?.nome ?? '—'}
                    onAbrir={() => navegar({ nome: 'publicador', id: l.p.id })}
                    onEditar={(campo, valor) => {
                      setEditadas((s) => (s.has(l.p.id) ? s : new Set(s).add(l.p.id)));
                      atualizar((d) => definirRelatorio(d, l.p.id, mes, campo, valor));
                    }}
                    onAuxiliar={(valor) => {
                      setEditadas((s) => (s.has(l.p.id) ? s : new Set(s).add(l.p.id)));
                      atualizar((d) => definirAuxiliar(d, l.p.id, mes, valor));
                    }}
                    onExcluir={() => {
                      atualizar((d) => excluirRelatorio(d, l.p.id, mes));
                      toast(`Relatório de ${l.p.nome} excluído.`);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Resumo({ titulo, t, horas }: { titulo: string; t: { relatorios: number; estudos: number; horas: number }; horas?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span><b className="text-lg tabular-nums">{t.relatorios}</b> relatórios</span>
        <span><b className="text-lg tabular-nums">{t.estudos}</b> estudos</span>
        {horas && <span><b className="text-lg tabular-nums">{t.horas}</b> horas</span>}
      </div>
    </div>
  );
}

function Linha({
  l,
  mes,
  grupo,
  onAbrir,
  onEditar,
  onAuxiliar,
  onExcluir,
}: {
  l: LinhaMes;
  mes: string;
  grupo: string;
  onAbrir: () => void;
  onEditar: <K extends keyof RelatorioMes>(campo: K, valor: RelatorioMes[K]) => void;
  onAuxiliar: (valor: boolean) => void;
  onExcluir: () => void;
}) {
  const { p, r, status } = l;
  const num = (campo: 'estudos' | 'horas') => (
    <input
      type="number"
      min={0}
      className="w-16 rounded-md bg-transparent px-2 py-1 text-center tabular-nums outline-none hover:bg-slate-100 focus:bg-indigo-50 dark:hover:bg-slate-800 dark:focus:bg-indigo-500/10"
      value={r?.[campo] ?? ''}
      onChange={(e) => onEditar(campo, e.target.value === '' ? null : Number(e.target.value))}
      aria-label={`${campo} de ${p.nome}`}
    />
  );
  return (
    <tr className={status === 'inativo' ? 'opacity-60' : ''}>
      <td className="td">
        <button className="flex items-center gap-2 whitespace-nowrap text-left hover:underline" onClick={onAbrir} title="Abrir cartão">
          <Avatar nome={p.nome} tamanho={24} />
          <span className="font-medium">{p.nome}</span>
          <BadgesPrivilegio p={p} mes={mes} />
        </button>
      </td>
      <td className="td whitespace-nowrap text-slate-500">{grupo}</td>
      <td className="td">
        <span className={`badge ${ROTULO_STATUS[status].c}`}>{ROTULO_STATUS[status].t}</span>
      </td>
      <td className="td text-center">
        <Toggle checked={!!r?.participou}
          onChange={(e) => onEditar('participou', e.target.checked)} aria-label={`Participou: ${p.nome}`} />
      </td>
      <td className="td text-center">{num('estudos')}</td>
      <td className="td text-center">
        <Toggle checked={r ? r.auxiliar : auxiliarNoMes(p, mes)}
          onChange={(e) => onAuxiliar(e.target.checked)} aria-label={`Pioneiro auxiliar: ${p.nome}`} />
      </td>
      <td className="td text-center">{num('horas')}</td>
      <td className="td">
        <input className="w-full min-w-[120px] rounded-md bg-transparent px-2 py-1 outline-none hover:bg-slate-100 focus:bg-indigo-50 dark:hover:bg-slate-800 dark:focus:bg-indigo-500/10"
          value={r?.obs ?? ''} onChange={(e) => onEditar('obs', e.target.value)} aria-label={`Observações de ${p.nome}`} />
      </td>
      <td className="td">
        {r && (
          <button className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" onClick={onExcluir} title="Excluir este relatório">
            <X size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
