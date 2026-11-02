import { useMemo, useState, type KeyboardEvent } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, Download, Loader2, Pencil, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { definirAuxiliar, definirRelatorio, excluirRelatorio, mesesComDados, useStore } from '../store/store';
import {
  anosServicoComDados, creditosAprovados, formatarData, LIMITE_HORAS_COM_CREDITO, MESES_ANO_SERVICO, mesesDoAnoServico,
  rotuloAnoServico, situacao, totaisAnoServico, totalComCreditos,
} from '../domain/serviceYear';
import { auxiliarNoMes, PRIVILEGIOS, type RelatorioMes } from '../domain/types';
import { Avatar, BadgeSituacao, Confirmar, Toggle } from '../components/ui';
import { FormPublicador } from '../components/FormPublicador';
import { gerarS21Bytes } from '../pdf/s21';
import { salvarArquivoGerado } from '../storage/storage';

function Caixa({ marcado, rotulo }: { marcado: boolean; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] font-bold ${
          marcado ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-400'
        }`}
      >
        {marcado && '✓'}
      </span>
      <span className={marcado ? 'font-medium' : 'text-slate-500'}>{rotulo}</span>
    </span>
  );
}

export function PublicadorDetalhe({ id }: { id: string }) {
  const { db, navegar, atualizar, toast } = useStore();
  const p = db.publicadores.find((x) => x.id === id);
  const anos = useMemo(() => (p ? anosServicoComDados(p) : []), [p]);
  const [ano, setAno] = useState(() => anos[0]);
  const [editar, setEditar] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [gerando, setGerando] = useState(false);

  if (!p)
    return (
      <div className="text-center text-slate-500">
        Publicador não encontrado.{' '}
        <button className="text-indigo-600" onClick={() => navegar({ nome: 'publicadores' })}>
          Voltar
        </button>
      </div>
    );

  const grupo = db.grupos.find((g) => g.id === p.grupoId);
  const funcao = grupo?.superintendenteId === p.id ? 'Superintendente' : grupo?.ajudanteId === p.id ? 'Ajudante' : null;
  const meses = mesesDoAnoServico(ano);
  const tot = totaisAnoServico(p, ano);

  function editarMes<K extends keyof RelatorioMes>(mes: string, campo: K, valor: RelatorioMes[K]) {
    atualizar((d) => definirRelatorio(d, id, mes, campo, valor));
  }

  async function exportar() {
    setGerando(true);
    try {
      const nome = `S-21 ${p!.nome} ${ano}.pdf`;
      if (await salvarArquivoGerado(nome, await gerarS21Bytes(p!, ano), 'application/pdf')) toast('Cartão exportado.');
    } catch (e) {
      toast(`Erro ao gerar PDF: ${(e as Error).message}`, 'erro');
    } finally {
      setGerando(false);
    }
  }

  const pioneiro = p.privilegios.includes('pioneiro_regular');

  /** Setas andam entre os campos da tabela, como numa planilha. */
  function navegarComSetas(e: KeyboardEvent<HTMLTableSectionElement>) {
    const alvo = e.target as HTMLInputElement;
    const td = alvo.closest('td');
    const tr = td?.parentElement as HTMLTableRowElement | null;
    if (!td || !tr || alvo.tagName !== 'INPUT' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    // No texto, esquerda/direita só saem do campo quando o cursor já está na ponta.
    if (alvo.type === 'text') {
      const { selectionStart: ini, selectionEnd: fim, value } = alvo;
      if (e.key === 'ArrowLeft' && !(ini === 0 && fim === 0)) return;
      if (e.key === 'ArrowRight' && !(ini === value.length && fim === value.length)) return;
    }

    const linhas = [...e.currentTarget.rows];
    const campoDe = (c: Element | undefined) => c?.querySelector('input') ?? null;
    let destino: HTMLInputElement | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const passo = e.key === 'ArrowUp' ? -1 : 1;
      for (let l = tr.sectionRowIndex + passo; !destino && l >= 0 && l < linhas.length; l += passo)
        destino = campoDe(linhas[l].cells[td.cellIndex]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const passo = e.key === 'ArrowLeft' ? -1 : 1;
      for (let c = td.cellIndex + passo; !destino && c >= 0 && c < tr.cells.length; c += passo) destino = campoDe(tr.cells[c]);
    } else return;

    // Sempre impede o padrão (número não muda com a seta), mesmo sem ter para onde ir.
    e.preventDefault();
    if (!destino) return;
    destino.focus();
    if (destino.type !== 'checkbox') destino.select();
  }

  const numInput = (mes: string, campo: 'estudos' | 'horas' | 'creditos', v: number | null | undefined) => (
    <input
      type="number"
      min={0}
      className="w-full bg-transparent px-2 py-1.5 text-center tabular-nums outline-none focus:bg-indigo-50 dark:focus:bg-indigo-500/10"
      value={v ?? ''}
      onChange={(e) => editarMes(mes, campo, e.target.value === '' ? null : Number(e.target.value))}
    />
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <button className="btn-ghost -ml-2" onClick={() => navegar({ nome: 'publicadores' })}>
        <ArrowLeft size={16} /> Publicadores
      </button>

      <div className="card flex flex-wrap items-start gap-4 p-5">
        <Avatar nome={p.nome} tamanho={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{p.nome}</h1>
            <BadgeSituacao s={situacao(p, mesesComDados(db))} />
            {p.arquivado && <span className="badge bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Arquivado</span>}
          </div>
          <p className="text-sm text-slate-500">
            {grupo ? grupo.nome : 'Sem grupo'}
            {funcao && ` · ${funcao}`}
            {p.telefone && ` · ${p.telefone}`}
          </p>
          {p.endereco && <p className="text-sm text-slate-500">{p.endereco}</p>}
          {p.anotacoes && <p className="mt-2 whitespace-pre-wrap text-sm">{p.anotacoes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => setEditar(true)}>
            <Pencil size={16} /> Editar
          </button>
          <button
            className={p.inativo ? 'btn-outline text-emerald-700 dark:text-emerald-300' : 'btn-outline text-rose-600'}
            title={p.inativo ? 'Remover a marcação manual de inativo' : 'Marcar como inativo'}
            onClick={() => {
              atualizar((d) => {
                const x = d.publicadores.find((y) => y.id === id)!;
                x.inativo = !x.inativo;
              });
              toast(p.inativo ? `${p.nome} reativado.` : `${p.nome} marcado como inativo.`);
            }}
          >
            {p.inativo ? <UserCheck size={16} /> : <UserX size={16} />}
            {p.inativo ? 'Reativar' : 'Inativo'}
          </button>
          <button
            className="btn-ghost"
            title={p.arquivado ? 'Restaurar' : 'Arquivar (mudou-se, etc.)'}
            onClick={() => atualizar((d) => {
              const x = d.publicadores.find((y) => y.id === id)!;
              x.arquivado = !x.arquivado;
              if (x.arquivado) for (const g of d.grupos) {
                if (g.superintendenteId === id) g.superintendenteId = null;
                if (g.ajudanteId === id) g.ajudanteId = null;
              }
            })}
          >
            {p.arquivado ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          <button className="btn-ghost text-rose-600" title="Excluir" onClick={() => setExcluir(true)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Registro de Publicador (S-21) */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h2 className="font-semibold">Registro de Publicador de Congregação</h2>
          <div className="flex items-center gap-2">
            <select className="input w-auto" value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano de serviço">
              {anos.map((a) => (
                <option key={a} value={a}>
                  {rotuloAnoServico(a)}
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={exportar} disabled={gerando}>
              {gerando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              PDF
            </button>
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
          <p><span className="text-slate-500">Data de nascimento:</span> {formatarData(p.nascimento) || '—'}</p>
          <div className="flex gap-4">
            <Caixa marcado={p.sexo === 'M'} rotulo="Masculino" />
            <Caixa marcado={p.sexo === 'F'} rotulo="Feminino" />
          </div>
          <p><span className="text-slate-500">Data de batismo:</span> {formatarData(p.batismo) || (p.batizado ? '—' : 'Não batizado')}</p>
          <div className="flex gap-4">
            <Caixa marcado={p.esperanca === 'outras_ovelhas'} rotulo="Outras ovelhas" />
            <Caixa marcado={p.esperanca === 'ungido'} rotulo="Ungido" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 sm:col-span-2">
            {PRIVILEGIOS.map((x) => (
              <Caixa key={x.id} marcado={p.privilegios.includes(x.id)} rotulo={x.label} />
            ))}
            <Caixa marcado={p.auxiliarPermanente} rotulo="Pioneiro auxiliar permanente" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-t border-slate-200 text-sm dark:border-slate-800">
            <thead>
              <tr className="divide-x divide-slate-200 dark:divide-slate-800">
                <th className="th w-32">Ano de serviço {ano}</th>
                <th className="th w-24 text-center">Participou</th>
                <th className="th w-24 text-center">Estudos</th>
                <th className="th w-24 text-center">Pion. aux.</th>
                <th className="th w-24 text-center">Horas</th>
                <th className="th">Observações</th>
                {pioneiro && (
                  <>
                    <th className="th w-24 text-center">Créditos</th>
                    <th className="th w-24 text-center" title={`Só o que cabe até ${LIMITE_HORAS_COM_CREDITO} h somando com as horas`}>Aprovados</th>
                    <th className="th w-24 text-center">Total c/ créditos</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800" onKeyDown={navegarComSetas}>
              {meses.map((mes, i) => {
                const r = p.relatorios[mes];
                return (
                  <tr key={mes} className="divide-x divide-slate-200 dark:divide-slate-800">
                    <td className="td">
                      <span className="flex items-center justify-between gap-1">
                        {MESES_ANO_SERVICO[i]}
                        {r && (
                          <button
                            className="rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-600 dark:hover:bg-rose-500/10"
                            title={`Excluir o relatório de ${MESES_ANO_SERVICO[i]}`}
                            onClick={() => atualizar((d) => excluirRelatorio(d, id, mes))}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </span>
                    </td>
                    <td className="text-center">
                      <Toggle checked={!!r?.participou} onChange={(e) => editarMes(mes, 'participou', e.target.checked)} aria-label={`Participou em ${MESES_ANO_SERVICO[i]}`} />
                    </td>
                    <td>{numInput(mes, 'estudos', r?.estudos)}</td>
                    <td className="text-center">
                      <Toggle checked={r ? r.auxiliar : auxiliarNoMes(p, mes)} onChange={(e) => atualizar((d) => definirAuxiliar(d, id, mes, e.target.checked))} aria-label={`Pioneiro auxiliar em ${MESES_ANO_SERVICO[i]}`} />
                    </td>
                    <td>{numInput(mes, 'horas', r?.horas)}</td>
                    <td>
                      <input className="w-full bg-transparent px-2 py-1.5 outline-none focus:bg-indigo-50 dark:focus:bg-indigo-500/10" value={r?.obs ?? ''} onChange={(e) => editarMes(mes, 'obs', e.target.value)} />
                    </td>
                    {pioneiro && (
                      <>
                        <td>{numInput(mes, 'creditos', r?.creditos)}</td>
                        <td className="td text-center tabular-nums text-slate-500">{r?.creditos ? creditosAprovados(r) : ''}</td>
                        <td className="td text-center font-medium tabular-nums">{r?.creditos ? totalComCreditos(r) : ''}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-900/60">
              <tr className="divide-x divide-slate-200 dark:divide-slate-800">
                <td className="td">Total</td>
                <td className="td text-center tabular-nums">{tot.mesesParticipou}</td>
                <td className="td" />
                <td className="td" />
                <td className="td text-center tabular-nums">{tot.horas || ''}</td>
                <td className="td" />
                {pioneiro && (
                  <>
                    <td className="td text-center tabular-nums">{tot.creditos || ''}</td>
                    <td className="td text-center tabular-nums">{tot.aprovados || ''}</td>
                    <td className="td text-center tabular-nums">{tot.totalComCreditos || ''}</td>
                  </>
                )}
              </tr>
            </tfoot>

          </table>
        </div>
      </div>

      <FormPublicador aberto={editar} publicador={p} onFechar={() => setEditar(false)} />
      <Confirmar
        aberto={excluir}
        perigo
        titulo="Excluir publicador"
        textoBotao="Excluir"
        mensagem={<>Excluir <b>{p.nome}</b> e todo o seu histórico de relatórios? Para quem se mudou, prefira <b>arquivar</b>.</>}
        onFechar={() => setExcluir(false)}
        onConfirmar={() => {
          navegar({ nome: 'publicadores' });
          atualizar((d) => {
            d.publicadores = d.publicadores.filter((x) => x.id !== id);
            for (const g of d.grupos) {
              if (g.superintendenteId === id) g.superintendenteId = null;
              if (g.ajudanteId === id) g.ajudanteId = null;
            }
          });
          toast('Publicador excluído.');
        }}
      />
    </div>
  );
}
