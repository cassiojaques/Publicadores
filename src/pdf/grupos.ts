import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { PRIVILEGIOS, type Db, type Publicador } from '../domain/types';
import { mesesComDados } from '../store/store';
import { situacao, type Situacao } from '../domain/serviceYear';

/**
 * PDF dos grupos de campo numa página A4, no mesmo visual da "Imagem de quem falta":
 * cada grupo é um quadro com cabeçalho na cor do grupo, faixa com superintendente e
 * ajudante e os membros numerados.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 30;
/** Espaço entre quadros (escala 1). */
const GAP = 12;

/** Mesmas cores dos grupos no mapa e na imagem de quem falta. */
const CORES_GRUPO = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#e11d48', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#ec4899', '#0891b2', '#a16207'];
const COR_SEM_GRUPO = '#64748b';

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const cor = {
  texto: hex('#1e293b'),
  titulo: hex('#0f172a'),
  suave: hex('#64748b'),
  borda: hex('#e2e8f0'),
  divisoria: hex('#f1f5f9'),
  branco: rgb(1, 1, 1),
};

type Linha =
  | { tipo: 'titulo'; texto: string; qtd?: number; cor: string }
  | { tipo: 'faixa' } // respiro da faixa dos responsáveis
  | { tipo: 'funcao'; rotulo: string; texto: string }
  | { tipo: 'membro'; n: number; texto: string; extra: string }
  | { tipo: 'fim' }; // respiro no pé do quadro

/** Altura de cada tipo de linha em escala 1. */
const ALTURA: Record<Linha['tipo'], number> = { titulo: 22, faixa: 4, funcao: 15, membro: 15, fim: 4 };

export function siglas(p: Publicador): string {
  return PRIVILEGIOS.filter((x) => p.privilegios.includes(x.id)).map((x) => x.curto).join(', ');
}

function linhasDoGrupo(db: Db, membrosTodos: Publicador[], grupoId: string | null, nome: string, corGrupo: string, comSiglas: boolean): Linha[] {
  const g = db.grupos.find((x) => x.id === grupoId);
  const membros = membrosTodos
    .filter((p) => p.grupoId === grupoId)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  const nomeDe = (id: string | null | undefined) => db.publicadores.find((p) => p.id === id)?.nome ?? '—';
  const linhas: Linha[] = [{ tipo: 'titulo', texto: nome, qtd: membros.length, cor: corGrupo }];
  if (g) {
    linhas.push({ tipo: 'faixa' });
    linhas.push({ tipo: 'funcao', rotulo: 'Superintendente', texto: nomeDe(g.superintendenteId) });
    linhas.push({ tipo: 'funcao', rotulo: 'Ajudante', texto: nomeDe(g.ajudanteId) });
    linhas.push({ tipo: 'faixa' });
  }
  membros.forEach((p, i) => linhas.push({ tipo: 'membro', n: i + 1, texto: p.nome, extra: comSiglas ? siglas(p) : '' }));
  linhas.push({ tipo: 'fim' });
  return linhas;
}

