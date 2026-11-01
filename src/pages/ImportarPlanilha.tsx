import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useStore } from '../store/store';
import { aplicarPlanilha, interpretarGrupo, lerPlanilha, preverPlanilha, type PreviaPlanilha } from '../import/planilhaPublicadores';
import { PRIVILEGIOS } from '../domain/types';

/** Cadastro em lote de publicadores a partir de uma planilha Excel/CSV. */
export function ImportarPlanilha() {
  const { db, atualizar, toast, navegar } = useStore();
  const [previa, setPrevia] = useState<PreviaPlanilha | null>(null);
  const [arquivo, setArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [atualizarExistentes, setAtualizarExistentes] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function carregar(f: File) {
    setErro('');
    setPrevia(null);
    try {
      const linhas = await lerPlanilha(await f.arrayBuffer());
      if (linhas.length === 0) throw new Error('Não encontrei publicadores na planilha (a primeira linha deve ter a coluna "Nome").');
      setArquivo(f.name);
      setPrevia(preverPlanilha(db, linhas));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function confirmar() {
    if (!previa) return;
    let r = { criados: 0, atualizados: 0 };
    atualizar((d) => {
      r = aplicarPlanilha(d, previa, atualizarExistentes);
    });
    toast(`${r.criados} publicadores adicionados${r.atualizados ? `, ${r.atualizados} atualizados` : ''}.`);
    setPrevia(null);
    navegar({ nome: 'grupos' });
  }

  const linhas = previa ? [...previa.novos, ...previa.existentes.map((e) => e.linha)] : [];
  const total = previa ? previa.novos.length + (atualizarExistentes ? previa.existentes.length : 0) : 0;

  return (
    <div className="space-y-5">
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
        <p className="font-medium">Arraste a planilha (.xlsx ou .csv) aqui ou clique para escolher</p>
        <p className="text-xs text-slate-500">Colunas: Nome, Grupo, Sexo, Classe, Batismo/Designação, Categoria</p>
        {arquivo && previa && <p className="flex items-center gap-1 text-sm text-slate-500"><FileSpreadsheet size={14} /> {arquivo}</p>}
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,.csv,.ods"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) carregar(f); e.target.value = ''; }}
        />
      </div>

      {erro && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{erro}</div>}

      {previa && (
        <div className="card space-y-4 p-5">
          <h2 className="font-semibold">Prévia</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-500/10">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">Novos publicadores</p>
              <p className="text-2xl font-semibold">{previa.novos.length}</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
              <p className="text-sm text-slate-600 dark:text-slate-300">Já cadastrados</p>
              <p className="text-2xl font-semibold">{previa.existentes.length}</p>
            </div>
            <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-500/10">
              <p className="text-sm text-indigo-700 dark:text-indigo-300">Grupos a criar</p>
              <p className="text-2xl font-semibold">{previa.gruposNovos.length}</p>
              {previa.gruposNovos.length > 0 && <p className="mt-1 text-xs text-slate-500">{previa.gruposNovos.join(', ')}</p>}
            </div>
          </div>

          {previa.existentes.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-indigo-600" checked={atualizarExistentes} onChange={(e) => setAtualizarExistentes(e.target.checked)} />
              Atualizar grupo, sexo e designações dos {previa.existentes.length} já cadastrados
            </label>
          )}

          <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="th">Nome</th>
                  <th className="th">Grupo</th>
                  <th className="th">Sexo</th>
                  <th className="th">Designações</th>
                  <th className="th">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {linhas.map((l, i) => (
                  <tr key={i} className={i >= previa.novos.length ? 'text-slate-400' : ''}>
                    <td className="td">{l.nome}</td>
                    <td className="td">{l.grupo ? interpretarGrupo(l.grupo).nome : '—'}</td>
                    <td className="td">{l.sexo === 'M' ? 'Masc.' : 'Fem.'}</td>
                    <td className="td text-xs">
                      {[!l.batizado && 'Não batizado', ...PRIVILEGIOS.filter((x) => l.privilegios.includes(x.id)).map((x) => x.label)]
                        .filter(Boolean)
                        .join(', ')}
                    </td>
                    <td className="td text-xs text-slate-500">{i >= previa.novos.length ? 'Já cadastrado' : l.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            O superintendente de cada grupo é definido pelo nome entre parênteses (ex.: "G-2 (Luiz)"); o ajudante você escolhe na tela de grupos.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setPrevia(null)}>Cancelar</button>
            <button className="btn-primary" onClick={confirmar} disabled={total === 0}>
              Importar {total} publicadores
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
