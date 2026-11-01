import { useMemo, useState } from 'react';
import { FileArchive, FileText, Loader2 } from 'lucide-react';
import { useStore } from '../store/store';
import { anoServicoAtual, anoServicoDe, rotuloAnoServico } from '../domain/serviceYear';
import type { Publicador } from '../domain/types';
import { gerarS21Lote, gerarS21Zip } from '../pdf/s21';
import { salvarArquivoGerado } from '../storage/storage';
import { Modal } from './ui';

type Alcance = 'todos' | 'exibidos' | string; // string = id de grupo

/** Gera de uma vez os cartões S-21 de vários publicadores para um ano de serviço. */
export function GerarCartoes({ aberto, onFechar, exibidos }: { aberto: boolean; onFechar: () => void; exibidos: Publicador[] }) {
  const { db, toast } = useStore();
  const [ano, setAno] = useState(anoServicoAtual());
  const [alcance, setAlcance] = useState<Alcance>('todos');
  const [ordem, setOrdem] = useState<'nome' | 'grupo'>('grupo');
  const [formato, setFormato] = useState<'pdf' | 'zip'>('pdf');
  const [progresso, setProgresso] = useState<[number, number] | null>(null);

  const anos = useMemo(() => {
    const s = new Set([anoServicoAtual()]);
    for (const p of db.publicadores) for (const m of Object.keys(p.relatorios)) s.add(anoServicoDe(m));
    return [...s].sort((a, b) => b - a);
  }, [db.publicadores]);

  const ordemGrupo = useMemo(() => new Map(db.grupos.map((g, i) => [g.id, i])), [db.grupos]);
  const lista = useMemo(() => {
    const base =
      alcance === 'exibidos'
        ? exibidos
        : db.publicadores.filter((p) => !p.arquivado && (alcance === 'todos' || p.grupoId === alcance));
    const porNome = (a: Publicador, b: Publicador) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });
    return [...base].sort((a, b) =>
      ordem === 'grupo'
        ? (ordemGrupo.get(a.grupoId ?? '') ?? 1e9) - (ordemGrupo.get(b.grupoId ?? '') ?? 1e9) || porNome(a, b)
        : porNome(a, b),
    );
  }, [alcance, exibidos, db.publicadores, ordem, ordemGrupo]);

  async function gerar() {
    setProgresso([0, lista.length]);
    try {
      const passo = (f: number, t: number) => setProgresso([f, t]);
      const nomeGrupo = db.grupos.find((g) => g.id === alcance)?.nome;
      const base = `Cartões S-21 ${ano}${nomeGrupo ? ` - ${nomeGrupo}` : ''}`;
      const ok =
        formato === 'pdf'
          ? await salvarArquivoGerado(`${base}.pdf`, await gerarS21Lote(lista, ano, passo), 'application/pdf')
          : await salvarArquivoGerado(`${base}.zip`, await gerarS21Zip(lista, ano, passo), 'application/zip');
      if (ok) {
        toast(`${lista.length} cartões gerados.`);
        onFechar();
      }
    } catch (e) {
      toast(`Erro ao gerar os cartões: ${(e as Error).message}`, 'erro');
    } finally {
      setProgresso(null);
    }
  }

  const opcao = (ativo: boolean) =>
    `flex flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
      ativo ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-300 hover:border-slate-400 dark:border-slate-700'
    }`;

  return (
    <Modal
      aberto={aberto}
      titulo="Gerar cartões S-21"
      onFechar={() => !progresso && onFechar()}
      rodape={
        <>
          <button className="btn-ghost" onClick={onFechar} disabled={!!progresso}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={gerar} disabled={!!progresso || lista.length === 0}>
            {progresso ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Gerando {progresso[0]} de {progresso[1]}…
              </>
            ) : (
              `Gerar ${lista.length} cartões`
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
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Publicadores</span>
            <select className="input" value={alcance} onChange={(e) => setAlcance(e.target.value)}>
              <option value="todos">Todos ({db.publicadores.filter((p) => !p.arquivado).length})</option>
              <option value="exibidos">Os exibidos na lista ({exibidos.length})</option>
              {db.grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Ordem</span>
            <select className="input" value={ordem} onChange={(e) => setOrdem(e.target.value as 'nome' | 'grupo')}>
              <option value="grupo">Por grupo, depois nome</option>
              <option value="nome">Por nome</option>
            </select>
          </label>
        </div>
        <div>
          <span className="label">Formato</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className={opcao(formato === 'pdf')}>
              <input type="radio" className="sr-only" checked={formato === 'pdf'} onChange={() => setFormato('pdf')} />
              <FileText size={20} className="mt-0.5 shrink-0 text-indigo-600" />
              <span>
                <b>Um PDF único</b>
                <span className="block text-xs text-slate-500">Uma página por publicador, pronto para imprimir.</span>
              </span>
            </label>
            <label className={opcao(formato === 'zip')}>
              <input type="radio" className="sr-only" checked={formato === 'zip'} onChange={() => setFormato('zip')} />
              <FileArchive size={20} className="mt-0.5 shrink-0 text-indigo-600" />
              <span>
                <b>Um arquivo por publicador</b>
                <span className="block text-xs text-slate-500">Pasta .zip com um PDF editável para cada um.</span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}
