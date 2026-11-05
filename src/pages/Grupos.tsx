import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { ArrowRightLeft, ChevronDown, Download, GripVertical, Loader2, MoreHorizontal, Pencil, Plus, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { mesesComDados, moverPublicador, removerGrupo, useStore } from '../store/store';
import { situacao } from '../domain/serviceYear';
import { novoId, type Grupo, type Publicador } from '../domain/types';
import { BadgesPrivilegio, Confirmar, Folha, Modal, Toggle, Vazio } from '../components/ui';
import { FormPublicador } from '../components/FormPublicador';
import { gerarPdfGrupos, type FiltroSituacao } from '../pdf/grupos';

const OPCOES_SIT: { v: FiltroSituacao; t: string }[] = [
  { v: 'todos', t: 'Todos' },
  { v: 'ativo', t: 'Ativos' },
  { v: 'inativo', t: 'Inativos' },
];
import { salvarArquivoGerado } from '../storage/storage';

const SEM_GRUPO = '__sem__';
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Chip({ p, funcao, arrastando }: { p: Publicador; funcao?: 'S' | 'A'; arrastando?: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border bg-white px-1.5 py-0.5 text-sm dark:bg-slate-900 ${
        arrastando ? 'border-indigo-400 shadow-lg' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <GripVertical size={12} className="shrink-0 text-slate-300" />
      <span className="flex-1 truncate">{p.nome}</span>
      {funcao && (
        <span className="badge bg-indigo-600 text-white" title={funcao === 'S' ? 'Superintendente' : 'Ajudante'}>
          {funcao === 'S' ? 'Sup.' : 'Aj.'}
        </span>
      )}
      <BadgesPrivilegio p={p} />
    </div>
  );
}

const ehCelular = () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches;

function ChipArrastavel({ p, funcao, onAbrir, onMover }: { p: Publicador; funcao?: 'S' | 'A'; onAbrir: () => void; onMover: () => void }) {
  // No celular arrastar atrapalha a rolagem: lá o botão "Mover" escolhe o grupo.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id, disabled: ehCelular() });
  return (
    <div className="flex items-center gap-1.5">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onDoubleClick={onAbrir}
        onClick={() => ehCelular() && onAbrir()}
        className={`min-w-0 flex-1 md:cursor-grab md:active:cursor-grabbing max-md:py-1 ${isDragging ? 'opacity-30' : ''}`}
        title="Arraste para outro grupo · duplo clique para abrir"
      >
        <Chip p={p} funcao={funcao} />
      </div>
      <button className="btn-outline shrink-0 px-2.5 py-1 text-xs md:hidden" onClick={onMover} aria-label={`Mover ${p.nome} para outro grupo`}>
        <ArrowRightLeft size={13} /> Mover
      </button>
    </div>
  );
}

function Coluna({
  grupo,
  membros,
  destaque,
  onRenomear,
  onExcluir,
  onAdicionar,
  onToque,
}: {
  grupo: Grupo | null;
  membros: Publicador[];
  destaque: string;
  onRenomear?: () => void;
  onExcluir?: () => void;
  onAdicionar: () => void;
  onToque: (p: Publicador) => void;
}) {
  const { db, atualizar, navegar } = useStore();
  const { setNodeRef, isOver } = useDroppable({ id: grupo?.id ?? SEM_GRUPO });
  const [menu, setMenu] = useState(false);
  // No celular os grupos começam recolhidos, para a tela não virar uma lista infinita.
  const [aberta, setAberta] = useState(() => !ehCelular());
  // Buscando por nome, os grupos com resultado ficam abertos.
  const mostrar = aberta || !!destaque;
  const irmaos = membros.filter((p) => p.sexo === 'M');
  const nomeDe = (id: string | null) => db.publicadores.find((p) => p.id === id);

  const setFuncao = (campo: 'superintendenteId' | 'ajudanteId', v: string) =>
    atualizar((d) => {
      const g = d.grupos.find((x) => x.id === grupo!.id)!;
      g[campo] = v || null;
      // A mesma pessoa não ocupa as duas funções.
      const outro = campo === 'superintendenteId' ? 'ajudanteId' : 'superintendenteId';
      if (v && g[outro] === v) g[outro] = null;
    });

  const ordenados = [...membros].sort((a, b) => {
    const peso = (p: Publicador) => (grupo?.superintendenteId === p.id ? 0 : grupo?.ajudanteId === p.id ? 1 : 2);
    return peso(a) - peso(b) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });
  });

  return (
    <div
      ref={setNodeRef}
      className={`card flex w-full flex-col transition ${
        isOver ? 'ring-2 ring-indigo-500' : ''
      } ${grupo ? '' : 'border-dashed'}`}
    >
      <div className={`flex items-center gap-1 rounded-t-xl border-b px-3 py-2 dark:border-slate-800 ${grupo ? 'border-indigo-200/70 bg-gradient-to-r from-indigo-100 to-violet-100/70 dark:from-indigo-500/10 dark:to-violet-500/10' : 'border-slate-200 bg-slate-50 dark:bg-slate-800/40'}`}>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left md:pointer-events-none"
          onClick={() => setAberta(!aberta)}
          aria-expanded={mostrar}
        >
          <ChevronDown size={16} className={`shrink-0 text-indigo-500 transition md:hidden ${mostrar ? '' : '-rotate-90'}`} />
          <h3 className="truncate font-semibold text-indigo-950 dark:text-indigo-100">{grupo?.nome ?? 'Sem grupo'}</h3>
          <span className="badge bg-white text-indigo-700 ring-1 ring-indigo-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-0">{membros.length}</span>
        </button>
        <button className="btn-ghost p-1.5 md:p-1" onClick={onAdicionar} title="Novo publicador neste grupo" aria-label="Novo publicador neste grupo">
          <UserPlus size={16} />
        </button>
        {grupo && (
          <div className="relative">
            <button className="btn-ghost p-1.5 md:p-1" onClick={() => setMenu(!menu)} onBlur={() => setTimeout(() => setMenu(false), 150)} aria-label="Opções do grupo">
              <MoreHorizontal size={16} />
            </button>
            {menu && (
              <div className="card absolute right-0 z-20 mt-1 w-40 p-1 text-sm">
                <button className="btn-ghost w-full justify-start" onMouseDown={(e) => e.preventDefault()} onClick={() => { setMenu(false); onRenomear?.(); }}>
                  <Pencil size={14} /> Renomear
                </button>
                <button className="btn-ghost w-full justify-start text-rose-600" onMouseDown={(e) => e.preventDefault()} onClick={() => { setMenu(false); onExcluir?.(); }}>
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {grupo && !mostrar && (
        <p className="truncate px-3 py-2 text-xs text-slate-500 md:hidden">
          Sup.: <b className="font-medium text-slate-700 dark:text-slate-300">{nomeDe(grupo.superintendenteId)?.nome ?? '—'}</b> · Aj.:{' '}
          <b className="font-medium text-slate-700 dark:text-slate-300">{nomeDe(grupo.ajudanteId)?.nome ?? '—'}</b>
        </p>
      )}

      {grupo && (
        <div className={`space-y-2 border-b border-slate-200 px-3 py-2 text-sm dark:border-slate-800 md:space-y-1 ${mostrar ? '' : 'max-md:hidden'}`}>
          {(
            [
              ['superintendenteId', 'Superintendente'],
              ['ajudanteId', 'Ajudante'],
            ] as const
          ).map(([campo, rotulo]) => (
            <label key={campo} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400" title={rotulo}>{rotulo === 'Superintendente' ? 'Sup.' : 'Aj.'}</span>
              <select className="input px-2 py-1.5 md:py-0.5" value={grupo[campo] ?? ''} onChange={(e) => setFuncao(campo, e.target.value)}>
                <option value="">— definir —</option>
                {irmaos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
                {grupo[campo] && !irmaos.some((p) => p.id === grupo[campo]) && (
                  <option value={grupo[campo]!}>{nomeDe(grupo[campo])?.nome ?? '?'}</option>
                )}
              </select>
            </label>
          ))}
        </div>
      )}

      <div className={`min-h-[48px] flex-1 flex-col gap-1 rounded-b-xl bg-slate-50/60 p-2 dark:bg-transparent ${mostrar ? 'flex' : 'max-md:hidden md:flex'}`}>
        {ordenados.map((p) => {
          const funcao = grupo?.superintendenteId === p.id ? 'S' : grupo?.ajudanteId === p.id ? 'A' : undefined;
          return (
            <div key={p.id}>
              <ChipArrastavel p={p} funcao={funcao} onAbrir={() => navegar({ nome: 'publicador', id: p.id })} onMover={() => onToque(p)} />
            </div>
          );
        })}
        {membros.length === 0 && <p className="py-2 text-center text-xs text-slate-400">Nenhum publicador <span className="hidden md:inline">· arraste para cá</span></p>}
      </div>
    </div>
  );
}

export function Grupos() {
  const { db, atualizar, toast } = useStore();
  const [arrastado, setArrastado] = useState<string | null>(null);
  const [nomeModal, setNomeModal] = useState<{ id: string | null; nome: string } | null>(null);
  const [excluir, setExcluir] = useState<Grupo | null>(null);
  const [novoEm, setNovoEm] = useState<string | null | undefined>(undefined);
  const [destaque, setDestaque] = useState('');
  const [gerando, setGerando] = useState(false);
  const [mover, setMover] = useState<Publicador | null>(null);
  const [filtroSit, setFiltroSit] = useState<FiltroSituacao>(() => {
    try {
      const v = localStorage.getItem('publicadores.grupos.situacao');
      if (v === 'ativo' || v === 'inativo') return v;
      return localStorage.getItem('publicadores.grupos.soAtivos') === '1' ? 'ativo' : 'todos';
    } catch {
      return 'todos';
    }
  });
  const mudarFiltroSit = (v: FiltroSituacao) => {
    setFiltroSit(v);
    try {
      localStorage.setItem('publicadores.grupos.situacao', v);
    } catch {
      /* ignore */
    }
  };
  const [pdfSiglas, setPdfSiglas] = useState(() => {
    try {
      return localStorage.getItem('publicadores.grupos.pdfSiglas') !== '0';
    } catch {
      return true;
    }
  });
  const mudarPdfSiglas = (v: boolean) => {
    setPdfSiglas(v);
    try {
      localStorage.setItem('publicadores.grupos.pdfSiglas', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const meses = useMemo(() => mesesComDados(db), [db]);
  const termo = semAcento(destaque.trim());
  const porGrupo = useMemo(() => {
    const m = new Map<string, Publicador[]>();
    for (const p of db.publicadores) {
      if (p.arquivado || (filtroSit !== 'todos' && situacao(p, meses) !== filtroSit)) continue;
      if (termo && !semAcento(p.nome).includes(termo)) continue;
      const k = p.grupoId ?? SEM_GRUPO;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [db.publicadores, filtroSit, meses, termo]);

  function soltar(e: DragEndEvent) {
    setArrastado(null);
    if (!e.over) return;
    const destino = e.over.id === SEM_GRUPO ? null : String(e.over.id);
    const pid = String(e.active.id);
    const p = db.publicadores.find((x) => x.id === pid);
    if (!p || p.grupoId === destino) return;
    atualizar((d) => moverPublicador(d, pid, destino));
    toast(`${p.nome} → ${db.grupos.find((g) => g.id === destino)?.nome ?? 'Sem grupo'}`);
  }

  function salvarNome() {
    if (!nomeModal?.nome.trim()) return;
    const nome = nomeModal.nome.trim();
    atualizar((d) => {
      if (nomeModal.id) d.grupos.find((g) => g.id === nomeModal.id)!.nome = nome;
      else d.grupos.push({ id: novoId(), nome, superintendenteId: null, ajudanteId: null });
    });
    setNomeModal(null);
  }

  async function exportarPdf() {
    setGerando(true);
    try {
      if (await salvarArquivoGerado('Grupos de Campo.pdf', await gerarPdfGrupos(db, { situacao: filtroSit, siglas: pdfSiglas }), 'application/pdf')) toast('PDF dos grupos exportado.');
    } catch (e) {
      toast(`Erro ao gerar PDF: ${(e as Error).message}`, 'erro');
    } finally {
      setGerando(false);
    }
  }

  const pArrastado = db.publicadores.find((p) => p.id === arrastado);
  const semGrupo = porGrupo.get(SEM_GRUPO) ?? [];

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold md:text-2xl">Grupos de campo</h1>
          <p className="text-sm text-slate-500">
            <span className="hidden md:inline">Arraste os publicadores entre os grupos para mudá-los.</span>
            <span className="md:hidden">Toque no nome para abrir o cartão ou em Mover para trocar de grupo.</span>
          </p>
        </div>
        <button className="btn-primary shrink-0" onClick={() => setNomeModal({ id: null, nome: `Grupo ${db.grupos.length + 1}` })} aria-label="Novo grupo">
          <Plus size={16} /> <span className="hidden sm:inline">Novo grupo</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="order-1 flex w-full rounded-full border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900 md:w-auto" role="group" aria-label="Situação" title="Filtra aqui e no PDF">
          {OPCOES_SIT.map((o) => (
            <button
              key={o.v}
              type="button"
              aria-pressed={filtroSit === o.v}
              onClick={() => mudarFiltroSit(o.v)}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition md:flex-none md:py-0.5 md:text-xs ${
                filtroSit === o.v
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {o.t}
            </button>
          ))}
        </div>
        <label className="order-5 flex w-full items-center gap-2 px-1 text-sm text-slate-600 dark:text-slate-400 md:order-2 md:w-auto" title="Mostra Ancião, Servo, Pioneiro etc. ao lado dos nomes no PDF">
          <Toggle checked={pdfSiglas} onChange={(e) => mudarPdfSiglas(e.target.checked)} />
          Designações no PDF
        </label>
        <input className="input order-3 min-w-0 flex-1 md:w-48 md:flex-none" placeholder="Buscar nome…" value={destaque} onChange={(e) => setDestaque(e.target.value)} />
        <button className="btn-outline order-4 shrink-0" onClick={exportarPdf} disabled={gerando || db.grupos.length === 0}>
          {gerando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Gerar PDF
        </button>
      </div>

      {db.grupos.length === 0 && semGrupo.length === 0 ? (
        <div className="card">
          <Vazio icone={<UsersRound size={40} />} titulo="Nenhum grupo criado">
            <button className="btn-primary mt-2" onClick={() => setNomeModal({ id: null, nome: 'Grupo 1' })}>
              <Plus size={16} /> Criar grupo
            </button>
          </Vazio>
        </div>
      ) : (
        <DndContext sensors={sensores} onDragStart={(e) => setArrastado(String(e.active.id))} onDragEnd={soltar} onDragCancel={() => setArrastado(null)}>
          <div className="grid items-start gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {semGrupo.length > 0 && (
              <Coluna grupo={null} membros={semGrupo} destaque={destaque} onAdicionar={() => setNovoEm(null)} onToque={setMover} />
            )}
            {db.grupos.filter((g) => !termo || (porGrupo.get(g.id)?.length ?? 0) > 0).map((g) => (
              <Coluna
                key={g.id}
                grupo={g}
                membros={porGrupo.get(g.id) ?? []}
                destaque={destaque}
                onRenomear={() => setNomeModal({ id: g.id, nome: g.nome })}
                onExcluir={() => setExcluir(g)}
                onAdicionar={() => setNovoEm(g.id)}
                onToque={setMover}
              />
            ))}
          </div>
          {termo && porGrupo.size === 0 && <p className="py-6 text-center text-sm text-slate-500">Ninguém com esse nome.</p>}
          <DragOverlay>{pArrastado && <Chip p={pArrastado} arrastando />}</DragOverlay>
        </DndContext>
      )}

      <Folha aberto={!!mover} titulo={mover ? `Mover ${mover.nome}` : ''} onFechar={() => setMover(null)}>
        {mover && (
          <div className="space-y-3">
            <div>
              <p className="label">Mover para</p>
              <div className="flex flex-wrap gap-2">
                {[...db.grupos.map((g) => ({ id: g.id as string | null, nome: g.nome })), { id: null, nome: 'Sem grupo' }].map((g) => {
                  const atual = (mover.grupoId ?? null) === g.id;
                  return (
                    <button
                      key={g.id ?? 'sem'}
                      disabled={atual}
                      onClick={() => {
                        atualizar((d) => moverPublicador(d, mover.id, g.id));
                        toast(`${mover.nome} → ${g.nome}`);
                        setMover(null);
                      }}
                      className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                        atual
                          ? 'border-indigo-500 bg-indigo-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 active:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      {g.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Folha>

      <Modal
        aberto={!!nomeModal}
        titulo={nomeModal?.id ? 'Renomear grupo' : 'Novo grupo'}
        onFechar={() => setNomeModal(null)}
        largura="max-w-sm"
        rodape={
          <>
            <button className="btn-ghost" onClick={() => setNomeModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={salvarNome}>Salvar</button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); salvarNome(); }}>
          <label className="label" htmlFor="nome-grupo">Nome do grupo</label>
          <input id="nome-grupo" className="input" autoFocus value={nomeModal?.nome ?? ''} onChange={(e) => setNomeModal((m) => m && { ...m, nome: e.target.value })} />
        </form>
      </Modal>

      <Confirmar
        aberto={!!excluir}
        perigo
        titulo="Excluir grupo"
        textoBotao="Excluir"
        mensagem={<>Excluir <b>{excluir?.nome}</b>? Os publicadores dele ficarão <b>sem grupo</b>.</>}
        onFechar={() => setExcluir(null)}
        onConfirmar={() => excluir && atualizar((d) => removerGrupo(d, excluir.id))}
      />

      <FormPublicador aberto={novoEm !== undefined} grupoInicial={novoEm ?? null} onFechar={() => setNovoEm(undefined)} />
    </div>
  );
}
