import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileJson, Upload, UserX } from 'lucide-react';
import { useStore } from '../store/store';
import { aplicar, analisarJson, prever, type Previa } from '../import/relatorioCampo';
import { nomeMes } from '../domain/serviceYear';
import { ImportarPlanilha } from './ImportarPlanilha';

type Aba = 'relatorio' | 'planilha';

export function Importar() {
  const [aba, setAba] = useState<Aba>(() => (useStore.getState().db.publicadores.length === 0 ? 'planilha' : 'relatorio'));
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Importar</h1>
        <div className="mt-3 inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {(
            [
              ['relatorio', 'Relatório de campo'],
              ['planilha', 'Publicadores (planilha)'],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                aba === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>
      {aba === 'relatorio' ? <ImportarRelatorio /> : <ImportarPlanilha />}
    </div>
  );
}

function ImportarRelatorio() {
  const { db, atualizar, toast, navegar } = useStore();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [arquivo, setArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [criar, setCriar] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function carregar(f: File) {
    setErro('');
    setPrevia(null);
    try {
      const linhas = analisarJson(await f.text());
      if (linhas.length === 0) throw new Error('O arquivo não tem registros.');
      setArquivo(f.name);
      setPrevia(prever(db, linhas));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function confirmar() {
    if (!previa) return;
    let n = 0;
    atualizar((d) => {
      n = aplicar(d, previa, arquivo, criar);
    });
    toast(`${n} relatórios importados.`);
    setPrevia(null);
    navegar({ nome: 'relatorios', mes: previa.meses[previa.meses.length - 1] });
  }

  const encontrados = previa?.itens.filter((i) => i.publicador) ?? [];
  const naoEncontrados = previa?.itens.filter((i) => !i.publicador) ?? [];
  const sobrescreve = encontrados.filter((i) => i.sobrescreve);
  const mesesJaImportados = previa?.meses.filter((m) => db.importacoes.some((i) => i.mes === m)) ?? [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Selecione o arquivo JSON exportado pelo sistema de relatórios. Você verá uma prévia antes de confirmar.</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const f = e.dataTransfer.files[0];
          if (f) carregar(f);
        }}
        onClick={() => input.current?.click()}
        className={`card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed p-10 text-center transition ${
          arrastando ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'hover:border-indigo-300'
        }`}
      >
        <Upload className="text-indigo-500" />
        <p className="font-medium">Arraste o arquivo .json aqui ou clique para escolher</p>
        {arquivo && previa && <p className="flex items-center gap-1 text-sm text-slate-500"><FileJson size={14} /> {arquivo}</p>}
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) carregar(f); e.target.value = ''; }} />
      </div>

      {erro && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{erro}</div>}

      {previa && (
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Prévia</h2>
            {previa.meses.map((m) => (
              <span key={m} className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{nomeMes(m)}</span>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-500/10">
              <p className="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={16} /> Encontrados</p>
              <p className="text-2xl font-semibold">{encontrados.length}</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10">
              <p className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle size={16} /> Não encontrados</p>
              <p className="text-2xl font-semibold">{naoEncontrados.length}</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
              <p className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300"><UserX size={16} /> Sem relatório</p>
              <p className="text-2xl font-semibold">{previa.semRelatorio.length}</p>
            </div>
          </div>

          {mesesJaImportados.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              {mesesJaImportados.map(nomeMes).join(', ')} já {mesesJaImportados.length > 1 ? 'foram importados' : 'foi importado'}. Os {sobrescreve.length} relatórios existentes serão substituídos.
            </p>
          )}

          {encontrados.some((i) => i.reativa) && (
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
              Voltarão a ser ativos (estavam marcados como inativos):{' '}
              <b>{encontrados.filter((i) => i.reativa).map((i) => i.publicador!.nome).join(', ')}</b>
            </p>
          )}

          {naoEncontrados.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Nomes não encontrados no cadastro:</p>
              <div className="flex flex-wrap gap-1.5">
                {naoEncontrados.map((i, k) => (
                  <span key={k} className="badge bg-amber-100 py-1 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{i.linha.nome}</span>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-indigo-600" checked={criar} onChange={(e) => setCriar(e.target.checked)} />
                Cadastrar automaticamente os não encontrados (sem grupo)
              </label>
            </div>
          )}

          {previa.semRelatorio.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Publicadores cadastrados sem relatório no arquivo ({previa.semRelatorio.length})</summary>
              <p className="mt-2 text-slate-500">{previa.semRelatorio.map((p) => p.nome).join(', ')}</p>
            </details>
          )}

          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="th">Nome</th>
                  <th className="th">Mês</th>
                  <th className="th text-center">Part.</th>
                  <th className="th text-center">Estudos</th>
                  <th className="th text-center">Aux.</th>
                  <th className="th text-center">Horas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {previa.itens.map((i, k) => (
                  <tr key={k} className={i.publicador ? '' : 'bg-amber-50/60 dark:bg-amber-500/5'}>
                    <td className="td">{i.publicador?.nome ?? i.linha.nome}</td>
                    <td className="td text-slate-500">{i.linha.mes}</td>
                    <td className="td text-center">{i.linha.relatorio.participou ? '✓' : ''}</td>
                    <td className="td text-center tabular-nums">{i.linha.relatorio.estudos ?? ''}</td>
                    <td className="td text-center">{i.linha.relatorio.auxiliar ? '✓' : ''}</td>
                    <td className="td text-center tabular-nums">{i.linha.relatorio.horas ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setPrevia(null)}>Cancelar</button>
            <button className="btn-primary" onClick={confirmar} disabled={encontrados.length === 0 && !criar}>
              Importar {encontrados.length + (criar ? naoEncontrados.length : 0)} relatórios
            </button>
          </div>
        </div>
      )}

      {db.importacoes.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Histórico de importações</h2>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {[...db.importacoes].reverse().map((i) => (
              <li key={i.mes} className="flex justify-between py-2">
                <button className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => navegar({ nome: 'relatorios', mes: i.mes })}>
                  {nomeMes(i.mes)}
                </button>
                <span className="text-slate-500">
                  {i.registros} registros · {i.arquivo} · {new Date(i.data).toLocaleDateString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
