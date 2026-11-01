/**
 * Formato do arquivo de dados (.pub): JSON com o conteúdo cifrado em AES-256-GCM.
 * A chave é derivada do PIN/senha com PBKDF2-SHA256 e um salt aleatório.
 */
export interface ArquivoCifrado {
  formato: 'pub-v1';
  kdf: { nome: 'PBKDF2-SHA256'; iteracoes: number; salt: string };
  iv: string;
  dados: string;
}

export const ITERACOES_PADRAO = 600_000;

export class SenhaIncorretaError extends Error {
  constructor() {
    super('PIN ou senha incorretos.');
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function paraBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function deBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export interface Chave {
  key: CryptoKey;
  salt: Uint8Array;
  iteracoes: number;
}

export async function derivarChave(
  senha: string,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
  iteracoes = ITERACOES_PADRAO,
): Promise<Chave> {
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iteracoes },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { key, salt, iteracoes };
}

export async function cifrar(chave: Chave, texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave.key, enc.encode(texto)));
  const arquivo: ArquivoCifrado = {
    formato: 'pub-v1',
    kdf: { nome: 'PBKDF2-SHA256', iteracoes: chave.iteracoes, salt: paraBase64(chave.salt) },
    iv: paraBase64(iv),
    dados: paraBase64(cifrado),
  };
  return JSON.stringify(arquivo);
}

export function lerArquivo(conteudo: string): ArquivoCifrado {
  let arq: ArquivoCifrado;
  try {
    arq = JSON.parse(conteudo);
  } catch {
    throw new Error('O arquivo de dados está corrompido ou não é um arquivo .pub.');
  }
  if (arq?.formato !== 'pub-v1') throw new Error('Formato de arquivo não reconhecido.');
  return arq;
}

/** Decifra o arquivo e devolve o texto e a chave (para regravar com a mesma senha). */
export async function decifrar(conteudo: string, senha: string): Promise<{ texto: string; chave: Chave }> {
  const arq = lerArquivo(conteudo);
  return decifrarComChave(conteudo, await derivarChave(senha, deBase64(arq.kdf.salt), arq.kdf.iteracoes));
}

/** Decifra com uma chave já derivada (ex.: lembrada neste dispositivo). */
export async function decifrarComChave(conteudo: string, chave: Chave): Promise<{ texto: string; chave: Chave }> {
  const arq = lerArquivo(conteudo);
  if (arq.kdf.salt !== paraBase64(chave.salt) || arq.kdf.iteracoes !== chave.iteracoes) throw new SenhaIncorretaError();
  try {
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(arq.iv) }, chave.key, deBase64(arq.dados));
    return { texto: dec.decode(plano), chave };
  } catch {
    throw new SenhaIncorretaError();
  }
}