function cortar(texto: string, fonte: PDFFont, tam: number, largura: number) {
  if (fonte.widthOfTextAtSize(texto, tam) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && fonte.widthOfTextAtSize(t + '…', tam) > largura) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

const alturaDe = (linhas: Linha[]) => linhas.reduce((h, l) => h + ALTURA[l.tipo], 0);

/**
 * Distribui os grupos em `colunas` colunas de altura `alturaCol` (em escala 1).
 * Cada coluna é uma lista de quadros. Sem `quebrar`, cada grupo fica inteiro numa coluna;
 * com `quebrar`, os grupos seguem em fluxo e continuam na coluna seguinte. Retorna null se não couber.
 */
function distribuir(blocos: Linha[][], colunas: number, alturaCol: number, quebrar: boolean): Linha[][][] | null {
  const cols: Linha[][][] = Array.from({ length: colunas }, () => []);
  const usado = Array(colunas).fill(0);
  if (!quebrar) {
    for (const b of blocos) {
      const c = usado.indexOf(Math.min(...usado));
      const h = alturaDe(b) + (usado[c] ? GAP : 0);
      if (usado[c] + h > alturaCol) return null;
      cols[c].push(b);
      usado[c] += h;
    }
    return cols;
  }
  let c = 0;
  for (const b of blocos) {
    if (usado[c] && usado[c] + GAP + ALTURA.titulo + ALTURA.membro * 3 + ALTURA.fim > alturaCol) c++;
    if (c >= colunas) return null;
    if (usado[c]) usado[c] += GAP;
    const titulo = b[0] as Extract<Linha, { tipo: 'titulo' }>;
    let quadro: Linha[] = [];
    cols[c].push(quadro);
    for (const l of b) {
      if (usado[c] + ALTURA[l.tipo] + (l.tipo === 'fim' ? 0 : ALTURA.fim) > alturaCol) {
        quadro.push({ tipo: 'fim' });
        usado[c] += ALTURA.fim;
        if (++c >= colunas) return null;
        quadro = [{ tipo: 'titulo', texto: `${titulo.texto} (cont.)`, cor: titulo.cor }];
        cols[c].push(quadro);
        usado[c] += ALTURA.titulo;
        if (l.tipo === 'faixa') continue;
      }
      quadro.push(l);
      usado[c] += ALTURA[l.tipo];
    }
  }
  return cols;
}

/** Maior escala (até 1) em que os grupos cabem; busca binária. */
function melhorEscala(blocos: Linha[][], colunas: number, alturaPt: number, quebrar: boolean) {
  if (distribuir(blocos, colunas, alturaPt, quebrar)) return 1;
  let lo = 0.2;
  let hi = 1;
  if (!distribuir(blocos, colunas, alturaPt / lo, quebrar)) return 0;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (distribuir(blocos, colunas, alturaPt / m, quebrar)) lo = m;
    else hi = m;
  }
  return lo;
}

/** Caminho SVG de um retângulo com cantos arredondados (só os de cima, se `soTopo`). Origem no canto superior esquerdo, y para baixo. */
function caminhoArredondado(w: number, h: number, r: number, soTopo = false) {
  const rb = soTopo ? 0 : r;
  return [
    `M ${r} 0`, `H ${w - r}`, `Q ${w} 0 ${w} ${r}`,
    `V ${h - rb}`, rb ? `Q ${w} ${h} ${w - rb} ${h}` : '', `H ${rb}`, rb ? `Q 0 ${h} 0 ${h - rb}` : '',
    `V ${r}`, `Q 0 0 ${r} 0`, 'Z',
  ].join(' ');
}

export type FiltroSituacao = 'todos' | Situacao;

/**
 * Gera o PDF com todos os grupos numa única página A4, reduzindo a letra quando preciso.
 * `siglas: false` lista só os nomes, sem as designações (A, SM, PR…).
 */
