declare const __VERSAO__: string;
declare const __COMMIT__: string;
declare const __COMPILADO_EM__: string;

/** Data e hora em que esta versão foi gerada, no fuso local. Ex.: "02/11/2026 18:40". */
export const compiladoEm = new Date(__COMPILADO_EM__).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Ex.: "v0.1.0 (a0828f7) · 02/11/2026 18:40". */
export const textoVersao = `v${__VERSAO__}${__COMMIT__ ? ` (${__COMMIT__})` : ''} · ${compiladoEm}`;
