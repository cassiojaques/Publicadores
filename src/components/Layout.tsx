import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle, BarChart3, Check, ClipboardList, CloudUpload, FileInput, LayoutDashboard, Lock, MapPin, Menu, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, Users, UsersRound,
} from 'lucide-react';
import { Folha } from './ui';
import { useStore, type Pagina } from '../store/store';
import { ReabrirComSenha } from './ReabrirComSenha';
import { BotaoInstalarTopo } from './Instalar';
import { textoVersao } from '../versao';

const NAV: { p: Pagina['nome']; rotulo: string; icone: ReactNode }[] = [
  { p: 'painel', rotulo: 'Painel', icone: <LayoutDashboard size={18} /> },
  { p: 'publicadores', rotulo: 'Publicadores', icone: <Users size={18} /> },
  { p: 'grupos', rotulo: 'Grupos de campo', icone: <UsersRound size={18} /> },
  { p: 'mapa', rotulo: 'Mapa', icone: <MapPin size={18} /> },
  { p: 'relatorios', rotulo: 'Relatórios', icone: <ClipboardList size={18} /> },
  { p: 'assistencia', rotulo: 'Assistência', icone: <BarChart3 size={18} /> },
  { p: 'importar', rotulo: 'Importar', icone: <FileInput size={18} /> },
  { p: 'config', rotulo: 'Configurações', icone: <Settings size={18} /> },
];

/** No celular: as quatro telas mais usadas ficam na barra de abas; o resto vai em "Mais". */
const ABAS = [NAV[0], { ...NAV[1], curto: 'Publicadores' }, { ...NAV[2], curto: 'Grupos' }, NAV[4]] as (typeof NAV[number] & { curto?: string })[];
const MAIS = NAV.filter((n) => !ABAS.some((a) => a.p === n.p));

