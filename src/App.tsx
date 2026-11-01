import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useStore } from './store/store';
import { localizarArquivo } from './storage/storage';
import { Layout, useTema } from './components/Layout';
import { Desbloquear, EscolherArquivo } from './pages/Acesso';
import { Painel } from './pages/Painel';
import { Publicadores } from './pages/Publicadores';
import { PublicadorDetalhe } from './pages/PublicadorDetalhe';
import { Grupos } from './pages/Grupos';
import { Importar } from './pages/Importar';
import { Config, minutosBloqueio } from './pages/Config';

/** Bloqueia o app após um período sem interação. */
function useBloqueioAutomatico(ativo: boolean) {
  const bloquear = useStore((s) => s.bloquear);
  useEffect(() => {
    if (!ativo) return;
    let timer: ReturnType<typeof setTimeout>;
    const reiniciar = () => {
      clearTimeout(timer);
      const min = minutosBloqueio();
      if (min > 0) timer = setTimeout(bloquear, min * 60_000);
    };
    const eventos = ['mousemove', 'keydown', 'pointerdown', 'wheel'];
    eventos.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }));
    reiniciar();
    return () => {
      clearTimeout(timer);
      eventos.forEach((e) => window.removeEventListener(e, reiniciar));
    };
  }, [ativo, bloquear]);
}

export function App() {
  useTema();
  const { fase, pagina, definirArmazenamento } = useStore();
  useBloqueioAutomatico(fase === 'aberto');

  useEffect(() => {
    localizarArquivo()
      .then(definirArmazenamento)
      .catch(() => definirArmazenamento(null));
  }, [definirArmazenamento]);

  // Garante que alterações pendentes sejam gravadas ao fechar.
  useEffect(() => {
    const h = () => {
      useStore.getState().salvarAgora().catch(() => {});
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  if (fase === 'iniciando')
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (fase === 'escolher') return <EscolherArquivo />;
  if (fase === 'bloqueado') return <Desbloquear />;

  return (
    <Layout>
      {pagina.nome === 'painel' && <Painel />}
      {pagina.nome === 'publicadores' && <Publicadores />}
      {pagina.nome === 'publicador' && <PublicadorDetalhe key={pagina.id} id={pagina.id} />}
      {pagina.nome === 'grupos' && <Grupos />}
      {pagina.nome === 'importar' && <Importar />}
      {pagina.nome === 'config' && <Config />}
    </Layout>
  );
}
