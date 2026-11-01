import { create } from 'zustand';
import { cifrar, decifrar, decifrarComChave, derivarChave, type Chave } from '../crypto/crypto';
import { chaveLembrada, esquecerChave, lembrarChave } from '../crypto/chaveLembrada';
import { auxiliarNoMes, dbVazio, type Db, type RelatorioMes } from '../domain/types';
import { relatorioVazio } from '../domain/serviceYear';
import { ConflitoError, type Armazenamento } from '../storage/storage';

export type Pagina =
  | { nome: 'painel' }
  | { nome: 'publicadores' }
  | { nome: 'publicador'; id: string }
  | { nome: 'grupos' }
  | { nome: 'relatorios'; mes?: string }
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
  /** `lembrar`: true guarda a chave neste dispositivo, false esquece; omitido mantém como está. */
  desbloquear(senha: string, lembrar?: boolean): Promise<void>;
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
    // Registros gravados antes de existirem os campos `batizado`, `inativo` e de pioneiro auxiliar.
    publicadores: (db.publicadores ?? []).map((p) => ({
      ...p,
      batizado: p.batizado ?? true,
      inativo: p.inativo ?? false,
      auxiliarPermanente: p.auxiliarPermanente ?? false,
      auxiliarMeses: p.auxiliarMeses ?? [],
    })),
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
    set({ arm, fase: arm ? 'iniciando' : 'escolher' });
    if (!arm) return;
    // Abre direto com a chave lembrada; se não houver (ou o PIN mudou), pede o PIN.
    (async () => {
      const chave = await chaveLembrada(arm.descricao);
      if (!chave) throw new Error();
      const { texto } = await decifrarComChave(await arm.ler(), chave);
      if (get().arm === arm) set({ chave, db: normalizar(JSON.parse(texto)), fase: 'aberto', pagina: { nome: 'painel' }, conflito: false });
    })().catch(() => {
      if (get().arm === arm) set({ fase: 'bloqueado' });
    });
  },

  async criar(arm, senha, nomeCongregacao) {
    const chave = await derivarChave(senha);
    const db = dbVazio(nomeCongregacao);
    await arm.gravar(await cifrar(chave, JSON.stringify(db)), true);
    await lembrarChave(arm.descricao, chave);
    set({ arm, chave, db, fase: 'aberto', pagina: { nome: 'painel' }, conflito: false });
  },

  async desbloquear(senha, lembrar) {
    const arm = get().arm;
    if (!arm) throw new Error('Nenhum arquivo de dados selecionado.');
    const { texto, chave } = await decifrar(await arm.ler(), senha);
    if (lembrar === true) await lembrarChave(arm.descricao, chave);
    if (lembrar === false) await esquecerChave(arm.descricao);
    set({ chave, db: normalizar(JSON.parse(texto)), fase: 'aberto', pagina: { nome: 'painel' }, conflito: false });
  },

  async bloquear() {
    if (timerSalvar) await get().salvarAgora().catch(() => {});
    // Bloquear é pedir o PIN de novo: esquece a chave deste dispositivo.
    const arm = get().arm;
    if (arm) await esquecerChave(arm.descricao);
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
    const chave = await derivarChave(nova);
    set({ chave });
    await get().salvarAgora(true);
    if (await chaveLembrada(arm.descricao)) await lembrarChave(arm.descricao, chave);
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

// Relatórios mensais ---------------------------------------------------------
// Um relatório existir em `p.relatorios[mes]` significa "entregue" (mesmo sem participação).
// O cartão S-21 e o menu Relatórios leem e gravam esses mesmos dados.

/** Registra o mês na lista de meses da congregação (importado ou criado à mão). */
export function garantirMes(db: Db, mes: string, arquivo = '') {
  if (db.importacoes.some((i) => i.mes === mes)) return;
  db.importacoes.push({ mes, arquivo, data: new Date().toISOString(), registros: 0 });
  db.importacoes.sort((a, b) => a.mes.localeCompare(b.mes));
}

export function definirRelatorio<K extends keyof RelatorioMes>(
  db: Db,
  publicadorId: string,
  mes: string,
  campo: K,
  valor: RelatorioMes[K],
) {
  const p = db.publicadores.find((x) => x.id === publicadorId);
  if (!p) return;
  p.relatorios[mes] = { ...(p.relatorios[mes] ?? { ...relatorioVazio(), auxiliar: auxiliarNoMes(p, mes) }), [campo]: valor };
  garantirMes(db, mes);
}

/**
 * Marca/desmarca pioneiro auxiliar no mês. Sem relatório, só registra a designação
 * (não cria relatório, para não contar como entregue).
 */
export function definirAuxiliar(db: Db, publicadorId: string, mes: string, valor: boolean) {
  const p = db.publicadores.find((x) => x.id === publicadorId);
  if (!p) return;
  if (!p.auxiliarPermanente)
    p.auxiliarMeses = valor ? [...new Set([...p.auxiliarMeses, mes])].sort() : p.auxiliarMeses.filter((m) => m !== mes);
  if (p.relatorios[mes] || valor !== auxiliarNoMes(p, mes)) definirRelatorio(db, publicadorId, mes, 'auxiliar', valor);
}

export function excluirRelatorio(db: Db, publicadorId: string, mes: string) {
  const p = db.publicadores.find((x) => x.id === publicadorId);
  if (p) delete p.relatorios[mes];
}

/** Remove o mês inteiro: o registro do mês e o relatório de todos os publicadores. */
export function excluirMes(db: Db, mes: string) {
  db.importacoes = db.importacoes.filter((i) => i.mes !== mes);
  for (const p of db.publicadores) delete p.relatorios[mes];
}

/** Meses com relatórios na congregação: importados ou digitados no cartão de alguém. */
export function mesesComDados(db: Db): Set<string> {
  const meses = new Set(db.importacoes.map((i) => i.mes));
  for (const p of db.publicadores) for (const m of Object.keys(p.relatorios)) meses.add(m);
  return meses;
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
