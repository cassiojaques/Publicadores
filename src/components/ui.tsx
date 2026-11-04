import { useEffect, type InputHTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Publicador } from '../domain/types';
import { PRIVILEGIOS } from '../domain/types';
import type { Situacao } from '../domain/serviceYear';

/**
 * Troca o ano de serviço com setas: ◀ volta para o ano anterior, ▶ avança.
 * `anos` traz os anos disponíveis, em qualquer ordem.
 */
export function SeletorAnoServico({ ano, anos, onChange, className = '' }: { ano: number; anos: number[]; onChange: (ano: number) => void; className?: string }) {
  const ordenados = [...anos].sort((a, b) => a - b);
  const i = ordenados.indexOf(ano);
  const anterior = i > 0 ? ordenados[i - 1] : null;
  const proximo = i >= 0 && i < ordenados.length - 1 ? ordenados[i + 1] : null;
  const seta = 'rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800';
  return (
    <div className={`inline-flex items-center justify-between gap-1 rounded-lg border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900 ${className}`} role="group" aria-label="Ano de serviço">
      <button type="button" className={seta} disabled={anterior === null} onClick={() => anterior !== null && onChange(anterior)} title={anterior ? `Ano de serviço ${anterior}` : undefined} aria-label="Ano anterior">
        <ChevronLeft size={18} />
      </button>
      <span className="min-w-[9.5rem] px-1 text-center leading-tight">
        <span className="block text-sm font-semibold tabular-nums">Ano de serviço {ano}</span>
        <span className="block text-[11px] text-slate-500">set/{ano - 1} – ago/{ano}</span>
      </span>
      <button type="button" className={seta} disabled={proximo === null} onClick={() => proximo !== null && onChange(proximo)} title={proximo ? `Ano de serviço ${proximo}` : undefined} aria-label="Próximo ano">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

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
    // No celular a janela vira um painel que sobe da base, com o rodapé sempre à vista.
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-start sm:overflow-y-auto sm:p-4 sm:pt-[8vh]">
      <div className={`card flex max-h-[92dvh] w-full flex-col rounded-b-none sm:max-h-none sm:rounded-b-xl ${largura}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
          <h2 className="font-semibold">{titulo}</h2>
          <button className="btn-ghost p-1" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:overflow-visible sm:p-5">{children}</div>
        {rodape && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800 sm:px-5 sm:pb-3">{rodape}</div>
        )}
      </div>
    </div>
  );
}

/** Painel que sobe da base da tela no celular (e vira janela centralizada no desktop). */
export function Folha({ aberto, titulo, onFechar, children, rodape }: { aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  useEffect(() => {
    if (!aberto) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onFechar}>
      <div
        className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:max-w-lg sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button className="btn-ghost p-1.5" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        {rodape && <div className="shrink-0 border-t border-slate-200 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800">{rodape}</div>}
      </div>
    </div>
  );
}

const CORES_TOGGLE = {
  indigo: 'checked:bg-indigo-600 focus-visible:outline-indigo-500',
  rose: 'checked:bg-rose-600 focus-visible:outline-rose-500',
  emerald: 'checked:bg-emerald-600 focus-visible:outline-emerald-500',
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

/** Logotipo do WhatsApp (o lucide não traz marcas). Usa a cor do texto. */
export function IconeWhatsapp({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.78h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88M20.52 3.45A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41" />
    </svg>
  );
}
