import { useMemo, useRef, useState } from 'react';
import { BarChart3, Download, FileUp, Loader2 } from 'lucide-react';
import { useStore } from '../store/store';
import { anosComAssistencia, formatarMedia, mediaAno, mediaMes, TIPOS_REUNIAO } from '../domain/assistencia';
import { anoServicoAtual, mesesDoAnoServico, nomeMes } from '../domain/serviceYear';
import type { AssistenciaReuniao, TipoReuniao } from '../domain/types';
import { SeletorAnoServico } from '../components/ui';
import { gerarS88Bytes, lerS88 } from '../pdf/s88';
import { salvarArquivoGerado } from '../storage/storage';

const nomeSoMes = (chave: string) => nomeMes(chave).split(' ')[0];

/** Registro da assistência às reuniões (S-88): preenchimento por ano de serviço e histórico dos anos. */
export function Assistencia() {
  const { db, atualizar, toast } = useStore();
  const [ano, setAno] = useState(anoServicoAtual());
  const [gerando, setGerando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const anosHistorico = useMemo(() => anosComAssistencia(db), [db]);
  const anos = useMemo(() => [...new Set([anoServicoAtual(), ...anosHistorico])].sort((a, b) => b - a), [anosHistorico]);
  const meses = mesesDoAnoServico(ano);

  function editar(mes: string, tipo: TipoReuniao, campo: keyof AssistenciaReuniao, texto: string) {
    const n = texto === '' ? null : Math.max(0, Math.trunc(Number(texto)));
    atualizar((d) => {
      const m = (d.assistencia[mes] ??= {});
      const a = (m[tipo] ??= { reunioes: null, total: null });
      a[campo] = n !== null && Number.isFinite(n) ? n : null;
      if (a.reunioes === null && a.total === null) delete m[tipo];
      if (!m.meio && !m.fim) delete d.assistencia[mes];
    });
  }

  async function exportar() {
    setGerando(true);
    try {
      if (await salvarArquivoGerado(`S-88 ${ano - 1}-${ano}.pdf`, await gerarS88Bytes(db, ano), 'application/pdf')) toast('S-88 exportado.');
    } catch (e) {
      toast(`Erro ao gerar PDF: ${(e as Error).message}`, 'erro');
    } finally {
      setGerando(false);
    }
  }

  async function importar(f: File | undefined) {
    if (!f) return;
    try {
      const lido = await lerS88(await f.arrayBuffer());
      const qtd = Object.keys(lido).length;
      if (!qtd) return toast('Não encontrei números de assistência nesse PDF.', 'erro');
      atualizar((d) => {
        for (const [mes, a] of Object.entries(lido)) d.assistencia[mes] = { ...d.assistencia[mes], ...a };
      });
      toast(`${qtd} ${qtd === 1 ? 'mês importado' : 'meses importados'} do S-88.`);
    } catch (e) {
      toast(`Não consegui ler o PDF: ${(e as Error).message}`, 'erro');
    } finally {
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  const campo =
    'w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-center tabular-nums outline-none hover:border-slate-300 focus:border-indigo-500 focus:bg-white dark:hover:border-slate-700 dark:focus:bg-slate-900';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Assistência às reuniões</h1>
          <p className="text-sm text-slate-500">Registro S-88 · média = total ÷ quantidade de reuniões</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeletorAnoServico ano={ano} anos={anos} onChange={setAno} />
          <input ref={arquivo} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
          <button className="btn-outline" onClick={() => arquivo.current?.click()} title="Traz os números de um S-88 já preenchido">
            <FileUp size={16} /> Importar S-88
          </button>
          <button className="btn-primary" onClick={exportar} disabled={gerando}>
            {gerando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Exportar S-88
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {TIPOS_REUNIAO.map(({ id, rotulo }) => (
          <div key={id} className="card overflow-hidden">
            <h2 className="flex items-center gap-2 px-4 pt-4 font-semibold">
              <span className="text-indigo-500">
                <BarChart3 size={18} />
              </span>
              {rotulo}
            </h2>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Mês</th>
                  <th className="th text-center">Reuniões</th>
                  <th className="th text-center">Assistência total</th>
                  <th className="th text-center">Média</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {meses.map((mes) => {
                  const a = db.assistencia[mes]?.[id];
                  return (
                    <tr key={mes}>
                      <td className="px-3 py-1">{nomeSoMes(mes)}</td>
                      <td className="px-1 py-0.5">
                        <input className={campo} type="number" min={0} inputMode="numeric" aria-label={`${nomeSoMes(mes)}: quantidade de reuniões`} value={a?.reunioes ?? ''} onChange={(e) => editar(mes, id, 'reunioes', e.target.value)} />
                      </td>
                      <td className="px-1 py-0.5">
                        <input className={campo} type="number" min={0} inputMode="numeric" aria-label={`${nomeSoMes(mes)}: assistência total`} value={a?.total ?? ''} onChange={(e) => editar(mes, id, 'total', e.target.value)} />
                      </td>
                      <td className="px-3 py-1 text-center tabular-nums text-slate-600 dark:text-slate-300">{formatarMedia(mediaMes(a)) || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-indigo-50/60 font-semibold dark:border-slate-700 dark:bg-slate-800/60">
                  <td className="px-3 py-2" colSpan={3}>
                    Assistência média por mês
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{formatarMedia(mediaAno(db, ano, id)) || '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold">Histórico</h2>
        <p className="px-4 text-sm text-slate-500">Média por mês de cada ano de serviço. Clique numa linha para abrir o ano.</p>
        {anosHistorico.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Nenhum dado ainda. Preencha os meses acima ou importe um S-88.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr>
                <th className="th">Ano de serviço</th>
                <th className="th text-center">Meio de semana</th>
                <th className="th text-center">Fim de semana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {anosHistorico.map((a) => (
                <tr key={a} className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${a === ano ? 'bg-indigo-50/50 dark:bg-indigo-500/10' : ''}`} onClick={() => setAno(a)}>
                  <td className="px-3 py-2 font-medium">
                    {a} <span className="text-xs font-normal text-slate-400">set/{a - 1} – ago/{a}</span>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{formatarMedia(mediaAno(db, a, 'meio')) || '—'}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{formatarMedia(mediaAno(db, a, 'fim')) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
