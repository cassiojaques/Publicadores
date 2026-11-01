import { useState } from 'react';
import { useStore } from '../store/store';
import { Modal } from './ui';

/** Resolve conflito com alteração externa: manter as mudanças daqui ou recarregar a versão do disco. */
export function ReabrirComSenha({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { salvarAgora, recarregarDoDisco, toast } = useStore();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  async function manter() {
    try {
      await salvarAgora(true);
      toast('Suas alterações sobrescreveram a versão do arquivo.');
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function recarregar() {
    try {
      await recarregarDoDisco(senha);
      toast('Dados recarregados do arquivo.');
      setSenha('');
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <Modal aberto={aberto} titulo="Arquivo alterado por fora" onFechar={onFechar} largura="max-w-md">
      <div className="space-y-4 text-sm">
        <p>Escolha qual versão manter:</p>
        <button className="btn-primary w-full" onClick={manter}>
          Manter as alterações feitas aqui (sobrescrever o arquivo)
        </button>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2">Ou descartar as alterações daqui e carregar a versão do arquivo:</p>
          <div className="flex gap-2">
            <input
              className="input"
              type="password"
              placeholder="PIN"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button className="btn-outline shrink-0" disabled={!senha} onClick={recarregar}>
              Recarregar
            </button>
          </div>
        </div>
        {erro && <p className="text-rose-600">{erro}</p>}
      </div>
    </Modal>
  );
}
