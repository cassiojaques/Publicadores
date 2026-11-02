import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { Download, GripVertical, Loader2, MoreHorizontal, Pencil, Plus, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { mesesComDados, moverPublicador, removerGrupo, useStore } from '../store/store';
import { situacao } from '../domain/serviceYear';
import { novoId, type Grupo, type Publicador } from '../domain/types';
import { BadgesPrivilegio, Confirmar, Modal, Vazio } from '../components/ui';
import { FormPublicador } from '../components/FormPublicador';
import { gerarPdfGrupos } from '../pdf/grupos';
import { salvarArquivoGerado } from '../storage/storage';

const SEM_GRUPO = '__sem__';

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

function ChipArrastavel({ p, funcao, onAbrir }: { p: Publicador; funcao?: 'S' | 'A'; onAbrir: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onDoubleClick={onAbrir}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-30' : ''}`}
      title="Arraste para outro grupo · duplo clique para abrir"
    >
      <Chip p={p} funcao={funcao} />
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
}: {
  grupo: Grupo | null;
  membros: Publicador[];
  destaque: string;
  onRenomear?: () => void;
  onExcluir?: () => void;
  onAdicionar: () => void;
}) {
  const { db, atualizar, navegar } = useStore();
  const { setNodeRef, isOver } = useDroppable({ id: grupo?.id ?? SEM_GRUPO });
  const [menu, setMenu] = useState(false);
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
        <h3 className="flex-1 truncate font-semibold text-indigo-950 dark:text-indigo-100">{grupo?.nome ?? 'Sem grupo'}</h3>
        <span className="badge bg-white text-indigo-700 ring-1 ring-indigo-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-0">{membros.length}</span>
        <button className="btn-ghost p-1" onClick={onAdicionar} title="Novo publicador neste grupo" aria-label="Novo publicador neste grupo">
          <UserPlus size={16} />
        </button>
        {grupo && (
          <div className="relative">
            <button className="btn-ghost p-1" onClick={() => setMenu(!menu)} onBlur={() => setTimeout(() => setMenu(false), 150)} aria-label="Opções do grupo">
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

      {grupo && (
        <div className="space-y-1 border-b border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
          {(
            [
              ['superintendenteId', 'Superintendente'],
              ['ajudanteId', 'Ajudante'],
            ] as const
          ).map(([campo, rotulo]) => (
            <label key={campo} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400" title={rotulo}>{rotulo === 'Superintendente' ? 'Sup.' : 'Aj.'}</span>
              <select className="input px-2 py-0.5" value={grupo[campo] ?? ''} onChange={(e) => setFuncao(campo, e.target.value)}>
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

      <div className="flex min-h-[48px] flex-1 flex-col gap-1 rounded-b-xl bg-slate-50/60 p-2 dark:bg-transparent">
        {ordenados.map((p) => {
          const funcao = grupo?.superintendenteId === p.id ? 'S' : grupo?.ajudanteId === p.id ? 'A' : undefined;
          const casa = !destaque || p.nome.toLowerCase().includes(destaque.toLowerCase());
          return (
            <div key={p.id} className={casa ? '' : 'opacity-30'}>
              <ChipArrastavel p={p} funcao={funcao} onAbrir={() => navegar({ nome: 'publicador', id: p.id })} />
            </div>
          );
        })}
        {membros.length === 0 && <p className="py-2 text-center text-xs text-slate-400">Arraste publicadores para cá</p>}
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
  const [soAtivos, setSoAtivos] = useState(() => {
    try {
      return localStorage.getItem('publicadores.grupos.soAtivos') === '1';
    } catch {
      return false;
    }
  });
  const mudarSoAtivos = (v: boolean) => {
    setSoAtivos(v);
    try {
      localStorage.setItem('publicadores.grupos.soAtivos', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const meses = useMemo(() => mesesComDados(db), [db]);
  const porGrupo = useMemo(() => {
    const m = new Map<string, Publicador[]>();
    for (const p of db.publicadores) {
      if (p.arquivado || (soAtivos && situacao(p, meses) === 'inativo')) continue;
      const k = p.grupoId ?? SEM_GRUPO;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [db.publicadores, soAtivos, meses]);

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
      if (await salvarArquivoGerado('Grupos de Campo.pdf', await gerarPdfGrupos(db, { soAtivos }), 'application/pdf')) toast('PDF dos grupos exportado.');
    } catch (e) {
      toast(`Erro ao gerar PDF: ${(e as Error).message}`, 'erro');
    } finally {
      setGerando(false);
    }
  }

  const pArrastado = db.publicadores.find((p) => p.id === arrastado);
  const semGrupo = porGrupo.get(SEM_GRUPO) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Grupos de campo</h1>
          <p className="text-sm text-slate-500">Arraste os publicadores entre os grupos para mudá-los.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 px-1 text-sm text-slate-600 dark:text-slate-400" title="Esconde os inativos aqui e no PDF">
            <input type="checkbox" className="accent-indigo-600" checked={soAtivos} onChange={(e) => mudarSoAtivos(e.target.checked)} />
            Apenas ativos
          </label>
          <input className="input w-48" placeholder="Destacar nome…" value={destaque} onChange={(e) => setDestaque(e.target.value)} />
          <button className="btn-outline" onClick={exportarPdf} disabled={gerando || db.grupos.length === 0}>
            {gerando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} PDF
          </button>
          <button className="btn-primary" onClick={() => setNomeModal({ id: null, nome: `Grupo ${db.grupos.length + 1}` })}>
            <Plus size={16} /> Novo grupo
          </button>
        </div>
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
              <Coluna grupo={null} membros={semGrupo} destaque={destaque} onAdicionar={() => setNovoEm(null)} />
            )}
            {db.grupos.map((g) => (
              <Coluna
                key={g.id}
                grupo={g}
                membros={porGrupo.get(g.id) ?? []}
                destaque={destaque}
                onRenomear={() => setNomeModal({ id: g.id, nome: g.nome })}
                onExcluir={() => setExcluir(g)}
                onAdicionar={() => setNovoEm(g.id)}
              />
            ))}
          </div>
          <DragOverlay>{pArrastado && <Chip p={pArrastado} arrastando />}</DragOverlay>
        </DndContext>
      )}

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
