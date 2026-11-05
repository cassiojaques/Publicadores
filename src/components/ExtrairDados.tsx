import { useEffect, useMemo, useRef, useState } from 'react';
import { FileArchive, FileText, Folder, Loader2 } from 'lucide-react';
import { useStore } from '../store/store';
import { anoServicoAtual, anoServicoDe } from '../domain/serviceYear';
import { ARQUIVOS_RAIZ, gerarSelecao, pastasDaExtracao, totalDaExtracao } from '../pdf/extracao';
import { salvarArquivoGerado } from '../storage/storage';
import { Modal, SeletorAnoServico } from './ui';

function Marca({ marcado, parcial, onChange, rotulo }: { marcado: boolean; parcial?: boolean; onChange: () => void; rotulo: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!parcial && !marcado;
  }, [parcial, marcado]);
  return <input ref={ref} type="checkbox" className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-600" checked={marcado} onChange={onChange} aria-label={rotulo} />;
}

/**
 * Extrai o arquivo da congregação: os cartões S-21 do ano de serviço em pastas
 * (Ativos/Inativos, pioneiros e outros publicadores por grupo) e, na raiz, os totais,
 * os grupos de campo, a lista de emergência e o S-88. Dá para escolher o que sai: cada PDF da raiz
 * e cada pasta (sem escolher os cartões de dentro). Um PDF sozinho sai como arquivo; o resto, em .zip.
 */
export function ExtrairDados({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { db, toast } = useStore();
  const [ano, setAno] = useState(anoServicoAtual());
  const [progresso, setProgresso] = useState<[number, number] | null>(null);
  // Tudo vem marcado: guardamos só o que foi desmarcado.
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (aberto) setDesmarcados(new Set());
  }, [aberto]);

  const anos = useMemo(() => {
    const s = new Set([anoServicoAtual()]);
    for (const p of db.publicadores) for (const m of Object.keys(p.relatorios)) s.add(anoServicoDe(m));
    return [...s].filter((a) => a <= anoServicoAtual()).sort((a, b) => b - a);
  }, [db.publicadores]);

  const pastas = useMemo(() => (aberto ? pastasDaExtracao(db) : { todas: [] as string[], folhas: new Set<string>() }), [aberto, db]);
  const descendentes = (pasta: string) => pastas.todas.filter((x) => x.startsWith(`${pasta}/`));
  const ids = useMemo(() => [...ARQUIVOS_RAIZ, ...pastas.todas], [pastas]);

  const alternar = (grupo: string[]) =>
    setDesmarcados((atual) => {
      const novo = new Set(atual);
      const todosMarcados = grupo.every((x) => !novo.has(x));
      for (const x of grupo) (todosMarcados ? novo.add(x) : novo.delete(x));
      return novo;
    });

  const selecao = useMemo(
    () => ({
      arquivos: ARQUIVOS_RAIZ.filter((a) => !desmarcados.has(a)),
      pastas: [...pastas.folhas].filter((f) => !desmarcados.has(f)),
    }),
    [desmarcados, pastas],
  );
  const itens = selecao.arquivos.length + selecao.pastas.length;
  const arquivoUnico = selecao.pastas.length === 0 && selecao.arquivos.length === 1;
  const totalGerar = useMemo(() => (aberto ? totalDaExtracao(db, selecao) : 0), [aberto, db, selecao]);

  async function gerar() {
    setProgresso([0, totalGerar]);
    try {
      const r = await gerarSelecao(db, ano, selecao, (f, t) => setProgresso([f, t]));
      if (await salvarArquivoGerado(r.nome, r.bytes, r.mime)) {
        toast(r.mime === 'application/pdf' ? 'Arquivo extraído.' : `${r.quantidade} ${r.quantidade === 1 ? 'arquivo extraído' : 'arquivos extraídos'} no .zip.`);
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
          <button className="btn-primary" onClick={gerar} disabled={!!progresso || itens === 0 || db.publicadores.length === 0}>
            {progresso ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Gerando {progresso[0]} de {progresso[1]}…
              </>
            ) : (
              <>
                <FileArchive size={16} /> {arquivoUnico ? 'Gerar arquivo' : 'Gerar .zip'}
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="label mb-0">Ano de serviço</span>
          <SeletorAnoServico ano={ano} anos={anos} onChange={setAno} />
        </div>
        <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              O que extrair <span className="font-normal text-slate-500">· {itens} {itens === 1 ? 'item' : 'itens'}</span>
            </p>
            <span className="flex gap-3 text-xs">
              <button className="text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => setDesmarcados(new Set())} disabled={!!progresso}>
                Marcar todos
              </button>
              <button className="text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => setDesmarcados(new Set(ids))} disabled={!!progresso}>
                Desmarcar todos
              </button>
            </span>
          </div>
          <ul className="space-y-1">
            {ARQUIVOS_RAIZ.map((n) => (
              <li key={n}>
                <label className="flex cursor-pointer items-center gap-2">
                  <Marca marcado={!desmarcados.has(n)} onChange={() => alternar([n])} rotulo={n} />
                  <FileText size={14} className="shrink-0 text-indigo-600" /> {n.replace(/\.pdf$/, '')}
                </label>
              </li>
            ))}
            {pastas.todas.map((pasta) => {
              const grupo = [pasta, ...descendentes(pasta)];
              // Pasta que só guarda outras pastas vale pelo que há dentro dela.
              const base = grupo.length > 1 ? grupo.slice(1) : grupo;
              const marcados = base.filter((x) => !desmarcados.has(x)).length;
              return (
                <li key={pasta} style={{ paddingLeft: `${(pasta.split('/').length - 1) * 16}px` }}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <Marca marcado={marcados === base.length} parcial={marcados > 0} onChange={() => alternar(grupo)} rotulo={pasta} />
                    <Folder size={14} className="shrink-0 text-amber-500" /> {pasta.split('/').at(-1)}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
