import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import { PRIVILEGIOS, type Db, type Publicador } from '../domain/types';
import { mesesComDados } from '../store/store';
import { situacao } from '../domain/serviceYear';

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 32;
const GAP = 14;

const cor = {
  texto: rgb(0.12, 0.14, 0.18),
  suave: rgb(0.42, 0.45, 0.5),
  destaque: rgb(0.27, 0.32, 0.8),
  fundo: rgb(0.94, 0.95, 0.98),
  borda: rgb(0.85, 0.87, 0.91),
};

type Linha =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'funcao'; rotulo: string; texto: string }
  | { tipo: 'separador' }
  | { tipo: 'membro'; texto: string; extra: string };

/** Altura de cada tipo de linha em escala 1. */
const ALTURA: Record<Linha['tipo'], number> = { titulo: 22, funcao: 14, separador: 4, membro: 14 };

export function siglas(p: Publicador): string {
  return PRIVILEGIOS.filter((x) => p.privilegios.includes(x.id)).map((x) => x.curto).join(', ');
}

function linhasDoGrupo(db: Db, membrosTodos: Publicador[], grupoId: string | null, nome: string): Linha[] {
  const g = db.grupos.find((x) => x.id === grupoId);
  const membros = membrosTodos
    .filter((p) => p.grupoId === grupoId)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  const nomeDe = (id: string | null | undefined) => db.publicadores.find((p) => p.id === id)?.nome ?? '—';
  const linhas: Linha[] = [{ tipo: 'titulo', texto: `${nome}  (${membros.length})` }];
  if (g) {
    linhas.push({ tipo: 'funcao', rotulo: 'Superintendente', texto: nomeDe(g.superintendenteId) });
    linhas.push({ tipo: 'funcao', rotulo: 'Ajudante', texto: nomeDe(g.ajudanteId) });
    if (membros.length) linhas.push({ tipo: 'separador' });
  }
  for (const p of membros) linhas.push({ tipo: 'membro', texto: p.nome, extra: siglas(p) });
  return linhas;
}

function cortar(texto: string, fonte: PDFFont, tam: number, largura: number) {
  if (fonte.widthOfTextAtSize(texto, tam) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && fonte.widthOfTextAtSize(t + '…', tam) > largura) t = t.slice(0, -1);
  return t + '…';
}

const alturaDe = (linhas: Linha[]) => linhas.reduce((h, l) => h + ALTURA[l.tipo], 0);

/**
 * Distribui os grupos em `colunas` colunas de altura `alturaCol` (em escala 1).
 * Sem `quebrar`, cada grupo fica inteiro numa coluna; com `quebrar`, os grupos seguem
 * em fluxo e continuam na coluna seguinte. Retorna null se não couber.
 */
function distribuir(blocos: Linha[][], colunas: number, alturaCol: number, quebrar: boolean): Linha[][] | null {
  const cols: Linha[][] = Array.from({ length: colunas }, () => []);
  const usado = Array(colunas).fill(0);
  if (!quebrar) {
    for (const b of blocos) {
      const c = usado.indexOf(Math.min(...usado));
      const h = alturaDe(b) + (usado[c] ? GAP : 0);
      if (usado[c] + h > alturaCol) return null;
      cols[c].push(...b);
      usado[c] += h;
    }
    return cols;
  }
  let c = 0;
  for (const b of blocos) {
    if (usado[c] && usado[c] + GAP + ALTURA.titulo + ALTURA.membro * 3 > alturaCol) c++;
    if (c >= colunas) return null;
    if (usado[c]) usado[c] += GAP;
    const titulo = b[0].tipo === 'titulo' ? b[0].texto : '';
    for (const l of b) {
      if (usado[c] + ALTURA[l.tipo] > alturaCol) {
        if (++c >= colunas) return null;
        cols[c].push({ tipo: 'titulo', texto: `${titulo} (cont.)` });
        usado[c] += ALTURA.titulo;
        if (l.tipo === 'separador') continue;
      }
      cols[c].push(l);
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

/** Gera o PDF com todos os grupos numa única página A4, reduzindo a letra quando preciso. */
export async function gerarPdfGrupos(db: Db, { soAtivos = false }: { soAtivos?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Grupos de Campo');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const topo = A4[1] - MARGEM;
  const inicioConteudo = topo - 32;
  const alturaPt = inicioConteudo - MARGEM;

  const meses = mesesComDados(db);
  const membros = db.publicadores.filter((p) => !p.arquivado && !(soAtivos && situacao(p, meses) === 'inativo'));
  const blocos = db.grupos.map((g) => linhasDoGrupo(db, membros, g.id, g.nome));
  const semGrupo = linhasDoGrupo(db, membros, null, 'Sem grupo');
  if (semGrupo.length > 1) blocos.push(semGrupo);

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
  const titulo = `Grupos de Campo${db.congregacao.nome ? ' — ' + db.congregacao.nome : ''}`;
  pagina.drawText(titulo, { x: MARGEM, y: topo - 14, size: 16, font: negrito, color: cor.texto });
  const data = new Date().toLocaleDateString('pt-BR');
  pagina.drawText(data, { x: A4[0] - MARGEM - normal.widthOfTextAtSize(data, 9), y: topo - 12, size: 9, font: normal, color: cor.suave });

  const gap = 12;
  const largCol = (A4[0] - MARGEM * 2 - gap * (colunas - 1)) / colunas;
  cols.forEach((linhas, c) => {
    const x0 = MARGEM + c * (largCol + gap);
    let y = inicioConteudo;
    linhas.forEach((l, i) => {
      if (l.tipo === 'titulo') {
        if (i > 0) y -= GAP * s;
        const h = 18 * s;
        pagina.drawRectangle({ x: x0, y: y - h, width: largCol, height: h, color: cor.fundo });
        pagina.drawText(cortar(l.texto, negrito, 11 * s, largCol - 12), { x: x0 + 6, y: y - 13 * s, size: 11 * s, font: negrito, color: cor.texto });
      } else if (l.tipo === 'funcao') {
        // Em colunas estreitas, abrevia o rótulo para sobrar espaço ao nome.
        const rot = colunas > 2 ? (l.rotulo === 'Superintendente' ? 'SUP.' : 'AJ.') : l.rotulo.toUpperCase();
        pagina.drawText(rot, { x: x0 + 6, y: y - 10 * s, size: 6.5 * s, font: negrito, color: cor.destaque });
        const off = negrito.widthOfTextAtSize(rot, 6.5 * s) + 6 * s;
        pagina.drawText(cortar(l.texto, negrito, 9.5 * s, largCol - off - 12), { x: x0 + 6 + off, y: y - 10 * s, size: 9.5 * s, font: negrito, color: cor.texto });
      } else if (l.tipo === 'separador') {
        pagina.drawLine({ start: { x: x0, y: y - 2 * s }, end: { x: x0 + largCol, y: y - 2 * s }, thickness: 0.5, color: cor.borda });
      } else {
        const extraW = l.extra ? normal.widthOfTextAtSize(l.extra, 8 * s) : 0;
        pagina.drawText(cortar(l.texto, normal, 9.5 * s, largCol - extraW - 18), { x: x0 + 6, y: y - 10 * s, size: 9.5 * s, font: normal, color: cor.texto });
        if (l.extra) pagina.drawText(l.extra, { x: x0 + largCol - 6 - extraW, y: y - 10 * s, size: 8 * s, font: normal, color: cor.suave });
      }
      y -= ALTURA[l.tipo] * s;
    });
  });

  return doc.save();
}
