import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { PRIVILEGIOS, type Db, type Publicador } from '../domain/types';

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 40;
const COLUNAS = 2;
const GAP = 16;
const LINHA = 14;

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
  | { tipo: 'membro'; texto: string; extra: string };

export function siglas(p: Publicador): string {
  return PRIVILEGIOS.filter((x) => p.privilegios.includes(x.id)).map((x) => x.curto).join(', ');
}

function linhasDoGrupo(db: Db, grupoId: string | null, nome: string): Linha[] {
  const g = db.grupos.find((x) => x.id === grupoId);
  const membros = db.publicadores
    .filter((p) => !p.arquivado && p.grupoId === grupoId)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  const nomeDe = (id: string | null | undefined) => db.publicadores.find((p) => p.id === id)?.nome ?? '—';
  const linhas: Linha[] = [{ tipo: 'titulo', texto: `${nome}  (${membros.length})` }];
  if (g) {
    linhas.push({ tipo: 'funcao', rotulo: 'Superintendente', texto: nomeDe(g.superintendenteId) });
    linhas.push({ tipo: 'funcao', rotulo: 'Ajudante', texto: nomeDe(g.ajudanteId) });
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

export async function gerarPdfGrupos(db: Db): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Grupos de Campo');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const largCol = (A4[0] - MARGEM * 2 - GAP * (COLUNAS - 1)) / COLUNAS;
  const topo = A4[1] - MARGEM;

  let pagina: PDFPage;
  let col = 0;
  let y = 0;
  let inicioConteudo = 0;
  /** Posição atual (y) de cada coluna da página corrente. */
  let ys: number[] = [];

  const novaPagina = () => {
    pagina = doc.addPage(A4);
    const titulo = `Grupos de Campo${db.congregacao.nome ? ' — ' + db.congregacao.nome : ''}`;
    pagina.drawText(titulo, { x: MARGEM, y: topo - 14, size: 16, font: negrito, color: cor.texto });
    const data = new Date().toLocaleDateString('pt-BR');
    pagina.drawText(data, {
      x: A4[0] - MARGEM - normal.widthOfTextAtSize(data, 9),
      y: topo - 12,
      size: 9,
      font: normal,
      color: cor.suave,
    });
    inicioConteudo = topo - 36;
    ys = Array(COLUNAS).fill(inicioConteudo);
    col = 0;
    y = inicioConteudo;
  };
  const x0 = () => MARGEM + col * (largCol + GAP);
  const usarColuna = (c: number) => {
    ys[col] = y;
    col = c;
    y = ys[c];
  };
  const proximaColuna = () => {
    if (col + 1 >= COLUNAS) novaPagina();
    else usarColuna(col + 1);
  };
  const alturaDe = (linhas: Linha[]) =>
    linhas.reduce((h, l, i) => {
      if (l.tipo === 'titulo') return h + 22;
      if (l.tipo === 'funcao') return h + LINHA + (linhas[i + 1]?.tipo === 'membro' ? 4 : 0);
      return h + LINHA;
    }, 0);

  novaPagina();
  const blocos = db.grupos.map((g) => linhasDoGrupo(db, g.id, g.nome));
  const semGrupo = linhasDoGrupo(db, null, 'Sem grupo');
  if (semGrupo.length > 1) blocos.push(semGrupo);

  for (const linhas of blocos) {
    // Coloca o grupo na coluna com mais espaço livre; se não couber inteiro, abre nova página
    // (a menos que o grupo seja maior que uma coluna inteira — aí ele continua na coluna seguinte).
    ys[col] = y;
    usarColuna(ys.indexOf(Math.max(...ys)));
    const altura = alturaDe(linhas);
    if (y - altura < MARGEM && (altura <= inicioConteudo - MARGEM || y - LINHA * 4 < MARGEM)) novaPagina();
    const titulo = linhas[0].texto;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (y - LINHA < MARGEM) {
        proximaColuna();
        desenharTitulo(`${titulo} (cont.)`);
      }
      if (l.tipo === 'titulo') desenharTitulo(l.texto);
      else if (l.tipo === 'funcao') {
        pagina!.drawText(l.rotulo.toUpperCase(), { x: x0() + 6, y: y - 10, size: 6.5, font: negrito, color: cor.destaque });
        const off = negrito.widthOfTextAtSize(l.rotulo.toUpperCase(), 6.5) + 6;
        pagina!.drawText(cortar(l.texto, negrito, 9.5, largCol - off - 12), {
          x: x0() + 6 + off, y: y - 10, size: 9.5, font: negrito, color: cor.texto,
        });
        y -= LINHA;
        if (linhas[i + 1]?.tipo === 'membro') {
          pagina!.drawLine({ start: { x: x0(), y: y - 2 }, end: { x: x0() + largCol, y: y - 2 }, thickness: 0.5, color: cor.borda });
          y -= 4;
        }
      } else {
        const extraW = l.extra ? normal.widthOfTextAtSize(l.extra, 8) : 0;
        pagina!.drawText(cortar(l.texto, normal, 9.5, largCol - extraW - 18), {
          x: x0() + 6, y: y - 10, size: 9.5, font: normal, color: cor.texto,
        });
        if (l.extra) {
          pagina!.drawText(l.extra, { x: x0() + largCol - 6 - extraW, y: y - 10, size: 8, font: normal, color: cor.suave });
        }
        y -= LINHA;
      }
    }
    y -= GAP;
  }

  function desenharTitulo(t: string) {
    pagina!.drawRectangle({ x: x0(), y: y - 18, width: largCol, height: 18, color: cor.fundo });
    pagina!.drawText(cortar(t, negrito, 11, largCol - 12), { x: x0() + 6, y: y - 13, size: 11, font: negrito, color: cor.texto });
    y -= 22;
  }

  return doc.save();
}
