import { useEffect, type InputHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Publicador } from '../domain/types';
import { PRIVILEGIOS } from '../domain/types';
import type { Situacao } from '../domain/serviceYear';

export function Modal({
  aberto,
  titulo,
  onFechar,
  children,
  rodape,
  largura = 'max-w-lg',
}: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh] backdrop-blur-sm">
      <div className={`card w-full ${largura}`} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="font-semibold">{titulo}</h2>
          <button className="btn-ghost p-1" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {rodape && (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{rodape}</div>
        )}
      </div>
    </div>
  );
}

const CORES_TOGGLE = {
  indigo: 'checked:bg-indigo-600 focus-visible:outline-indigo-500',
  rose: 'checked:bg-rose-600 focus-visible:outline-rose-500',
};

/** Interruptor liga/desliga. Funciona como um checkbox (mesmas props), só que com cara de toggle. */
export function Toggle({
  className = '',
  cor = 'indigo',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { cor?: keyof typeof CORES_TOGGLE }) {
  return (
    <span className={`relative inline-flex h-5 w-9 shrink-0 items-center align-middle ${className}`}>
      <input
        type="checkbox"
        role="switch"
        className={`peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-600 ${CORES_TOGGLE[cor]}`}
        {...props}
      />
      <span className="pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
    </span>
  );
}

export function Campo({ rotulo, children, className = '' }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{rotulo}</span>
      {children}
    </label>
  );
}

const CORES_PRIV: Record<string, string> = {
  anciao: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  servo_ministerial: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  pioneiro_regular: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  pioneiro_especial: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  auxiliar: 'bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300',
  missionario: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

/** Com `mes`, mostra também "PA" para quem foi designado pioneiro auxiliar naquele mês. */
export function BadgesPrivilegio({ p, mes }: { p: Publicador; mes?: string }) {
  return (
    <>
      {p.batizado === false && (
        <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" title="Não batizado">
          NB
        </span>
      )}
      {PRIVILEGIOS.filter((x) => p.privilegios.includes(x.id)).map((x) => (
        <span key={x.id} className={`badge ${CORES_PRIV[x.id]}`} title={x.label}>
          {x.curto}
        </span>
      ))}
      {p.auxiliarPermanente ? (
        <span className={`badge ${CORES_PRIV.auxiliar}`} title="Pioneiro auxiliar permanente">PAP</span>
      ) : (
        mes && p.auxiliarMeses.includes(mes) && <span className={`badge ${CORES_PRIV.auxiliar}`} title="Pioneiro auxiliar neste mês">PA</span>
      )}
    </>
  );
}

const SITUACAO: Record<Situacao, { t: string; c: string }> = {
  ativo: { t: 'Ativo', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  inativo: { t: 'Inativo', c: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
};

export function BadgeSituacao({ s }: { s: Situacao }) {
  return <span className={`badge ${SITUACAO[s].c}`}>{SITUACAO[s].t}</span>;
}

export function Avatar({ nome, tamanho = 32 }: { nome: string; tamanho?: number }) {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .map((s) => s[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ width: tamanho, height: tamanho, background: `hsl(${h} 55% 52%)` }}
    >
      {iniciais || '?'}
    </span>
  );
}

export function Vazio({ icone, titulo, children }: { icone: ReactNode; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center text-slate-500">
      <div className="text-slate-300 dark:text-slate-600">{icone}</div>
      <p className="font-medium text-slate-700 dark:text-slate-300">{titulo}</p>
      {children}
    </div>
  );
}

export function Confirmar({
  aberto,
  titulo,
  mensagem,
  textoBotao = 'Confirmar',
  perigo,
  onConfirmar,
  onFechar,
}: {
  aberto: boolean;
  titulo: string;
  mensagem: ReactNode;
  textoBotao?: string;
  perigo?: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      onFechar={onFechar}
      largura="max-w-md"
      rodape={
        <>
          <button className="btn-ghost" onClick={onFechar}>
            Cancelar
          </button>
          <button
            className={perigo ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              onConfirmar();
              onFechar();
            }}
          >
            {textoBotao}
          </button>
        </>
      }
    >
      <div className="text-sm text-slate-600 dark:text-slate-300">{mensagem}</div>
    </Modal>
  );
}
