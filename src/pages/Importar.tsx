import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileSpreadsheet, Upload, UserMinus, UserX } from 'lucide-react';
import { useStore } from '../store/store';
import {
  aplicar, comMes, lerColadoRelatorio, lerJsonRelatorio, lerPlanilhaRelatorio, mesSugerido, prever, relataHoras, type LinhaLida, type Previa,
} from '../import/relatorioCampo';
import { BadgesPrivilegio, Toggle } from '../components/ui';
import { mesRelatorioAtual, nomeMes } from '../domain/serviceYear';
import { ImportarPlanilha } from './ImportarPlanilha';

type Aba = 'relatorio' | 'planilha';

export function Importar() {
  const [aba, setAba] = useState<Aba>(() => (useStore.getState().db.publicadores.length === 0 ? 'planilha' : 'relatorio'));
  return (
    <div className="mx-auto max-w-5xl space-y-5">
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

type Ajuste = { auxiliar?: boolean; participou?: boolean };

function ImportarRelatorio() {
  const { db, atualizar, toast, navegar } = useStore();
  const [lidas, setLidas] = useState<LinhaLida[] | null>(null);
  const [mes, setMes] = useState('');
  const [ajustes, setAjustes] = useState<Record<number, Ajuste>>({});
  const [arquivo, setArquivo] = useState('');
  const [erro, setErro] = useState('');
  const [criar, setCriar] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [colado, setColado] = useState('');
  const input = useRef<HTMLInputElement>(null);

  function abrir(linhas: LinhaLida[], nome: string) {
    if (linhas.length === 0) throw new Error('Não encontrei relatórios. A primeira linha deve ter o cabeçalho (Nome, Participou, Estudos, Horas…).');
    setArquivo(nome);
    setMes(mesSugerido(linhas));
    setAjustes({});
    setLidas(linhas);
  }

  async function carregar(f: File) {
    setErro('');
    setLidas(null);
    try {
      const json = f.name.toLowerCase().endsWith('.json');
      abrir(json ? lerJsonRelatorio(await f.text()) : await lerPlanilhaRelatorio(await f.arrayBuffer()), f.name);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function usarColado() {
    setErro('');
    try {
      abrir(lerColadoRelatorio(colado), 'Colado da planilha');
      setColado('');
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const precisaMes = !!lidas?.some((l) => !l.mes);
  const previa = useMemo<Previa | null>(() => {
    if (!lidas || !mes) return null;
    const base = prever(db, comMes(lidas, mes));
    const itens = base.itens.map((it, k) => {
      const a = ajustes[k];
      if (!a) return it;
      return { ...it, linha: { ...it.linha, relatorio: { ...it.linha.relatorio, ...a } } };
    });
    return { ...base, itens };
  }, [db, lidas, mes, ajustes]);

  const ajustar = (k: number, a: Ajuste) => setAjustes((x) => ({ ...x, [k]: { ...x[k], ...a } }));
  const fechar = () => {
    setLidas(null);
    setAjustes({});
  };

  function confirmar() {
    if (!previa) return;
    let n = 0;
    atualizar((d) => {
      n = aplicar(d, previa, arquivo, criar);
    });
    toast(`${n} relatórios de ${previa.meses.map(nomeMes).join(', ')} importados.`);
    fechar();
    navegar({ nome: 'relatorios', mes: previa.meses[previa.meses.length - 1] });
  }

  /** Relatou horas sem ser pioneiro nem estar marcado como PA: provavelmente é auxiliar. */
  const horasSemPioneiro = (i: Previa['itens'][number]) =>
    !!i.publicador && (i.linha.relatorio.horas ?? 0) > 0 && !i.linha.relatorio.auxiliar && !relataHoras(i.publicador);

  const encontrados = previa?.itens.filter((i) => i.publicador) ?? [];
  const naoEncontrados = previa?.itens.filter((i) => !i.publicador) ?? [];
  const sobrescreve = encontrados.filter((i) => i.sobrescreve);
  const mesesJaImportados = previa?.meses.filter((m) => db.importacoes.some((i) => i.mes === m)) ?? [];
  const alertas = previa?.itens.filter(horasSemPioneiro) ?? [];
  const irregulares = previa?.itens.filter((i) => !i.linha.relatorio.participou) ?? [];
  const hoje = new Date();
  // Só importações de verdade: meses criados à mão ou lançados no cartão não entram no histórico.
  const historico = db.importacoes.filter((i) => i.arquivo && i.arquivo !== '(manual)').reverse();

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">
        Hoje é {hoje.toLocaleDateString('pt-BR')}: o relatório a importar agora é o de <b>{nomeMes(mesRelatorioAtual(hoje))}</b> (o mês
        anterior). O mês é sugerido pela data de envio e você confere na prévia.
      </div>
      <p className="text-sm text-slate-500">
        Use a planilha do relatório com as colunas <b>Nome, Participou, Estudos, Horas, Observações</b> e <b>Enviado em</b>. Você poderá conferir e ajustar tudo antes de importar.
      </p>

      {!previa && (
        <div className="grid gap-4 md:grid-cols-2">
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
            className={`card flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-8 text-center transition ${
              arrastando ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'hover:border-indigo-300'
            }`}
          >
            <Upload className="text-indigo-500" />
            <p className="font-medium">Arraste a planilha aqui ou clique para escolher</p>
            <p className="text-xs text-slate-500">Excel (.xlsx), CSV ou JSON</p>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.xls,.ods,.csv,.json,application/json"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) carregar(f); e.target.value = ''; }}
            />
          </div>
          <div className="card flex flex-col gap-2 p-4">
            <p className="flex items-center gap-2 font-medium"><ClipboardPaste size={16} className="text-indigo-500" /> Ou cole da planilha</p>
            <p className="text-xs text-slate-500">No Google Planilhas ou Excel, selecione as colunas com o cabeçalho, copie (Ctrl+C) e cole aqui.</p>
            <textarea
              className="input min-h-[96px] font-mono text-xs"
              placeholder={'Nome\tParticipou\tEstudos\tHoras\tObservações\tEnviado em\nAriel Schmitz Rodrigues\tSim\t1\t\t\t01/11/2026, 15:19'}
              value={colado}
              onChange={(e) => setColado(e.target.value)}
            />
            <button className="btn-primary self-end" onClick={usarColado} disabled={!colado.trim()}>
              Ver prévia
            </button>
          </div>
        </div>
      )}

      {erro && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{erro}</div>}

      {previa && (
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">
              Prévia · relatório de <span className="text-indigo-700 dark:text-indigo-300">{previa.meses.map(nomeMes).join(', ')}</span>
            </h2>
            <span className="flex items-center gap-1 text-sm text-slate-500"><FileSpreadsheet size={14} /> {arquivo}</span>
            <div className="ml-auto flex items-center gap-2">
              {precisaMes ? (
                <label className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Mês a que se refere</span>
                  <input type="month" className="input w-auto py-1" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
                </label>
              ) : (
                previa.meses.map((m) => (
                  <span key={m} className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{nomeMes(m)}</span>
                ))
              )}
            </div>
          </div>
          {precisaMes && (
            <p className="-mt-2 text-xs text-slate-500">
              {nomeMes(mes)}: sugerido pela data de envio (o mês anterior). Troque se precisar. A importação fica registrada com a data de hoje,{' '}
              {hoje.toLocaleDateString('pt-BR')}.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            <Resumo cor="emerald" icone={<CheckCircle2 size={16} />} rotulo="Encontrados" valor={encontrados.length} />
            <Resumo cor="amber" icone={<AlertTriangle size={16} />} rotulo="Horas sem ser pioneiro" valor={alertas.length} />
            <Resumo cor="rose" icone={<UserMinus size={16} />} rotulo="Irregulares" valor={irregulares.length} />
            <Resumo cor="slate" icone={<UserX size={16} />} rotulo="Sem relatório" valor={previa.semRelatorio.length} />
          </div>

          {alertas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle size={16} />
              {alertas.length === 1 ? 'Um publicador informou' : `${alertas.length} publicadores informaram`} horas sem ser pioneiro. Se for pioneiro auxiliar este mês, marque <b>PA</b>.
              <button
                className="btn-outline ml-auto py-1"
                onClick={() => previa.itens.forEach((i, k) => horasSemPioneiro(i) && ajustar(k, { auxiliar: true }))}
              >
                Marcar todos como PA
              </button>
            </div>
          )}

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
            <div className="rounded-lg bg-amber-50/60 p-3 dark:bg-amber-500/5">
              <p className="text-sm">
                <b>{naoEncontrados.length}</b> {naoEncontrados.length === 1 ? 'nome não foi encontrado' : 'nomes não foram encontrados'} no cadastro (marcados em amarelo na tabela).
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <Toggle checked={criar} onChange={(e) => setCriar(e.target.checked)} />
                Cadastrar automaticamente os não encontrados (sem grupo)
              </label>
            </div>
          )}

          {previa.semRelatorio.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Publicadores cadastrados sem relatório ({previa.semRelatorio.length})</summary>
              <p className="mt-2 text-slate-500">{previa.semRelatorio.map((p) => p.nome).join(', ')}</p>
            </details>
          )}

          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="th">Nome</th>
                  {!precisaMes && previa.meses.length > 1 && <th className="th">Mês</th>}
                  <th className="th">Participação</th>
                  <th className="th text-center">Estudos</th>
                  <th className="th text-center">Horas</th>
                  <th className="th text-center" title="Pioneiro auxiliar neste mês">PA</th>
                  <th className="th">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {previa.itens.map((i, k) => {
                  const r = i.linha.relatorio;
                  const alerta = horasSemPioneiro(i);
                  const pioneiro = i.publicador && relataHoras(i.publicador);
                  return (
                    <tr key={k} className={!i.publicador ? 'bg-amber-50/70 dark:bg-amber-500/5' : alerta ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''}>
                      <td className="td">
                        <span className="font-medium">{i.publicador?.nome ?? i.linha.nome}</span>
                        {!i.publicador && <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">não encontrado</span>}
                        {pioneiro && <span className="ml-2 align-middle"><BadgesPrivilegio p={i.publicador!} /></span>}
                      </td>
                      {!precisaMes && previa.meses.length > 1 && <td className="td text-slate-500">{nomeMes(i.linha.mes)}</td>}
                      <td className="td">
                        <button
                          type="button"
                          className={`badge cursor-pointer py-1 ${
                            r.participou
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                          }`}
                          title="Clique para trocar"
                          onClick={() => ajustar(k, { participou: !r.participou })}
                        >
                          {r.participou ? 'Participou' : 'Irregular'}
                        </button>
                      </td>
                      <td className="td text-center tabular-nums">{r.estudos ?? ''}</td>
                      <td className="td text-center tabular-nums">
                        {r.horas ?? ''}
                        {alerta && (
                          <span title="Informou horas, mas não é pioneiro. Marque PA se for pioneiro auxiliar este mês.">
                            <AlertTriangle size={14} className="ml-1 inline text-amber-500" />
                          </span>
                        )}
                      </td>
                      <td className="td text-center">
                        {i.publicador?.auxiliarPermanente ? (
                          <span className="badge bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300" title="Pioneiro auxiliar permanente">PAP</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => ajustar(k, { auxiliar: !r.auxiliar })}
                            title={r.auxiliar ? 'Pioneiro auxiliar neste mês (clique para tirar)' : 'Marcar como pioneiro auxiliar neste mês'}
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition ${
                              r.auxiliar
                                ? 'border-lime-500 bg-lime-100 text-lime-700 dark:bg-lime-500/20 dark:text-lime-300'
                                : alerta
                                  ? 'border-amber-400 text-amber-600 hover:bg-amber-100 dark:text-amber-300'
                                  : 'border-dashed border-slate-300 text-slate-400 hover:border-slate-400 dark:border-slate-700'
                            }`}
                          >
                            PA
                          </button>
                        )}
                      </td>
                      <td className="td text-slate-500">{r.obs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={fechar}>Cancelar</button>
            <button className="btn-primary" onClick={confirmar} disabled={encontrados.length === 0 && !criar}>
              Importar {encontrados.length + (criar ? naoEncontrados.length : 0)} relatórios
            </button>
          </div>
        </div>
      )}

      {historico.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Histórico de importações</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Relatório de</th>
                <th className="th">Importado em</th>
                <th className="th">Arquivo</th>
                <th className="th text-right">Relatórios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {historico.map((i) => (
                <tr key={i.mes}>
                  <td className="td">
                    <button className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => navegar({ nome: 'relatorios', mes: i.mes })}>
                      {nomeMes(i.mes)}
                    </button>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{new Date(i.data).toLocaleDateString('pt-BR')}</td>
                  <td className="td text-slate-500">{i.arquivo}</td>
                  <td className="td text-right tabular-nums text-slate-500">{i.registros}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CORES_RESUMO = {
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function Resumo({ cor, icone, rotulo, valor }: { cor: keyof typeof CORES_RESUMO; icone: ReactNode; rotulo: string; valor: number }) {
  return (
    <div className={`rounded-lg p-3 ${CORES_RESUMO[cor]}`}>
      <p className="flex items-center gap-1 text-sm">{icone} {rotulo}</p>
      <p className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{valor}</p>
    </div>
  );
}
