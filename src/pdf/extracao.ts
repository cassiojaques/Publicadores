import { mesesComDados } from '../store/store';
import { mesesDoAnoServico, mesRelatorioAtual, situacao, ultimoMesFechado } from '../domain/serviceYear';
import { statusDoMes, totaisDoMes } from '../domain/relatorios';
import type { Db, Publicador } from '../domain/types';
import { carregarModelo, gerarS21, gerarS21Totais } from './s21';
import { gerarPdfGrupos } from './grupos';
import { gerarPdfEmergencia } from './emergencia';
import { gerarS88Bytes } from './s88';

type Progresso = (feitos: number, total: number) => void;

const PASTA_PIONEIROS = 'P. regulares, p. especiais e mis. em campo';
const limparNome = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
const primeiroNome = (p: Publicador | undefined) => p?.nome.trim().split(/\s+/)[0] ?? '';
export const ehPioneiro = (p: Publicador) =>
  p.privilegios.some((x) => x === 'pioneiro_regular' || x === 'pioneiro_especial' || x === 'missionario');

/**
 * Caminho de cada cartão no arquivo da congregação:
 *  Inativos (n)/Nome (Grupo).pdf
 *  Ativos (n)/P. regulares, p. especiais e mis. em campo (n)/Nome (Grupo).pdf
 *  Ativos (n)/Outros publicadores (n)/Grupo 1 - Superintendente e Ajudante (n)/Nome.pdf
 * Cada pasta em ordem alfabética (o próprio nome do arquivo ordena).
 */
export function caminhosDosCartoes(db: Db, hoje = new Date()): { p: Publicador; caminho: string }[] {
  const meses = mesesComDados(db);
  const ate = ultimoMesFechado(hoje);
  const todos = db.publicadores.filter((p) => !p.arquivado);
  const inativos = todos.filter((p) => situacao(p, meses, ate) === 'inativo');
  const ativos = todos.filter((p) => !inativos.includes(p));
  const pioneiros = ativos.filter(ehPioneiro);
  const outros = ativos.filter((p) => !ehPioneiro(p));
  const nomeGrupo = (p: Publicador) => db.grupos.find((g) => g.id === p.grupoId)?.nome;
  const comGrupo = (p: Publicador) => limparNome(nomeGrupo(p) ? `${p.nome} (${nomeGrupo(p)})` : p.nome);

  const raizAtivos = `Ativos (${ativos.length})`;
  const saida: { p: Publicador; caminho: string }[] = [];
  for (const p of inativos) saida.push({ p, caminho: `Inativos (${inativos.length})/${comGrupo(p)}` });
  for (const p of pioneiros) saida.push({ p, caminho: `${raizAtivos}/${PASTA_PIONEIROS} (${pioneiros.length})/${comGrupo(p)}` });

  const pastaOutros = `${raizAtivos}/Outros publicadores (${outros.length})`;
  const grupos = [...db.grupos.map((g) => ({ ...g })), { id: null, nome: 'Sem grupo', superintendenteId: null, ajudanteId: null }];
  for (const g of grupos) {
    const membros = outros.filter((p) => (p.grupoId ?? null) === g.id);
    if (!membros.length) continue;
    const pub = (id: string | null) => db.publicadores.find((p) => p.id === id);
    const funcoes = [primeiroNome(pub(g.superintendenteId)), primeiroNome(pub(g.ajudanteId))].filter(Boolean).join(' e ');
    const pasta = limparNome(`${g.nome}${funcoes ? ` - ${funcoes}` : ''} (${membros.length})`);
    for (const p of membros) saida.push({ p, caminho: `${pastaOutros}/${pasta}/${limparNome(p.nome)}` });
  }

  // Nomes repetidos na mesma pasta ganham (2), (3)…
  const usados = new Set<string>();
  return saida.map(({ p, caminho }) => {
    let c = `${caminho}.pdf`;
    for (let n = 2; usados.has(c.toLowerCase()); n++) c = `${caminho} (${n}).pdf`;
    usados.add(c.toLowerCase());
    return { p, caminho: c };
  });
}

/** Totais da congregação por mês do ano de serviço, nas três categorias do S-1. Meses sem relatório = null. */
export function totaisDoAno(db: Db, anoServico: number, hoje = new Date()) {
  const meses = mesesComDados(db);
  const ate = mesRelatorioAtual(hoje);
  const porMes = mesesDoAnoServico(anoServico).map((mes) => {
    if (mes > ate || !meses.has(mes)) return null;
    const t = totaisDoMes(statusDoMes(db, mes, meses));
    return t.publicadores.relatorios + t.auxiliares.relatorios + t.regulares.relatorios ? t : null;
  });
  return {
    publicadores: porMes.map((t) => t && t.publicadores),
    auxiliares: porMes.map((t) => t && t.auxiliares),
    regulares: porMes.map((t) => t && t.regulares),
  };
}

/** PDFs da raiz do arquivo, na ordem em que aparecem. */
export const ARQUIVOS_RAIZ = [
  'Total (Publicadores).pdf',
  'Total (Pioneiros auxiliares).pdf',
  'Total (Pioneiros Reg. Espe. e Missionários em campo).pdf',
  'Grupos de Saída de Campo.pdf',
  'Lista de Emergência.pdf',
  'Registro de Assistência (S-88).pdf',
];

