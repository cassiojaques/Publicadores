import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy, ClipboardList, FileInput, FileText, ImageDown, Loader2, Search, Trash2, X } from 'lucide-react';
import {
  definirAuxiliar, definirRelatorio, excluirMes, excluirRelatorio, garantirMes, mesesComDados, useStore,
} from '../store/store';
import { anoServicoDe, mesRelatorioAtual, nomeMes } from '../domain/serviceYear';
import { faltantesPorGrupo, statusDoMes, textoFaltantes, totaisDoMes, type LinhaMes, type StatusMes } from '../domain/relatorios';
import { auxiliarNoMes, type RelatorioMes, type TipoReuniao } from '../domain/types';
import { formatarMedia, mediaMes, TIPOS_REUNIAO } from '../domain/assistencia';
import { Avatar, BadgesPrivilegio, Campo, Confirmar, Modal, Toggle, Vazio } from '../components/ui';
import { gerarImagemFaltantes } from '../imagem/faltantes';
import { salvarArquivoGerado } from '../storage/storage';

/** Mesmas cores dos grupos no mapa. */
const CORES_GRUPO = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#e11d48', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#ec4899', '#0891b2', '#a16207'];

const ROTULO_STATUS: Record<StatusMes, { t: string; c: string }> = {
  relatou: { t: 'Relatou', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  falta: { t: 'Falta', c: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  inativo: { t: 'Inativo', c: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

type Filtro = 'falta' | 'relatou' | 'inativo' | 'todos';

export function Relatorios({ mesInicial }: { mesInicial?: string }) {
  const { db, atualizar, toast, navegar } = useStore();
  const meses = useMemo(() => mesesComDados(db), [db]);
  const lista = useMemo(() => [...meses].sort().reverse(), [meses]);
  const [mesSel, setMesSel] = useState<string | undefined>(mesInicial);
  // Em novembro se entrega o relatório de outubro: é esse que abre por padrão, não o último mês lançado.
  const aRelatar = mesRelatorioAtual();
  const padrao = meses.has(aRelatar) ? aRelatar : (lista.find((m) => m <= aRelatar) ?? lista[0]);
  const mes = mesSel && meses.has(mesSel) ? mesSel : padrao;
  const [novoMes, setNovoMes] = useState<string | null>(null);
  const [excluir, setExcluir] = useState(false);

  if (!mes)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <div className="card">
          <Vazio icone={<ClipboardList size={40} />} titulo="Nenhum relatório ainda">
            <p className="text-sm">Importe o relatório de campo do mês ou crie um mês para preencher à mão.</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-primary" onClick={() => navegar({ nome: 'importar' })}>
                <FileInput size={16} /> Importar relatório
              </button>
              <button className="btn-outline" onClick={() => setNovoMes(mesRelatorioAtual())}>
                <CalendarPlus size={16} /> Novo mês
              </button>
            </div>
          </Vazio>
        </div>
        <NovoMes valor={novoMes} setValor={setNovoMes} onCriar={(m) => setMesSel(m)} />
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">Relatórios</h1>
          <p className="text-sm text-slate-500">
            Agora, em {new Date().toLocaleDateString('pt-BR', { month: 'long' })}, os publicadores entregam o relatório de <b>{nomeMes(aRelatar)}</b>.
            <span className="hidden md:inline"> Alterações aqui atualizam os cartões S-21 na hora.</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mes !== aRelatar && meses.has(aRelatar) && (
            <button className="btn-outline" onClick={() => setMesSel(aRelatar)}>
              Ir para {nomeMes(aRelatar)}
            </button>
          )}
          <button className="btn-outline" onClick={() => setNovoMes(mesRelatorioAtual())}>
            <CalendarPlus size={16} /> Novo mês
          </button>
          <button className="btn-primary" onClick={() => navegar({ nome: 'importar' })}>
            <FileInput size={16} /> Importar
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <ListaMeses meses={lista} atual={mes} aRelatar={aRelatar} onEscolher={setMesSel} />
        <DetalheMes key={mes} mes={mes} onExcluirMes={() => setExcluir(true)} />
      </div>

      <NovoMes valor={novoMes} setValor={setNovoMes} onCriar={(m) => setMesSel(m)} />
      <Confirmar
        aberto={excluir}
        perigo
        titulo={`Excluir ${nomeMes(mes)}`}
        textoBotao="Excluir o mês"
        mensagem={
          <>
            Isto apaga os relatórios de <b>{nomeMes(mes)}</b> de todos os publicadores, inclusive dos cartões S-21. Use
            se importou o mês errado; depois você pode importar de novo.
          </>
        }
        onFechar={() => setExcluir(false)}
        onConfirmar={() => {
          atualizar((d) => excluirMes(d, mes));
          setMesSel(undefined);
          toast(`${nomeMes(mes)} excluído.`);
        }}
      />
    </div>
  );
}

function ListaMeses({
  meses: ms,
  atual,
  aRelatar,
  onEscolher,
}: {
  meses: string[];
  atual: string;
  aRelatar: string;
  onEscolher: (m: string) => void;
}) {
  const db = useStore((e) => e.db);
  const meses = useMemo(() => mesesComDados(db), [db]);
  const temARelatar = ms.includes(aRelatar);
  // Do mais recente para o mais antigo; os meses futuros (lançados antes da hora) vão para o fim.
  const outros = [...ms.filter((m) => m < aRelatar), ...ms.filter((m) => m > aRelatar).reverse()];

  const faixa = useRef<HTMLDivElement>(null);
  const [podeVoltar, setPodeVoltar] = useState(false);
  const [podeAvancar, setPodeAvancar] = useState(false);
  const medir = () => {
    const el = faixa.current;
    if (!el) return;
    setPodeVoltar(el.scrollLeft > 4);
    setPodeAvancar(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [outros.length]);
  // Mantém o mês aberto visível na faixa.
  useEffect(() => {
    faixa.current?.querySelector<HTMLElement>(`[data-mes="${atual}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [atual]);
  const rolar = (dir: 1 | -1) => faixa.current?.scrollBy({ left: dir * faixa.current.clientWidth * 0.8, behavior: 'smooth' });

  const progresso = (m: string) => {
    const linhas = statusDoMes(db, m, meses);
    const esperados = linhas.filter((l) => l.status !== 'inativo').length;
    const relatou = linhas.filter((l) => l.status === 'relatou').length;
    const faltam = linhas.filter((l) => l.status === 'falta').length;
    return { esperados, relatou, faltam };
  };

  // O mês que está sendo entregue agora fica fixo à esquerda, fora da rolagem, em destaque.
  const destaque = () => {
    const { esperados, relatou, faltam } = progresso(aRelatar);
    const sel = aRelatar === atual;
    return (
      <button
        onClick={() => onEscolher(aRelatar)}
        className={`w-full shrink-0 rounded-xl bg-indigo-600 p-4 text-left text-white shadow-md transition hover:bg-indigo-700 sm:w-64 ${
          sel ? 'ring-2 ring-indigo-300 ring-offset-2 ring-offset-slate-50 dark:ring-indigo-400 dark:ring-offset-slate-950' : ''
        }`}
      >
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-indigo-200">Mês a relatar agora</span>
        <span className="mt-0.5 block text-xl font-bold">{nomeMes(aRelatar)}</span>
        <span className="mt-3 flex items-center gap-3">
          {faltam > 0 ? (
            <span className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-indigo-100">{faltam === 1 ? 'Falta' : 'Faltam'}</span>
              <span className="text-4xl font-bold leading-none tabular-nums">{faltam}</span>
              <span className="text-lg font-semibold text-indigo-100">{faltam === 1 ? 'relatório' : 'relatórios'}</span>
            </span>
          ) : (
            <>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-emerald-950">
                <CheckCircle2 size={24} />
              </span>
              <span className="leading-tight">
                <span className="block text-xl font-bold">Completo</span>
                <span className="block text-xs font-medium text-indigo-100">todos relataram</span>
              </span>
            </>
          )}
        </span>
        <span className="mt-2 block text-xs text-indigo-100">
          {relatou} de {esperados} relataram
        </span>
      </button>
    );
  };

  const item = (m: string) => {
    const { esperados, relatou, faltam } = progresso(m);
    const sel = m === atual;
    const futuro = m > aRelatar;
    return (
      <button
        key={m}
        data-mes={m}
        onClick={() => onEscolher(m)}
        title={futuro ? 'Lançado no cartão antes da hora. Confira ou exclua.' : undefined}
        className={`flex w-44 shrink-0 snap-start flex-col justify-between rounded-xl border p-3 text-left transition ${
          sel
            ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-500/10'
            : `bg-white hover:border-indigo-300 dark:bg-slate-900 ${futuro ? 'border-dashed border-amber-300 dark:border-amber-500/50' : 'border-slate-200 dark:border-slate-800'}`
        }`}
      >
        <span className="flex items-center justify-between gap-2 text-sm">
          <span className={sel ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'font-medium'}>{nomeMes(m)}</span>
        </span>
        <span className="mt-2 flex items-center gap-2">
          {futuro ? (
            <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">futuro</span>
          ) : faltam > 0 ? (
            <>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                <AlertTriangle size={15} />
              </span>
              <span className="text-2xl font-bold leading-none tabular-nums text-rose-600 dark:text-rose-300">{faltam}</span>
              <span className="text-xs text-slate-500">{faltam === 1 ? 'falta' : 'faltam'}</span>
            </>
          ) : (
            <>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                <CheckCircle2 size={16} />
              </span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">Completo</span>
            </>
          )}
        </span>
        <span className="mt-1 block text-[11px] text-slate-400">
          {relatou} de {esperados} relataram
        </span>
      </button>
    );
  };

  const seta = (dir: 1 | -1, ativa: boolean) => (
    <button
      className="grid h-9 w-9 shrink-0 place-items-center max-sm:hidden rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      onClick={() => rolar(dir)}
      disabled={!ativa}
      aria-label={dir < 0 ? 'Meses mais recentes' : 'Meses mais antigos'}
    >
      {dir < 0 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
      {temARelatar && destaque()}
      {outros.length > 0 && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {seta(-1, podeVoltar)}
          <div ref={faixa} onScroll={medir} className="flex min-w-0 flex-1 snap-x gap-2 self-stretch overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {outros.map(item)}
          </div>
          {seta(1, podeAvancar)}
        </div>
      )}
    </div>
  );
}

function NovoMes({ valor, setValor, onCriar }: { valor: string | null; setValor: (v: string | null) => void; onCriar: (m: string) => void }) {
  const { db, atualizar } = useStore();
  const existe = !!valor && mesesComDados(db).has(valor);
  return (
    <Modal
      aberto={valor !== null}
      titulo="Novo mês"
      largura="max-w-sm"
      onFechar={() => setValor(null)}
      rodape={
        <>
          <button className="btn-ghost" onClick={() => setValor(null)}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            disabled={!valor}
            onClick={() => {
              if (!valor) return;
              if (!existe) atualizar((d) => garantirMes(d, valor, '(manual)'));
              onCriar(valor);
              setValor(null);
            }}
          >
            {existe ? 'Abrir' : 'Criar'}
          </button>
        </>
      }
    >
      <label className="label" htmlFor="novo-mes">
        Mês do relatório
      </label>
      <input id="novo-mes" type="month" className="input" value={valor ?? ''} onChange={(e) => setValor(e.target.value)} />
      <p className="mt-2 text-xs text-slate-500">
        {existe ? 'Este mês já existe.' : 'Todos os publicadores aparecerão como faltando até você preencher os relatórios.'}
      </p>
    </Modal>
  );
}

function DetalheMes({ mes, onExcluirMes }: { mes: string; onExcluirMes: () => void }) {
  const { db, atualizar, toast, navegar } = useStore();
  const [filtro, setFiltro] = useState<Filtro>('falta');
  const [grupo, setGrupo] = useState('todos');
  const [q, setQ] = useState('');
  // Linhas editadas nesta aba continuam visíveis mesmo mudando de situação (ex.: de "Falta" para "Relatou").
  const [editadas, setEditadas] = useState<Set<string>>(new Set());
  const mudarFiltro = (f: Filtro) => {
    setFiltro(f);
    setEditadas(new Set());
  };

  const meses = useMemo(() => mesesComDados(db), [db]);
  const linhas = useMemo(() => statusDoMes(db, mes, meses), [db, mes, meses]);
  const totais = useMemo(() => totaisDoMes(linhas), [linhas]);
  const conta = (s: StatusMes) => linhas.filter((l) => l.status === s).length;
  const importacao = db.importacoes.filter((i) => i.mes === mes).at(-1);
  const ordemGrupo = new Map(db.grupos.map((g, i) => [g.id, i]));

  const visiveis = linhas
    .filter((l) => filtro === 'todos' || l.status === filtro || editadas.has(l.p.id))
    .filter((l) => grupo === 'todos' || (grupo === 'sem' ? !l.p.grupoId : l.p.grupoId === grupo))
    .filter((l) => !q.trim() || l.p.nome.toLowerCase().includes(q.trim().toLowerCase()))
    .sort(
      (a, b) =>
        (ordemGrupo.get(a.p.grupoId ?? '') ?? 1e9) - (ordemGrupo.get(b.p.grupoId ?? '') ?? 1e9) ||
        a.p.nome.localeCompare(b.p.nome, 'pt-BR', { numeric: true }),
    );

  async function copiarFaltantes() {
    const texto = textoFaltantes(db, linhas);
    try {
      await navigator.clipboard.writeText(texto);
      toast(`${conta('falta')} nomes copiados, separados por grupo.`);
    } catch {
      toast('Não foi possível copiar.', 'erro');
    }
  }

  const [s1, setS1] = useState(false);
  const [gerandoImagem, setGerandoImagem] = useState(false);
  /** PNG com quem falta, por grupo. Respeita o filtro de grupo da tabela. */
  async function exportarImagemFaltantes() {
    setGerandoImagem(true);
    try {
      const doFiltro = linhas.filter((l) => grupo === 'todos' || (grupo === 'sem' ? !l.p.grupoId : l.p.grupoId === grupo));
      const grupos = faltantesPorGrupo(db, doFiltro);
      const total = grupos.reduce((s, g) => s + g.nomes.length, 0);
      const bytes = await gerarImagemFaltantes(grupos, {
        titulo: `Faltam relatar · ${nomeMes(mes)}`,
        subtitulo: `${db.congregacao.nome || 'Congregação'} · ${total} ${total === 1 ? 'publicador' : 'publicadores'} · ${new Date().toLocaleDateString('pt-BR')}`,
        corDoGrupo: (nome) => {
          const i = db.grupos.findIndex((g) => g.nome === nome);
          return i >= 0 ? CORES_GRUPO[i % CORES_GRUPO.length] : undefined;
        },
      });
      if (await salvarArquivoGerado(`Faltam relatar - ${nomeMes(mes)}.png`, bytes, 'image/png')) toast('Imagem exportada.');
    } catch (e) {
      toast(`Erro ao gerar a imagem: ${(e as Error).message}`, 'erro');
    } finally {
      setGerandoImagem(false);
    }
  }

  /** Ações de edição de uma linha, iguais na tabela (desktop) e na lista (celular). */
  const acoes = (l: LinhaMes) => ({
    onAbrir: () => navegar({ nome: 'publicador', id: l.p.id }),
    onEditar: <K extends keyof RelatorioMes>(campo: K, valor: RelatorioMes[K]) => {
      setEditadas((s) => (s.has(l.p.id) ? s : new Set(s).add(l.p.id)));
      atualizar((d) => definirRelatorio(d, l.p.id, mes, campo, valor));
    },
    onAuxiliar: (valor: boolean) => {
      setEditadas((s) => (s.has(l.p.id) ? s : new Set(s).add(l.p.id)));
      atualizar((d) => definirAuxiliar(d, l.p.id, mes, valor));
    },
    onExcluir: () => {
      atualizar((d) => excluirRelatorio(d, l.p.id, mes));
      toast(`Relatório de ${l.p.nome} excluído.`);
    },
  });

  const abas: [Filtro, string, number][] = [
    ['falta', 'Faltam', conta('falta')],
    ['relatou', 'Relataram', conta('relatou')],
    ['inativo', 'Inativos', conta('inativo')],
    ['todos', 'Todos', linhas.length],
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs text-slate-500">
          {nomeMes(mes)} · ano de serviço {anoServicoDe(mes)} ·{' '}
          {importacao?.arquivo && importacao.arquivo !== '(manual)'
            ? `importado em ${new Date(importacao.data).toLocaleDateString('pt-BR')} (${importacao.arquivo})`
            : 'preenchido manualmente'}
        </p>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button className="btn-primary" onClick={() => setS1(true)} title="Totais do mês para o relatório da congregação">
            <FileText size={16} /> S-1
          </button>
          <button className="btn-outline" onClick={copiarFaltantes} disabled={conta('falta') === 0}>
            <ClipboardCopy size={16} /> Copiar<span className="hidden sm:inline"> nome dos que faltam</span>
          </button>
          <button
            className="btn-outline"
            onClick={exportarImagemFaltantes}
            disabled={conta('falta') === 0 || gerandoImagem}
            title="Imagem com quem falta, separado por grupo (segue o filtro de grupo)"
          >
            {gerandoImagem ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />} <span className="sm:hidden">Imagem</span>
            <span className="max-sm:hidden">Gerar imagem dos que faltam</span>
          </button>
          <button className="btn-ghost text-rose-600" onClick={onExcluirMes} title="Excluir o mês inteiro">
            <Trash2 size={16} /> Excluir mês
          </button>
        </div>
      </div>

      <ModalS1 aberto={s1} onFechar={() => setS1(false)} mes={mes} totais={totais} ativos={linhas.filter((l) => l.status !== 'inativo').length} />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <div className="grid w-full grid-cols-4 rounded-lg border border-slate-200 p-0.5 dark:border-slate-800 md:inline-flex md:w-auto">
            {abas.map(([id, rotulo, n]) => (
              <button
                key={id}
                onClick={() => mudarFiltro(id)}
                className={`flex flex-col items-center rounded-md px-2 py-1.5 text-sm font-medium leading-tight transition md:flex-row md:gap-1.5 md:px-3 ${
                  filtro === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {rotulo} <span className="text-xs opacity-70 md:text-sm">{n}</span>
              </button>
            ))}
          </div>
          <select className="input min-w-0 flex-1 md:w-auto md:flex-none" value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo">
            <option value="todos">Todos os grupos</option>
            {db.grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
            <option value="sem">Sem grupo</option>
          </select>
          <div className="relative min-w-0 flex-[1.4] md:min-w-[160px] md:flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Nome…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {visiveis.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            {filtro === 'falta' ? 'Ninguém faltando. 🎉' : 'Nenhum publicador neste filtro.'}
          </p>
        ) : (
          <>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
            {visiveis.map((l) => (
              <LinhaMovel key={l.p.id} l={l} mes={mes} grupo={db.grupos.find((g) => g.id === l.p.grupoId)?.nome ?? 'Sem grupo'} {...acoes(l)} />
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Nome</th>
                  <th className="th">Grupo</th>
                  <th className="th">Situação</th>
                  <th className="th text-center">Participou</th>
                  <th className="th text-center">Estudos</th>
                  <th className="th text-center">Pion. aux.</th>
                  <th className="th text-center">Horas</th>
                  <th className="th">Observações</th>
                  <th className="th w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visiveis.map((l) => (
                  <Linha key={l.p.id} l={l} mes={mes} grupo={db.grupos.find((g) => g.id === l.p.grupoId)?.nome ?? '—'} {...acoes(l)} />
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

type TotaisS1 = ReturnType<typeof totaisDoMes>;
type CampoS1 = { id: string; rotulo: string; texto: string | null };

/** Totais do mês para preencher o S-1, com um botão de copiar ao lado de cada número. */
function ModalS1({ aberto, onFechar, mes, totais, ativos }: { aberto: boolean; onFechar: () => void; mes: string; totais: TotaisS1; ativos: number }) {
  const { db, toast, navegar } = useStore();
  const [copiado, setCopiado] = useState<string | null>(null);
  async function copiar(id: string, texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500);
    } catch {
      toast(`Não foi possível copiar ${rotulo}.`, 'erro');
    }
  }
  const n = (v: number) => String(v);
  const assistencia = (tipo: TipoReuniao): CampoS1[] => {
    const a = db.assistencia[mes]?.[tipo];
    const media = mediaMes(a);
    return [
      { id: 'reunioes', rotulo: 'Reuniões', texto: a?.reunioes != null ? n(a.reunioes) : null },
      { id: 'total', rotulo: 'Assistência total', texto: a?.total != null ? n(a.total) : null },
      { id: 'media', rotulo: 'Média por reunião', texto: media !== null ? formatarMedia(media) : null },
    ];
  };
  const quadros: { chave: string; titulo: string; campos: CampoS1[] }[] = [
    { chave: 'ativos', titulo: 'Publicadores ativos', campos: [{ id: 'ativos', rotulo: 'Ativos no mês', texto: n(ativos) }] },
    {
      chave: 'publicadores',
      titulo: 'Publicadores',
      campos: [
        { id: 'relatorios', rotulo: 'Relatórios', texto: n(totais.publicadores.relatorios) },
        { id: 'estudos', rotulo: 'Estudos', texto: n(totais.publicadores.estudos) },
      ],
    },
    ...(['auxiliares', 'regulares'] as const).map((chave) => ({
      chave,
      titulo: chave === 'auxiliares' ? 'Pioneiros auxiliares' : 'Pioneiros regulares',
      campos: [
        { id: 'relatorios', rotulo: 'Relatórios', texto: n(totais[chave].relatorios) },
        { id: 'estudos', rotulo: 'Estudos', texto: n(totais[chave].estudos) },
        { id: 'horas', rotulo: 'Horas', texto: n(totais[chave].horas) },
      ],
    })),
    ...TIPOS_REUNIAO.map(({ id, rotulo }) => ({ chave: `assist-${id}`, titulo: `Assistência · ${rotulo.replace('Reunião do ', '')}`, campos: assistencia(id) })),
  ];
  const semAssistencia = TIPOS_REUNIAO.every(({ id }) => !db.assistencia[mes]?.[id]);
  return (
    <Modal aberto={aberto} titulo={`S-1 · ${nomeMes(mes)}`} largura="max-w-md" onFechar={onFechar} rodape={<button className="btn-ghost" onClick={onFechar}>Fechar</button>}>
      <div className="space-y-3">
        {quadros.map(({ chave, titulo, campos }) => (
          <div key={chave} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {campos.map((c) => {
                const id = `${chave}-${c.id}`;
                return (
                  <div key={id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                    <span className="leading-tight">
                      <span className={`block text-2xl font-semibold tabular-nums ${c.texto === null ? 'text-slate-300 dark:text-slate-600' : ''}`}>{c.texto ?? '—'}</span>
                      <span className="block text-xs text-slate-500">{c.rotulo}</span>
                    </span>
                    <button
                      className="rounded-md p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-700"
                      title={c.texto === null ? 'Sem dado' : `Copiar ${c.texto}`}
                      aria-label={`Copiar ${c.rotulo.toLowerCase()} de ${titulo.toLowerCase()}`}
                      disabled={c.texto === null}
                      onClick={() => c.texto !== null && copiar(id, c.texto, c.rotulo.toLowerCase())}
                    >
                      {copiado === id ? <Check size={16} className="text-emerald-600" /> : <ClipboardCopy size={16} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {semAssistencia && (
          <p className="text-xs text-slate-500">
            A assistência vem do registro S-88.{' '}
            <button className="text-indigo-600 underline dark:text-indigo-300" onClick={() => { onFechar(); navegar({ nome: 'assistencia' }); }}>
              Preencher em Assistência
            </button>
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Linha do relatório no celular: um cartão por publicador, com os campos lado a lado. */
function LinhaMovel({
  l,
  mes,
  grupo,
  onAbrir,
  onEditar,
  onAuxiliar,
  onExcluir,
}: {
  l: LinhaMes;
  mes: string;
  grupo: string;
  onAbrir: () => void;
  onEditar: <K extends keyof RelatorioMes>(campo: K, valor: RelatorioMes[K]) => void;
  onAuxiliar: (valor: boolean) => void;
  onExcluir: () => void;
}) {
  const { p, r, status } = l;
  const num = (campo: 'estudos' | 'horas', rotulo: string) => (
    <Campo rotulo={rotulo}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        className="input px-2 py-1.5 text-center tabular-nums"
        value={r?.[campo] ?? ''}
        onChange={(e) => onEditar(campo, e.target.value === '' ? null : Number(e.target.value))}
      />
    </Campo>
  );
  return (
    <li className={`space-y-2 px-3 py-3 ${status === 'inativo' ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={onAbrir} aria-label={`Abrir cartão de ${p.nome}`}>
          <Avatar nome={p.nome} tamanho={34} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{p.nome}</span>
            <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
              {grupo}
              <BadgesPrivilegio p={p} mes={mes} />
            </span>
          </span>
        </button>
        <span className={`badge shrink-0 ${ROTULO_STATUS[status].c}`}>{ROTULO_STATUS[status].t}</span>
        {r && (
          <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" onClick={onExcluir} aria-label={`Excluir o relatório de ${p.nome}`}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
        <div>
          <span className="label">Participou</span>
          <span className="flex h-[34px] items-center justify-center">
            <Toggle checked={!!r?.participou} onChange={(e) => onEditar('participou', e.target.checked)} aria-label={`Participou: ${p.nome}`} />
          </span>
        </div>
        {num('estudos', 'Estudos')}
        {num('horas', 'Horas')}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Toggle checked={r ? r.auxiliar : auxiliarNoMes(p, mes)} onChange={(e) => onAuxiliar(e.target.checked)} aria-label={`Pioneiro auxiliar: ${p.nome}`} />
          P. aux.
        </label>
        <input className="input min-w-0 flex-1 py-1.5" placeholder="Observações" value={r?.obs ?? ''} onChange={(e) => onEditar('obs', e.target.value)} aria-label={`Observações de ${p.nome}`} />
      </div>
    </li>
  );
}

function Linha({
  l,
  mes,
  grupo,
  onAbrir,
  onEditar,
  onAuxiliar,
  onExcluir,
}: {
  l: LinhaMes;
  mes: string;
  grupo: string;
  onAbrir: () => void;
  onEditar: <K extends keyof RelatorioMes>(campo: K, valor: RelatorioMes[K]) => void;
  onAuxiliar: (valor: boolean) => void;
  onExcluir: () => void;
}) {
  const { p, r, status } = l;
  const num = (campo: 'estudos' | 'horas') => (
    <input
      type="number"
      min={0}
      className="w-16 rounded-md bg-transparent px-2 py-1 text-center tabular-nums outline-none hover:bg-slate-100 focus:bg-indigo-50 dark:hover:bg-slate-800 dark:focus:bg-indigo-500/10"
      value={r?.[campo] ?? ''}
      onChange={(e) => onEditar(campo, e.target.value === '' ? null : Number(e.target.value))}
      aria-label={`${campo} de ${p.nome}`}
    />
  );
  return (
    <tr className={status === 'inativo' ? 'opacity-60' : ''}>
      <td className="td">
        <button className="flex items-center gap-2 whitespace-nowrap text-left hover:underline" onClick={onAbrir} title="Abrir cartão">
          <Avatar nome={p.nome} tamanho={24} />
          <span className="font-medium">{p.nome}</span>
          <BadgesPrivilegio p={p} mes={mes} />
        </button>
      </td>
      <td className="td whitespace-nowrap text-slate-500">{grupo}</td>
      <td className="td">
        <span className={`badge ${ROTULO_STATUS[status].c}`}>{ROTULO_STATUS[status].t}</span>
      </td>
      <td className="td text-center">
        <Toggle checked={!!r?.participou}
          onChange={(e) => onEditar('participou', e.target.checked)} aria-label={`Participou: ${p.nome}`} />
      </td>
      <td className="td text-center">{num('estudos')}</td>
      <td className="td text-center">
        <Toggle checked={r ? r.auxiliar : auxiliarNoMes(p, mes)}
          onChange={(e) => onAuxiliar(e.target.checked)} aria-label={`Pioneiro auxiliar: ${p.nome}`} />
      </td>
      <td className="td text-center">{num('horas')}</td>
      <td className="td">
        <input className="w-full min-w-[120px] rounded-md bg-transparent px-2 py-1 outline-none hover:bg-slate-100 focus:bg-indigo-50 dark:hover:bg-slate-800 dark:focus:bg-indigo-500/10"
          value={r?.obs ?? ''} onChange={(e) => onEditar('obs', e.target.value)} aria-label={`Observações de ${p.nome}`} />
      </td>
      <td className="td">
        {r && (
          <button className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" onClick={onExcluir} title="Excluir este relatório">
            <X size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