export async function gerarPdfGrupos(
  db: Db,
  { situacao: filtro = 'todos', siglas: comSiglas = true }: { situacao?: FiltroSituacao; siglas?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Grupos de Campo');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  const meses = mesesComDados(db);
  const membros = db.publicadores.filter((p) => !p.arquivado && (filtro === 'todos' || situacao(p, meses) === filtro));

  // Legenda das siglas no rodapé, só das que aparecem.
  const legenda = comSiglas
    ? PRIVILEGIOS.filter((x) => membros.some((p) => p.privilegios.includes(x.id))).map((x) => `${x.curto} = ${x.label}`).join('   ·   ')
    : '';

  const topo = A4[1] - MARGEM;
  const inicioConteudo = topo - 58;
  const rodape = legenda ? MARGEM + 6 : MARGEM;
  const alturaPt = inicioConteudo - rodape;

  const blocos = db.grupos.map((g, i) => linhasDoGrupo(db, membros, g.id, g.nome, CORES_GRUPO[i % CORES_GRUPO.length], comSiglas));
  const semGrupo = linhasDoGrupo(db, membros, null, 'Sem grupo', COR_SEM_GRUPO, comSiglas);
  if (semGrupo.some((l) => l.tipo === 'membro')) blocos.push(semGrupo);

  // Escolhe o número de colunas e o modo que deixam a letra maior. Grupo inteiro numa
  // coluna é preferido; quebrar um grupo só compensa se a letra ficar bem maior.
  let melhor = { colunas: 2, escala: 0, quebrar: false };
  for (const colunas of [2, 3, 4]) {
    // Colunas estreitas cortam nomes: penaliza a escala pela largura disponível.
    const limiteLargura = colunas === 2 ? 1 : colunas === 3 ? 0.9 : 0.75;
    for (const quebrar of [false, true]) {
      const escala = Math.min(melhorEscala(blocos, colunas, alturaPt, quebrar), limiteLargura);
      const nota = escala * (quebrar ? 0.8 : 1);
      if (nota > melhor.escala * (melhor.quebrar ? 0.8 : 1) + 1e-6) melhor = { colunas, escala, quebrar };
    }
  }
  const { colunas, quebrar } = melhor;
  const s = melhor.escala || 0.2;
  const cols = distribuir(blocos, colunas, alturaPt / s, quebrar) ?? distribuir(blocos, colunas, Infinity, true)!;

  const pagina = doc.addPage(A4);

  // Cabeçalho da página: título, subtítulo e total no canto (como na imagem de quem falta).
  pagina.drawText('Grupos de Campo', { x: MARGEM, y: topo - 20, size: 22, font: negrito, color: cor.titulo });
  const filtroTxt = filtro === 'ativo' ? ' ativos' : filtro === 'inativo' ? ' inativos' : '';
  const sub = `${db.congregacao.nome || 'Congregação'} · ${db.grupos.length} ${db.grupos.length === 1 ? 'grupo' : 'grupos'} · ${new Date().toLocaleDateString('pt-BR')}`;
  pagina.drawText(cortar(sub, normal, 10.5, A4[0] - MARGEM * 2 - 110), { x: MARGEM, y: topo - 40, size: 10.5, font: normal, color: cor.suave });
  const total = String(membros.length);
  pagina.drawText(total, { x: A4[0] - MARGEM - negrito.widthOfTextAtSize(total, 24), y: topo - 20, size: 24, font: negrito, color: hex(CORES_GRUPO[0]) });
  const rotTotal = `publicadores${filtroTxt}`;
  pagina.drawText(rotTotal, { x: A4[0] - MARGEM - normal.widthOfTextAtSize(rotTotal, 9), y: topo - 38, size: 9, font: normal, color: cor.suave });

  if (legenda) pagina.drawText(cortar(legenda, normal, 7, A4[0] - MARGEM * 2), { x: MARGEM, y: MARGEM / 2 + 2, size: 7, font: normal, color: cor.suave });

  const gapCol = 12;
  const largCol = (A4[0] - MARGEM * 2 - gapCol * (colunas - 1)) / colunas;
  cols.forEach((quadros, c) => {
    const x0 = MARGEM + c * (largCol + gapCol);
    let y = inicioConteudo;
    quadros.forEach((quadro, q) => {
      if (q > 0) y -= GAP * s;
      desenharQuadro(pagina, quadro, x0, y, largCol, s, colunas, normal, negrito);
      y -= alturaDe(quadro) * s;
    });
  });

  return doc.save();
}

function desenharQuadro(
  pagina: PDFPage, linhas: Linha[], x0: number, yTopo: number, larg: number, s: number, colunas: number, normal: PDFFont, negrito: PDFFont,
) {
  const titulo = linhas[0] as Extract<Linha, { tipo: 'titulo' }>;
  const corGrupo = hex(titulo.cor);
  const h = alturaDe(linhas) * s;
  const raio = 6 * s;

  // Quadro branco com borda e cabeçalho colorido.
  pagina.drawSvgPath(caminhoArredondado(larg, h, raio), { x: x0, y: yTopo, color: cor.branco, borderColor: cor.borda, borderWidth: 0.6 });
  const hTitulo = ALTURA.titulo * s;
  pagina.drawSvgPath(caminhoArredondado(larg, hTitulo, raio, true), { x: x0, y: yTopo, color: corGrupo });

  const pad = 9 * s;
  // Coluna dos números com largura fixa, para os nomes ficarem alinhados.
  const tamNum = 8.5 * s;
  const largNum = negrito.widthOfTextAtSize('00', tamNum);
  const tamNome = 10 * s;
  let anterior: Linha['tipo'] | null = null;
  let y = yTopo;

  for (const l of linhas) {
    const hl = ALTURA[l.tipo] * s;
    const meio = y - hl / 2;
    if (l.tipo === 'titulo') {
      const tam = 11.5 * s;
      let largQtd = 0;
      if (l.qtd !== undefined) {
        const qtd = String(l.qtd);
        const tq = 10 * s;
        largQtd = negrito.widthOfTextAtSize(qtd, tq) + 8 * s;
        pagina.drawText(qtd, { x: x0 + larg - pad - negrito.widthOfTextAtSize(qtd, tq), y: meio - tq * 0.35, size: tq, font: negrito, color: cor.branco });
      }
      pagina.drawText(cortar(l.texto, negrito, tam, larg - pad * 2 - largQtd), { x: x0 + pad, y: meio - tam * 0.35, size: tam, font: negrito, color: cor.branco });
    } else if (l.tipo === 'faixa' || l.tipo === 'funcao') {
      // Faixa dos responsáveis: cor do grupo bem clara, com um filete à esquerda.
      pagina.drawRectangle({ x: x0 + 0.3, y: y - hl, width: larg - 0.6, height: hl, color: corGrupo, opacity: 0.1 });
      pagina.drawRectangle({ x: x0 + 0.3, y: y - hl, width: 2.5 * s, height: hl, color: corGrupo });
      if (l.tipo === 'funcao') {
        // Em colunas estreitas, abrevia o rótulo para sobrar espaço ao nome.
        const rot = colunas > 2 ? (l.rotulo === 'Superintendente' ? 'SUP.' : 'AJ.') : l.rotulo.toUpperCase();
        const tr = 6.5 * s;
        pagina.drawText(rot, { x: x0 + pad, y: meio - tr * 0.35, size: tr, font: negrito, color: corGrupo });
        const xNome = x0 + pad + (colunas > 2 ? negrito.widthOfTextAtSize('SUP.', tr) : negrito.widthOfTextAtSize('SUPERINTENDENTE', tr)) + 6 * s;
        pagina.drawText(cortar(l.texto, negrito, tamNome, x0 + larg - pad - xNome), { x: xNome, y: meio - tamNome * 0.35, size: tamNome, font: negrito, color: cor.titulo });
      }
    } else if (l.tipo === 'membro') {
      if (anterior === 'membro') pagina.drawLine({ start: { x: x0 + pad, y }, end: { x: x0 + larg - pad, y }, thickness: 0.5, color: cor.divisoria });
      const num = String(l.n);
      pagina.drawText(num, { x: x0 + pad + largNum - negrito.widthOfTextAtSize(num, tamNum), y: meio - tamNum * 0.35, size: tamNum, font: negrito, color: corGrupo });
      const xNome = x0 + pad + largNum + 6 * s;
      const tamExtra = 7.5 * s;
      const extraW = l.extra ? normal.widthOfTextAtSize(l.extra, tamExtra) : 0;
      pagina.drawText(cortar(l.texto, normal, tamNome, x0 + larg - pad - xNome - (extraW ? extraW + 6 * s : 0)), {
        x: xNome, y: meio - tamNome * 0.35, size: tamNome, font: normal, color: cor.texto,
      });
      if (l.extra) pagina.drawText(l.extra, { x: x0 + larg - pad - extraW, y: meio - tamExtra * 0.35, size: tamExtra, font: negrito, color: cor.suave });
    }
    anterior = l.tipo;
    y -= hl;
  }
}
