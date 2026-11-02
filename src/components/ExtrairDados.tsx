import { useMemo, useState } from 'react';
import { FileArchive, FileText, Folder, Loader2 } from 'lucide-react';
import { useStore } from '../store/store';
import { anoServicoAtual, anoServicoDe, rotuloAnoServico } from '../domain/serviceYear';
import { caminhosDosCartoes, gerarExtracao } from '../pdf/extracao';
import { salvarArquivoGerado } from '../storage/storage';
import { Modal } from './ui';

/**
 * Extrai o arquivo da congregação num .zip: os cartões S-21 do ano de serviço em pastas
 * (Ativos/Inativos, pioneiros e outros publicadores por grupo) e, na raiz, os totais,
 * os grupos de campo e a lista de emergência.
 */
export function ExtrairDados({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { db, toast } = useStore();
  const [ano, setAno] = useState(anoServicoAtual());
  const [progresso, setProgresso] = useState<[number, number] | null>(null);

  const anos = useMemo(() => {
    const s = new Set([anoServicoAtual()]);
    for (const p of db.publicadores) for (const m of Object.keys(p.relatorios)) s.add(anoServicoDe(m));
    return [...s].filter((a) => a <= anoServicoAtual()).sort((a, b) => b - a);
  }, [db.publicadores]);

  // Resumo das pastas para mostrar antes de gerar.
  const pastas = useMemo(() => {
    if (!aberto) return [];
    const todas = new Set<string>();
    for (const { caminho } of caminhosDosCartoes(db)) {
      const partes = caminho.split('/').slice(0, -1);
      partes.forEach((_, i) => todas.add(partes.slice(0, i + 1).join('/')));
    }
    return [...todas].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [aberto, db]);
  const totalCartoes = useMemo(() => db.publicadores.filter((p) => !p.arquivado).length, [db.publicadores]);

  async function gerar() {
    setProgresso([0, totalCartoes + 5]);
    try {
      const bytes = await gerarExtracao(db, ano, (f, t) => setProgresso([f, t]));
      if (await salvarArquivoGerado(`Registros de Publicador (S-21) ${ano}.zip`, bytes, 'application/zip')) {
        toast(`${totalCartoes} cartões e 5 PDFs extraídos.`);
        onFechar();
      }
    } catch (e) {
      toast(`Erro ao extrair os dados: ${(e as Error).message}`, 'erro');
    } finally {
      setProgresso(null);
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Extrair dados"
      onFechar={() => !progresso && onFechar()}
      rodape={
        <>
          <button className="btn-ghost" onClick={onFechar} disabled={!!progresso}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={gerar} disabled={!!progresso || totalCartoes === 0}>
            {progresso ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Gerando {progresso[0]} de {progresso[1]}…
              </>
            ) : (
              <>
                <FileArchive size={16} /> Gerar .zip
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Ano de serviço</span>
          <select className="input" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {rotuloAnoServico(a)}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          <p className="mb-2 font-medium">Conteúdo do .zip</p>
          <ul className="space-y-1">
            {['Total (Publicadores)', 'Total (Pioneiros auxiliares)', 'Total (Pioneiros Reg. Espe. e Missionários em campo)', 'Grupos de Saída de Campo (ativos)', 'Lista de Emergência (por grupo)'].map((n) => (
              <li key={n} className="flex items-center gap-2">
                <FileText size={14} className="shrink-0 text-indigo-600" /> {n}
              </li>
            ))}
            {pastas.map((pasta) => (
              <li key={pasta} className="flex items-center gap-2" style={{ paddingLeft: `${(pasta.split('/').length - 1) * 16}px` }}>
                <Folder size={14} className="shrink-0 text-amber-500" /> {pasta.split('/').at(-1)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
