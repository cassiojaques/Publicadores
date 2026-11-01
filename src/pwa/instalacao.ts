import { useSyncExternalStore } from 'react';

/**
 * Instalação do PWA. O Chrome/Edge disparam `beforeinstallprompt` logo no carregamento,
 * por isso o evento é capturado aqui (importado em main.tsx) antes do React montar.
 */
interface EventoInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let evento: EventoInstalacao | null = null;
let instalado = typeof window !== 'undefined' && rodandoComoApp();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

function rodandoComoApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    '__TAURI_INTERNALS__' in window
  );
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // usamos o nosso botão em vez da mini-barra do navegador
    evento = e as EventoInstalacao;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    evento = null;
    instalado = true;
    avisar();
  });
}

export type Plataforma = 'chromium' | 'ios' | 'outro';

function plataforma(): Plataforma {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Chrome|Chromium|Edg\//.test(ua)) return 'chromium';
  return 'outro';
}

export interface EstadoInstalacao {
  /** O app já está rodando instalado (janela própria). */
  instalado: boolean;
  /** O navegador permite abrir o diálogo de instalação agora. */
  podeInstalar: boolean;
  plataforma: Plataforma;
}

let snapshot: EstadoInstalacao | null = null;
function ler(): EstadoInstalacao {
  const atual = { instalado, podeInstalar: !!evento && !instalado, plataforma: plataforma() };
  if (!snapshot || snapshot.instalado !== atual.instalado || snapshot.podeInstalar !== atual.podeInstalar) snapshot = atual;
  return snapshot;
}

export function useInstalacao(): EstadoInstalacao {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    ler,
    ler,
  );
}

/** Abre o diálogo de instalação do navegador. Retorna true se o usuário aceitou. */
export async function instalar(): Promise<boolean> {
  if (!evento) return false;
  const e = evento;
  await e.prompt();
  const { outcome } = await e.userChoice;
  evento = null;
  avisar();
  return outcome === 'accepted';
}