function BotaoAba({ ativo, rotulo, onClick, children }: { ativo: boolean; rotulo: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-current={ativo ? 'page' : undefined}
      className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[11px] font-medium transition ${
        ativo ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 active:bg-slate-100 dark:text-slate-400 dark:active:bg-slate-800'
      }`}
    >
      {ativo && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
      {children}
      <span className="max-w-full truncate">{rotulo}</span>
    </button>
  );
}

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

function StatusSalvar() {
  const { salvando, conflito, arm } = useStore();
  if (conflito)
    return (
      <span className="flex items-center gap-1 text-xs text-amber-400">
        <AlertTriangle size={14} /> Conflito
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-indigo-300/80 dark:text-slate-400" title={arm?.descricao}>
      {salvando ? <CloudUpload size={14} className="animate-pulse" /> : <Check size={14} />}
      {salvando ? 'Salvando…' : 'Salvo'}
    </span>
  );
}

/** Menu lateral recolhido (só ícones), lembrado entre as aberturas. */
function useMenuRecolhido() {
  const [recolhido, setRecolhido] = useState(() => {
    try {
      return localStorage.getItem('publicadores.menuRecolhido') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('publicadores.menuRecolhido', recolhido ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [recolhido]);
  return [recolhido, setRecolhido] as const;
}

export function Layout({ children }: { children: ReactNode }) {
  const { pagina, navegar, bloquear, db, conflito, toasts } = useStore();
  const [escuro, setEscuro] = useTema();
  const [recolhido, setRecolhido] = useMenuRecolhido();
  const [resolverConflito, setResolverConflito] = useState(false);
  const [mais, setMais] = useState(false);
  const ativo = pagina.nome === 'publicador' ? 'publicadores' : pagina.nome;

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className={`hidden ${recolhido ? 'w-16 px-2' : 'w-60 px-3'} shrink-0 flex-col bg-gradient-to-b from-indigo-950 via-indigo-900 to-indigo-950 py-4 text-indigo-100 dark:border-r dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 md:flex`}>
        <div className={`mb-6 flex items-center gap-2 ${recolhido ? 'flex-col' : 'px-2'}`}>
          <span className="rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 p-1.5 text-white shadow-lg shadow-indigo-950/40">
            <Users size={18} />
          </span>
          {!recolhido && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">Publicadores</p>
              <p className="truncate text-xs text-indigo-300/80 dark:text-slate-400">{db.congregacao.nome || 'Congregação'}</p>
            </div>
          )}
          <button
            className="rounded-lg p-1.5 text-indigo-200/80 hover:bg-white/10 hover:text-white dark:text-slate-400"
            onClick={() => setRecolhido(!recolhido)}
            title={recolhido ? 'Expandir o menu' : 'Recolher o menu'}
          >
            {recolhido ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="space-y-0.5">
          {NAV.map((n) => (
            <button
              key={n.p}
              onClick={() => navegar({ nome: n.p } as Pagina)}
              title={recolhido ? n.rotulo : undefined}
              className={`flex w-full items-center gap-3 rounded-lg py-2 text-sm transition ${recolhido ? 'justify-center px-0' : 'px-3'} ${
                ativo === n.p
                  ? 'bg-white/15 font-medium text-white shadow-inner dark:bg-indigo-500/15 dark:text-indigo-200'
                  : 'text-indigo-200/80 hover:bg-white/10 hover:text-white dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {n.icone}
              {!recolhido && n.rotulo}
            </button>
          ))}
        </nav>

        <div className={`mt-auto space-y-3 border-t border-white/10 pt-3 dark:border-slate-800 ${recolhido ? '' : 'px-2'}`}>
          {!recolhido && <BotaoInstalarTopo />}
          <div className={`flex items-center gap-1 ${recolhido ? 'flex-col' : ''}`}>
            {!recolhido && <StatusSalvar />}
            <button className={`${recolhido ? '' : 'ml-auto'} rounded-lg p-2 text-indigo-200/80 hover:bg-white/10 hover:text-white dark:text-slate-400`} onClick={() => setEscuro(!escuro)} title="Alternar tema">
              {escuro ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="rounded-lg p-2 text-indigo-200/80 hover:bg-white/10 hover:text-white dark:text-slate-400" onClick={bloquear} title="Bloquear (pede o PIN na próxima vez)">
              <Lock size={18} />
            </button>
          </div>
          {!recolhido && (
            <p className="text-[11px] tabular-nums text-indigo-300/60 dark:text-slate-500" title="Versão e data/hora em que foi gerada">
              {textoVersao}
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* No celular a barra lateral some: marca no topo e navegação na base. */}
        <header className="flex items-center gap-2.5 border-b border-slate-300/40 bg-gradient-to-r from-indigo-950 to-indigo-900 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-indigo-100 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900 md:hidden">
          <span className="rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 p-1.5 text-white shadow-lg shadow-indigo-950/40">
            <Users size={16} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-white">Publicadores</p>
            <p className="truncate text-[11px] text-indigo-300/80 dark:text-slate-400">{db.congregacao.nome || 'Congregação'}</p>
          </div>
          <StatusSalvar />
          <button className="rounded-lg p-2 text-indigo-200 hover:bg-white/10 dark:text-slate-400" onClick={() => setEscuro(!escuro)} aria-label="Alternar tema">
            {escuro ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="rounded-lg p-2 text-indigo-200 hover:bg-white/10 dark:text-slate-400" onClick={bloquear} aria-label="Bloquear">
            <Lock size={18} />
          </button>
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

        <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-8 md:py-6">{children}</main>

        {/* Barra de abas do celular */}
        <nav className="flex shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900 md:hidden" aria-label="Navegação">
          {ABAS.map((n) => (
            <BotaoAba key={n.p} ativo={ativo === n.p} rotulo={n.curto ?? n.rotulo} onClick={() => navegar({ nome: n.p } as Pagina)}>
              {n.icone}
            </BotaoAba>
          ))}
          <BotaoAba ativo={MAIS.some((n) => n.p === ativo)} rotulo="Mais" onClick={() => setMais(true)}>
            <Menu size={18} />
          </BotaoAba>
        </nav>
      </div>

      <Folha aberto={mais} titulo="Mais opções" onFechar={() => setMais(false)}>
        <div className="grid grid-cols-3 gap-2">
          {MAIS.map((n) => (
            <button
              key={n.p}
              onClick={() => {
                setMais(false);
                navegar({ nome: n.p } as Pagina);
              }}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition ${
                ativo === n.p
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
                  : 'border-slate-200 text-slate-600 active:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:active:bg-slate-800'
              }`}
            >
              {n.icone}
              {n.rotulo}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-3">
          <BotaoInstalarTopo />
          <p className="text-center text-[11px] tabular-nums text-slate-400">{textoVersao}</p>
        </div>
      </Folha>

      <ReabrirComSenha aberto={resolverConflito} onFechar={() => setResolverConflito(false)} />

      <div className="fixed bottom-20 right-3 z-50 space-y-2 md:bottom-4 md:right-4">
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
