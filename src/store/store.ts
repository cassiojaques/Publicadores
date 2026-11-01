import { create } from 'zustand';
import { cifrar, decifrar, derivarChave, type Chave } from '../crypto/crypto';
import { dbVazio, type Db } from '../domain/types';
import { ConflitoError, type Armazenamento } from '../storage/storage';

export type Pagina =
  | { nome: 'painel' }
  | { nome: 'publicadores' }
  | { nome: 'publicador'; id: string }
  | { nome: 'grupos' }
  | { nome: 'importar' }
  | { nome: 'config' };

export interface Toast {
  id: number;
  texto: string;
  tipo: 'ok' | 'erro' | 'info';
}

type Fase = 'iniciando' | 'escolher' | 'bloqueado' | 'aberto';

interface Estado {
  fase: Fase;
  arm: Armazenamento | null;
  chave: Chave | null;
  db: Db;
  pagina: Pagina;
  salvando: boolean;
  conflito: boolean;
  toasts: Toast[];

  definirArmazenamento(arm: Armazenamento | null): void;
  criar(arm: Armazenamento, senha: string, nomeCongregacao: string): Promise<void>;
  desbloquear(senha: string): Promise<void>;
  bloquear(): Promise<void>;
  trocarArquivo(): Promise<void>;
  atualizar(fn: (db: Db) => void): void;
  substituirDb(db: Db): void;
  salvarAgora(forcar?: boolean): Promise<void>;
  recarregarDoDisco(senha: string): Promise<void>;
  trocarSenha(atual: string, nova: string): Promise<void>;
  navegar(p: Pagina): void;
  toast(texto: string, tipo?: Toast['tipo']): void;
}

let timerSalvar: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;

function normalizar(db: Db): Db {
  const base = dbVazio();
  return {
    ...base,
    ...db,
    congregacao: { ...base.congregacao, ...db.congregacao },
    // Registros gravados antes de existir o campo `batizado`.
    publicadores: (db.publicadores ?? []).map((p) => ({ ...p, batizado: p.batizado ?? true })),
  };
}

export const useStore = create<Estado>((set, get) => ({
  fase: 'iniciando',
  arm: null,
  chave: null,
  db: dbVazio(),
  pagina: { nome: 'painel' },
  salvando: false,
  conflito: false,
  toasts: [],

  definirArmazenamento(arm) {
    set({ arm, fase: arm ? 'bloqueado' : 'escolher' });
  },

  async criar(arm, senha, nomeCongregacao) {
    const chave = await derivarChave(senha);
    const db = dbVazio(nomeCongregacao);
    await arm.gravar(await cifrar(chave, JSON.stringify(db)), true);
    set({ arm, chave, db, fase: 'aberto', pagina: { nome: 'painel' }, conflito: false });
  },

  async desbloquear(senha) {
    const arm = get().arm;
    if (!arm) throw new Error('Nenhum arquivo de dados selecionado.');
    const { texto, chave } = await decifrar(await arm.ler(), senha);
    set({ chave, db: normalizar(JSON.parse(texto)), fase: 'aberto', pagina: { nome: 'painel' }, conflito: false });
  },

  async bloquear() {
    if (timerSalvar) await get().salvarAgora().catch(() => {});
    set({ chave: null, db: dbVazio(), fase: 'bloqueado', pagina: { nome: 'painel' } });
  },

  async trocarArquivo() {
    if (timerSalvar) await get().salvarAgora().catch(() => {});
    set({ chave: null, db: dbVazio(), arm: null, fase: 'escolher' });
  },

  atualizar(fn) {
    const db = structuredClone(get().db);
    fn(db);
    set({ db });
    if (timerSalvar) clearTimeout(timerSalvar);
    timerSalvar = setTimeout(() => {
      get().salvarAgora().catch(() => {});
    }, 600);
  },

  substituirDb(db) {
    get().atualizar((d) => Object.assign(d, normalizar(db)));
  },

  async salvarAgora(forcar = false) {
    if (timerSalvar) clearTimeout(timerSalvar);
    timerSalvar = null;
    const { arm, chave, db } = get();
    if (!arm || !chave) return;
    set({ salvando: true });
    try {
      await arm.gravar(await cifrar(chave, JSON.stringify(db)), forcar);
      set({ conflito: false });
    } catch (e) {
      if (e instanceof ConflitoError) set({ conflito: true });
      else get().toast(`Erro ao salvar: ${(e as Error).message ?? e}`, 'erro');
      throw e;
    } finally {
      set({ salvando: false });
    }
  },

  async recarregarDoDisco(senha) {
    if (timerSalvar) clearTimeout(timerSalvar);
    timerSalvar = null;
    await get().desbloquear(senha);
  },

  async trocarSenha(atual, nova) {
    const { arm } = get();
    if (!arm) return;
    await decifrar(await arm.ler(), atual); // valida a senha atual
    set({ chave: await derivarChave(nova) });
    await get().salvarAgora(true);
  },

  navegar(pagina) {
    set({ pagina });
  },

  toast(texto, tipo = 'ok') {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, texto, tipo }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4000);
  },
}));

// Seletores e ações de domínio -------------------------------------------------

export function mesesComDados(db: Db): Set<string> {
  return new Set(db.importacoes.map((i) => i.mes));
}

/** Move o publicador e remove funções de grupo que ele tinha no grupo anterior. */
export function moverPublicador(db: Db, publicadorId: string, grupoId: string | null) {
  const p = db.publicadores.find((x) => x.id === publicadorId);
  if (!p || p.grupoId === grupoId) return;
  const anterior = db.grupos.find((g) => g.id === p.grupoId);
  if (anterior) {
    if (anterior.superintendenteId === p.id) anterior.superintendenteId = null;
    if (anterior.ajudanteId === p.id) anterior.ajudanteId = null;
  }
  p.grupoId = grupoId;
}

export function removerGrupo(db: Db, grupoId: string) {
  db.grupos = db.grupos.filter((g) => g.id !== grupoId);
  for (const p of db.publicadores) if (p.grupoId === grupoId) p.grupoId = null;
}