/** Pasta de um caminho de cartão ("A/B/Nome.pdf" → "A/B"). */
const pastaDe = (caminho: string) => caminho.split('/').slice(0, -1).join('/');

/**
 * Todas as pastas do arquivo (inclusive as que só contêm outras pastas), em ordem alfabética,
 * e quais delas guardam cartões (as "folhas").
 */
export function pastasDaExtracao(db: Db): { todas: string[]; folhas: Set<string> } {
  const todas = new Set<string>();
  const folhas = new Set<string>();
  for (const { caminho } of caminhosDosCartoes(db)) {
    const partes = caminho.split('/').slice(0, -1);
    folhas.add(partes.join('/'));
    partes.forEach((_, i) => todas.add(partes.slice(0, i + 1).join('/')));
  }
  return { todas: [...todas].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })), folhas };
}

/** O que extrair: PDFs da raiz (por nome) e pastas com cartões (por caminho). Sem seleção, tudo. */
export interface SelecaoExtracao {
  arquivos: string[];
  pastas: string[];
}

export function totalDaExtracao(db: Db, selecao?: SelecaoExtracao): number {
  const pastas = selecao && new Set(selecao.pastas);
  const cartoes = caminhosDosCartoes(db).filter((c) => !pastas || pastas.has(pastaDe(c.caminho))).length;
  return cartoes + (selecao ? selecao.arquivos.length : ARQUIVOS_RAIZ.length);
}

async function montarArquivos(db: Db, anoServico: number, progresso?: Progresso, selecao?: SelecaoExtracao): Promise<Record<string, Uint8Array>> {
  const quer = (arquivo: string) => !selecao || selecao.arquivos.includes(arquivo);
  const pastas = selecao && new Set(selecao.pastas);
  const cartoes = caminhosDosCartoes(db).filter((c) => !pastas || pastas.has(pastaDe(c.caminho)));
  const total = totalDaExtracao(db, selecao);
  let feitos = 0;
  const passo = () => progresso?.(++feitos, total);
  const arquivos: Record<string, Uint8Array> = {};

  const precisaModelo = cartoes.length > 0 || ARQUIVOS_RAIZ.slice(0, 3).some(quer);
  const modelo = precisaModelo ? await carregarModelo() : new Uint8Array();

  const tot = totaisDoAno(db, anoServico);
  const cartoesTotais: [string, string, typeof tot.publicadores][] = [
    [ARQUIVOS_RAIZ[0], 'Publicadores', tot.publicadores],
    [ARQUIVOS_RAIZ[1], 'Pioneiros auxiliares', tot.auxiliares],
    [ARQUIVOS_RAIZ[2], 'Pioneiros regulares, especiais e missionários em campo', tot.regulares],
  ];
  for (const [arquivo, nome, porMes] of cartoesTotais) {
    if (!quer(arquivo)) continue;
    arquivos[arquivo] = await (await gerarS21Totais(modelo, nome, anoServico, porMes)).save();
    passo();
  }
  if (quer(ARQUIVOS_RAIZ[3])) {
    arquivos[ARQUIVOS_RAIZ[3]] = await gerarPdfGrupos(db, { situacao: 'ativo' });
    passo();
  }
  if (quer(ARQUIVOS_RAIZ[4])) {
    arquivos[ARQUIVOS_RAIZ[4]] = await gerarPdfEmergencia(db);
    passo();
  }
  if (quer(ARQUIVOS_RAIZ[5])) {
    arquivos[ARQUIVOS_RAIZ[5]] = await gerarS88Bytes(db, anoServico);
    passo();
  }

  for (const { p, caminho } of cartoes) {
    arquivos[caminho] = await (await gerarS21(modelo, p, anoServico)).save();
    passo();
  }
  return arquivos;
}

/**
 * Zip com o arquivo dos Registros de Publicador (S-21) organizado em pastas e, na raiz,
 * os cartões de totais, o PDF dos grupos (só ativos), a lista de emergência por grupo e o S-88.
 */
export async function gerarExtracao(db: Db, anoServico: number, progresso?: Progresso, selecao?: SelecaoExtracao): Promise<Uint8Array> {
  const { zipSync } = await import('fflate');
  // PDFs já são comprimidos; nível 0 deixa o zip rápido.
  return zipSync(await montarArquivos(db, anoServico, progresso, selecao), { level: 0 });
}

/**
 * Extração da seleção: um único PDF da raiz sai como arquivo; qualquer pasta, ou mais de um item, vira .zip.
 */
export async function gerarSelecao(
  db: Db,
  anoServico: number,
  selecao: SelecaoExtracao,
  progresso?: Progresso,
): Promise<{ nome: string; bytes: Uint8Array; mime: string; quantidade: number }> {
  const arquivos = await montarArquivos(db, anoServico, progresso, selecao);
  const quantidade = Object.keys(arquivos).length;
  if (selecao.pastas.length === 0 && selecao.arquivos.length === 1) {
    const [nome, bytes] = Object.entries(arquivos)[0];
    return { nome, bytes, mime: 'application/pdf', quantidade };
  }
  const { zipSync } = await import('fflate');
  return { nome: `Registros de Publicador (S-21) ${anoServico}.zip`, bytes: zipSync(arquivos, { level: 0 }), mime: 'application/zip', quantidade };
}
