import { useState } from 'react';
import { Download, MonitorDown, X } from 'lucide-react';
import { instalar, useInstalacao } from '../pwa/instalacao';

const DICA = {
  chromium: 'Clique no ícone de instalar na barra de endereço, ou no menu ⋮ → "Instalar Publicadores". Se já instalou, abra pelo Menu Iniciar.',
  ios: 'Toque em Compartilhar e depois em "Adicionar à Tela de Início".',
  outro: 'Abra este endereço no Google Chrome ou no Microsoft Edge para instalar o aplicativo.',
};

/** Destaque grande nas telas de entrada; some quando o app já está instalado. */
export function BannerInstalar() {
  const { instalado, podeInstalar, plataforma } = useInstalacao();
  const [fechado, setFechado] = useState(false);
  if (instalado || fechado) return null;

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-lg shadow-indigo-500/30">
      <button
        className="absolute right-2 top-2 rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
        onClick={() => setFechado(true)}
        aria-label="Fechar"
      >
        <X size={16} />
      </button>
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white/15 p-2.5">
          <MonitorDown size={24} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Instale o Publicadores no seu computador</p>
          <p className="mt-0.5 text-sm text-indigo-100">Abre em janela própria, com ícone no Menu Iniciar, e funciona sem internet.</p>
        </div>
      </div>
      {podeInstalar ? (
        <button
          onClick={instalar}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-base font-semibold text-indigo-700 shadow transition hover:bg-indigo-50"
        >
          <Download size={20} /> Instalar aplicativo
        </button>
      ) : (
        <p className="mt-4 rounded-xl bg-white/10 px-3 py-2.5 text-sm">{DICA[plataforma]}</p>
      )}
    </div>
  );
}

/** Botão compacto para a barra lateral, só quando o navegador permite instalar. */
export function BotaoInstalarTopo() {
  const { podeInstalar } = useInstalacao();
  if (!podeInstalar) return null;
  return (
    <button className="btn-primary w-full py-1.5" onClick={instalar} title="Instalar o aplicativo neste computador">
      <Download size={16} /> Instalar app
    </button>
  );
}
