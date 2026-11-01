/**
 * Onde o arquivo .pub fica guardado. Três implementações:
 *  - tauri:     arquivo em disco (app desktop), com backups e detecção de conflito;
 *  - navegador: File System Access API (Chrome/Edge) — útil no desenvolvimento;
 *  - local:     localStorage, último recurso quando nenhuma das anteriores existe.
 */
export interface Armazenamento {
  tipo: 'tauri' | 'navegador' | 'local';
  descricao: string;
  ler(): Promise<string>;
  /** Lança ConflitoError se o arquivo foi alterado por fora desde a última leitura/gravação. */
  gravar(conteudo: string, forcar?: boolean): Promise<void>;
}

export class ConflitoError extends Error {
  constructor() {
    super('O arquivo de dados foi alterado fora do aplicativo (ex.: sincronização do OneDrive).');
  }
}

export const NOME_ARQUIVO = 'congregacao.pub';
const CHAVE_ULTIMO = 'publicadores.ultimoArquivo';

export const ehTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
// `?local` na URL força o localStorage (útil para testes no navegador).
const forcarLocal = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('local');
export const temFsAccess = () =>
  typeof window !== 'undefined' && 'showOpenFilePicker' in window && !forcarLocal();

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento disponível */
  }
}

// ---------------------------------------------------------------- Tauri

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

class ArmazenamentoTauri implements Armazenamento {
  tipo = 'tauri' as const;
  private mtime: number | null = null;
  constructor(public caminho: string) {}
  get descricao() {
    return this.caminho;
  }
  async ler() {
    const r = await invoke<{ conteudo: string; mtime: number }>('ler_arquivo', { caminho: this.caminho });
    this.mtime = r.mtime;
    lsSet(CHAVE_ULTIMO, this.caminho);
    return r.conteudo;
  }
  async gravar(conteudo: string, forcar = false) {
    try {
      this.mtime = await invoke<number>('gravar_arquivo', {
        caminho: this.caminho,
        conteudo,
        mtimeEsperado: forcar ? null : this.mtime,
      });
      lsSet(CHAVE_ULTIMO, this.caminho);
    } catch (e) {
      if (String(e).includes('CONFLITO')) throw new ConflitoError();
      throw e;
    }
  }
}

// ---------------------------------------------------------------- Navegador (File System Access)

type Handle = FileSystemFileHandle & {
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
};

const IDB = 'publicadores';
function idb<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('handles', modo);
      const r = fn(tx.objectStore('handles'));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    };
  });
}

class ArmazenamentoNavegador implements Armazenamento {
  tipo = 'navegador' as const;
  private modificado: number | null = null;
  constructor(private handle: Handle) {}
  get descricao() {
    return this.handle.name;
  }
  async garantirPermissao() {
    if ((await this.handle.queryPermission({ mode: 'readwrite' })) === 'granted') return;
    if ((await this.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      throw new Error('Permissão para acessar o arquivo foi negada.');
    }
  }
  async ler() {
    await this.garantirPermissao();
    const f = await this.handle.getFile();
    this.modificado = f.lastModified;
    await idb('readwrite', (s) => s.put(this.handle, 'ultimo'));
    return f.text();
  }
  async gravar(conteudo: string, forcar = false) {
    await this.garantirPermissao();
    const atual = await this.handle.getFile();
    if (!forcar && this.modificado !== null && atual.lastModified !== this.modificado) throw new ConflitoError();
    const w = await this.handle.createWritable();
    await w.write(conteudo);
    await w.close();
    this.modificado = (await this.handle.getFile()).lastModified;
  }
}

// ---------------------------------------------------------------- localStorage

class ArmazenamentoLocal implements Armazenamento {
  tipo = 'local' as const;
  descricao = 'Armazenamento do navegador';
  async ler() {
    const v = lsGet('publicadores.dados');
    if (!v) throw new Error('Nenhum dado salvo neste navegador.');
    return v;
  }
  async gravar(conteudo: string) {
    lsSet('publicadores.dados', conteudo);
  }
}

// ---------------------------------------------------------------- Localizar / criar / abrir

/** Arquivo encontrado automaticamente (ao lado do .exe ou o último usado). */
export async function localizarArquivo(): Promise<Armazenamento | null> {
  if (ehTauri()) {
    const caminho = await invoke<string | null>('localizar_dados', { ultimo: lsGet(CHAVE_ULTIMO) });
    return caminho ? new ArmazenamentoTauri(caminho) : null;
  }
  if (temFsAccess()) {
    const h = await idb<Handle | undefined>('readonly', (s) => s.get('ultimo') as IDBRequest<Handle | undefined>).catch(
      () => undefined,
    );
    return h ? new ArmazenamentoNavegador(h) : null;
  }
  return lsGet('publicadores.dados') ? new ArmazenamentoLocal() : null;
}

const filtroPub = { name: 'Dados de publicadores', extensions: ['pub'] };

/** Pergunta onde criar o novo arquivo de dados. */
export async function escolherNovoArquivo(): Promise<Armazenamento | null> {
  if (ehTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const caminho = await save({ defaultPath: NOME_ARQUIVO, filters: [filtroPub] });
    return caminho ? new ArmazenamentoTauri(caminho) : null;
  }
  if (temFsAccess()) {
    try {
      const h = (await (window as any).showSaveFilePicker({
        suggestedName: NOME_ARQUIVO,
        types: [{ description: filtroPub.name, accept: { 'application/octet-stream': ['.pub'] } }],
      })) as Handle;
      await idb('readwrite', (s) => s.put(h, 'ultimo'));
      return new ArmazenamentoNavegador(h);
    } catch {
      return null;
    }
  }
  return new ArmazenamentoLocal();
}

/** Pergunta qual arquivo .pub existente abrir. */
export async function escolherArquivoExistente(): Promise<Armazenamento | null> {
  if (ehTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const caminho = await open({ multiple: false, filters: [filtroPub] });
    return typeof caminho === 'string' ? new ArmazenamentoTauri(caminho) : null;
  }
  if (temFsAccess()) {
    try {
      const [h] = (await (window as any).showOpenFilePicker({
        types: [{ description: filtroPub.name, accept: { 'application/octet-stream': ['.pub'] } }],
      })) as Handle[];
      return new ArmazenamentoNavegador(h);
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------- Salvar arquivos gerados (PDF, JSON, pacote)

export async function salvarArquivoGerado(nome: string, bytes: Uint8Array | string, mime: string) {
  if (ehTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const ext = nome.split('.').pop()!;
    const caminho = await save({ defaultPath: nome, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!caminho) return false;
    const dados = typeof bytes === 'string' ? Array.from(new TextEncoder().encode(bytes)) : Array.from(bytes);
    await invoke('gravar_bytes', { caminho, dados });
    return true;
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Gera um .zip com o executável e o arquivo de dados para enviar a outra pessoa. */
export async function exportarPacote(arm: Armazenamento): Promise<boolean> {
  if (arm.tipo !== 'tauri') throw new Error('O pacote com o executável só pode ser gerado no aplicativo desktop.');
  const { save } = await import('@tauri-apps/plugin-dialog');
  const destino = await save({ defaultPath: 'Publicadores.zip', filters: [{ name: 'ZIP', extensions: ['zip'] }] });
  if (!destino) return false;
  await invoke('exportar_pacote', { destino, caminhoDados: (arm as ArmazenamentoTauri).caminho });
  return true;
}
