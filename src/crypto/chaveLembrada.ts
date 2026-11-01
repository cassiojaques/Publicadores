import type { Chave } from './crypto';

/**
 * Guarda a chave do arquivo no IndexedDB deste dispositivo para não pedir o PIN a cada abertura.
 * A CryptoKey é não exportável: dá para usar aqui, mas não para extrair o valor.
 * Sem IndexedDB (ou em caso de erro) tudo vira no-op e o PIN volta a ser pedido.
 */
const BANCO = 'publicadores-chaves';
const TABELA = 'chaves';

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TABELA);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

async function operar<T>(modo: IDBTransactionMode, fn: (t: IDBObjectStore) => IDBRequest): Promise<T | null> {
  try {
    const db = await abrir();
    return await new Promise<T>((ok, falha) => {
      const req = fn(db.transaction(TABELA, modo).objectStore(TABELA));
      req.onsuccess = () => ok(req.result as T);
      req.onerror = () => falha(req.error);
    }).finally(() => db.close());
  } catch {
    return null;
  }
}

export const chaveLembrada = (arquivo: string) => operar<Chave>('readonly', (t) => t.get(arquivo));
export const lembrarChave = (arquivo: string, chave: Chave) => operar('readwrite', (t) => t.put(chave, arquivo));
export const esquecerChave = (arquivo: string) => operar('readwrite', (t) => t.delete(arquivo));
