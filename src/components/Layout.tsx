import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Fuse from 'fuse.js';
import {
  AlertTriangle, Check, CloudUpload, FileInput, LayoutDashboard, Lock, Moon, Search, Settings, Sun, Users, UsersRound,
} from 'lucide-react';
import { useStore, type Pagina } from '../store/store';
import { Avatar, BadgesPrivilegio } from './ui';
import { ReabrirComSenha } from './ReabrirComSenha';

const NAV: { p: Pagina['nome']; rotulo: string; icone: ReactNode }[] = [
  { p: 'painel', rotulo: 'Painel', icone: <LayoutDashboard size={18} /> },
  { p: 'publicadores', rotulo: 'Publicadores', icone: <Users size={18} /> },
  { p: 'grupos', rotulo: 'Grupos de campo', icone: <UsersRound size={18} /> },
  { p: 'importar', rotulo: 'Importar', icone: <FileInput size={18} /> },
  { p: 'config', rotulo: 'Configurações', icone: <Settings size={18} /> },
];

export function useTema() {
  const [escuro, setEscuro] = useState(() => {
    try {
      const salvo = localStorage.getItem('publicadores.tema');
      if (salvo) return salvo === 'escuro';
    } catch {
      /* ignore */
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', escuro);
    try {
      localStorage.setItem('publicadores.tema', escuro ? 'escuro' : 'claro');
    } catch {
      /* ignore */
    }
  }, [escuro]);
  return [escuro, setEscuro] as const;
}

function Busca() {
  const { db, navegar } = useStore();
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const fuse = useMemo(() => {
    const itens = [
      ...db.publicadores.map((p) => ({ tipo: 'p' as const, id: p.id, nome: p.nome, extra: p.telefone })),
      ...db.grupos.map((g) => ({ tipo: 'g' as const, id: g.id, nome: g.nome, extra: '' })),
    ];
    return new Fuse(itens, { keys: ['nome', 'extra'], threshold: 0.35, ignoreLocation: true });
  }, [db.publicadores, db.grupos]);

  const resultados = q.trim() ? fuse.search(q.trim(), { limit: 8 }).map((r) => r.item) : [];

  function ir(i: (typeof resultados)[number]) {
    navegar(i.tipo === 'p' ? { nome: 'publicador', id: i.id } : { nome: 'grupos' });
    setQ('');
    setAberto(false);
    ref.current?.blur();
  }

  return (
    <div className="relative w-full max-w-xl">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={ref}
        className="input pl-9 pr-16"
        placeholder="Pesquisar publicadores e grupos…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, resultados.length - 1));
          else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0));
          else if (e.key === 'Enter' && resultados[sel]) ir(resultados[sel]);
          else if (e.key === 'Escape') ref.current?.blur();
        }}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 px-1.5 text-[10px] text-slate-400 dark:border-slate-700">
        Ctrl K
      </kbd>
      {aberto && q.trim() && (
        <div className="card absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden p-1">
          {resultados.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Nada encontrado.</p>}
          {resultados.map((r, i) => {
            const p = r.tipo === 'p' ? db.publicadores.find((x) => x.id === r.id)! : null;
            const grupo = p ? db.grupos.find((g) => g.id === p.grupoId) : null;
            return (
              <button
                key={r.tipo + r.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ir(r)}
                onMouseEnter={() => setSel(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                  i === sel ? 'bg-slate-100 dark:bg-slate-800' : ''
                }`}
              >
                {p ? <Avatar nome={p.nome} tamanho={26} /> : <UsersRound size={20} className="text-indigo-500" />}
                <span className="flex-1 truncate">{r.nome}</span>
                {p && <BadgesPrivilegio p={p} />}
                <span className="text-xs text-slate-400">{p ? grupo?.nome ?? 'Sem grupo' : 'Grupo'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusSalvar() {
  const { salvando, conflito, arm } = useStore();
  if (conflito)
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600">
        <AlertTriangle size={14} /> Conflito
      </span>
    );
  return (
    <span className="hidden items-center gap-1 text-xs text-slate-400 md:flex" title={arm?.descricao}>
      {salvando ? <CloudUpload size={14} className="animate-pulse" /> : <Check size={14} />}
      {salvando ? 'Salvando…' : 'Salvo'}
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { pagina, navegar, bloquear, db, conflito, toasts } = useStore();
  const [escuro, setEscuro] = useTema();
  const [resolverConflito, setResolverConflito] = useState(false);
  const ativo = pagina.nome === 'publicador' ? 'publicadores' : pagina.nome;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="rounded-lg bg-indigo-600 p-1.5 text-white">
            <Users size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Publicadores</p>
            <p className="truncate text-xs text-slate-500">{db.congregacao.nome || 'Congregação'}</p>
          </div>
        </div>
        <nav className="space-y-0.5">
          {NAV.map((n) => (
            <button
              key={n.p}
              onClick={() => navegar({ nome: n.p } as Pagina)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                ativo === n.p
                  ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {n.icone}
              {n.rotulo}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 md:px-6">
          <select
            className="input w-auto md:hidden"
            value={ativo}
            onChange={(e) => navegar({ nome: e.target.value } as Pagina)}
            aria-label="Navegação"
          >
            {NAV.map((n) => (
              <option key={n.p} value={n.p}>
                {n.rotulo}
              </option>
            ))}
          </select>
          <Busca />
          <div className="ml-auto flex items-center gap-1">
            <StatusSalvar />
            <button className="btn-ghost p-2" onClick={() => setEscuro(!escuro)} title="Alternar tema">
              {escuro ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="btn-ghost p-2" onClick={bloquear} title="Bloquear">
              <Lock size={18} />
            </button>
          </div>
        </header>

        {conflito && (
          <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle size={16} />
            O arquivo de dados foi alterado fora do aplicativo (ex.: OneDrive). Suas últimas mudanças ainda não foram
            salvas.
            <button className="btn-outline ml-auto py-1" onClick={() => setResolverConflito(true)}>
              Resolver
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
      </div>

      <ReabrirComSenha aberto={resolverConflito} onFechar={() => setResolverConflito(false)} />

      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`card px-4 py-2.5 text-sm shadow-lg ${
              t.tipo === 'erro' ? 'border-rose-300 text-rose-700 dark:text-rose-300' : ''
            }`}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </div>
  );
}
