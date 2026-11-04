import type { Localizacao, Publicador } from '../domain/types';

/** Endereço pronto para o serviço de mapas: só o endereço e a cidade, nunca o nome. */
export function consultaEndereco(endereco: string, cidade: string): string {
  const e = endereco.trim().replace(/\s+/g, ' ');
  const c = cidade.trim();
  if (!c || e.toLowerCase().includes(c.split(/[-,/]/)[0].trim().toLowerCase())) return e;
  return `${e}, ${c}`;
}

/**
 * Link que abre o endereço no aplicativo de mapas (Google Maps no celular, no navegador no computador).
 * Abre sempre pelo texto do endereço (e a cidade), para o mapa mostrar o endereço e não só coordenadas.
 */
export function urlMapa(p: Publicador, cidade: string): string | null {
  const e = p.endereco.trim();
  if (!e) return null;
  const consulta = consultaEndereco(e, cidade);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

/** Tem endereço e ainda não foi localizado (ou o endereço mudou desde então). */
export function precisaLocalizar(p: Publicador): boolean {
  const e = p.endereco.trim();
  return !!e && (!p.local || p.local.endereco !== e);
}

/** Localização válida para o endereço atual. */
export function localAtual(p: Publicador): Localizacao | null {
  return p.local && p.local.endereco === p.endereco.trim() ? p.local : null;
}

/**
 * Busca a coordenada no OpenStreetMap (Nominatim). Retorna null se não encontrar.
 * A política do serviço pede no máximo uma consulta por segundo: quem chama espaça as chamadas.
 */
export async function geocodificar(consulta: string, sinal?: AbortSignal): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('accept-language', 'pt-BR');
  url.searchParams.set('q', consulta);
  const r = await fetch(url, { signal: sinal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Serviço de mapas respondeu ${r.status}`);
  const lista = (await r.json()) as { lat: string; lon: string }[];
  if (!lista.length) return null;
  return { lat: Number(lista[0].lat), lng: Number(lista[0].lon) };
}

export const espera = (ms: number, sinal?: AbortSignal) =>
  new Promise<void>((ok, erro) => {
    const t = setTimeout(ok, ms);
    sinal?.addEventListener('abort', () => {
      clearTimeout(t);
      erro(new DOMException('Cancelado', 'AbortError'));
    });
  });
