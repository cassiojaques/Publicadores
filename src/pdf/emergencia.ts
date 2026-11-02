import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Db, Publicador } from '../domain/types';

const A4_PAISAGEM: [number, number] = [841.89, 595.28];
const MARGEM = 28;
const TAM = 8;
const ENTRELINHA = 10;
const PAD = 4;

const cor = {
  texto: rgb(0.12, 0.14, 0.18),
  suave: rgb(0.42, 0.45, 0.5),
  destaque: rgb(0.27, 0.32, 0.8),
  fundo: rgb(0.93, 0.94, 0.99),
  zebra: rgb(0.97, 0.975, 0.985),
  borda: rgb(0.85, 0.87, 0.91),
};

/** Colunas da lista, como na planilha de emergência; `larg` é a fração da largura útil. */
const COLUNAS = [
  { titulo: 'Nome', larg: 0.2 },
  { titulo: 'Telefone', larg: 0.1 },
  { titulo: 'Endereço, bairro, cidade - UF', larg: 0.25 },
  { titulo: 'Contato de emergência', larg: 0.2 },
  { titulo: 'Endereço de emergência', larg: 0.25 },
];

/**
 * Contato e endereço de emergência ficam nas anotações, em linhas
 * "Contato de emergência: …" e "Endereço de emergência: …".
 */
export function dadosEmergencia(p: Publicador): { contato: string; endereco: string } {
  const pegar = (rotulo: RegExp) =>
    p.anotacoes
      .split('\n')
      .map((l) => l.match(rotulo)?.[1]?.trim())
      .find(Boolean) ?? '';
  return { contato: pegar(/^\s*contato de emerg[eê]ncia\s*:\s*(.*)$/i), endereco: pegar(/^\s*endere[cç]o de emerg[eê]ncia\s*:\s*(.*)$/i) };
}

/** Tira caracteres que a fonte padrão do PDF não consegue desenhar (ex.: emojis). */
function limpador(fonte: PDFFont) {
  const ok = new Set(fonte.getCharacterSet());
  return (s: string) =>
    [...s.replace(/\s+/g, ' ').trim()].filter((c) => ok.has(c.codePointAt(0)!)).join('');
}

/** Quebra o texto em linhas que caibam na largura. */
function quebrar(texto: string, fonte: PDFFont, largura: number): string[] {
  if (!texto) return [''];
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(' ')) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, TAM) <= largura) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    // Palavra maior que a coluna: corta em pedaços.
    let resto = palavra;
    while (fonte.widthOfTextAtSize(resto, TAM) > largura && resto.length > 1) {
      let n = resto.length - 1;
      while (n > 1 && fonte.widthOfTextAtSize(resto.slice(0, n), TAM) > largura) n--;
      linhas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    atual = resto;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Lista de emergência (telefone, endereço e contato de emergência), separada por grupo de campo. */
export async function gerarPdfEmergencia(db: Db): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Lista de Emergência');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const limpar = limpador(normal);
  const [W, H] = A4_PAISAGEM;
  const util = W - MARGEM * 2;
  const largs = COLUNAS.map((c) => c.larg * util);
  const xs = largs.map((_, i) => MARGEM + largs.slice(0, i).reduce((s, l) => s + l, 0));
  const data = new Date().toLocaleDateString('pt-BR');

  const membros = db.publicadores.filter((p) => !p.arquivado);
  const porNome = (a: Publicador, b: Publicador) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });
  const grupos = [...db.grupos.map((g) => ({ id: g.id as string | null, nome: g.nome })), { id: null, nome: 'Sem grupo' }]
    .map((g) => ({ ...g, membros: membros.filter((p) => (p.grupoId ?? null) === g.id).sort(porNome) }))
    .filter((g) => g.membros.length > 0);

  let pagina: PDFPage;
  let y = 0;
  let nPagina = 0;
  const novaPagina = () => {
    pagina = doc.addPage(A4_PAISAGEM);
    nPagina++;
    const topo = H - MARGEM;
    pagina.drawText(`Lista de Emergência${db.congregacao.nome ? ' — ' + limpar(db.congregacao.nome) : ''}`, { x: MARGEM, y: topo - 12, size: 14, font: negrito, color: cor.texto });
    const resumo = `${membros.length} publicadores · ${data} · página ${nPagina}`;
    pagina.drawText(resumo, { x: W - MARGEM - normal.widthOfTextAtSize(resumo, 8), y: topo - 10, size: 8, font: normal, color: cor.suave });
    pagina.drawLine({ start: { x: MARGEM, y: topo - 20 }, end: { x: W - MARGEM, y: topo - 20 }, thickness: 1.2, color: cor.destaque });
    y = topo - 30;
  };
  const cabecalhoColunas = () => {
    COLUNAS.forEach((c, i) => pagina.drawText(c.titulo.toUpperCase(), { x: xs[i] + PAD, y: y - 8, size: 6.5, font: negrito, color: cor.suave }));
    y -= 12;
    pagina.drawLine({ start: { x: MARGEM, y }, end: { x: W - MARGEM, y }, thickness: 0.5, color: cor.borda });
  };
  const tituloGrupo = (texto: string) => {
    const h = 18;
    pagina.drawRectangle({ x: MARGEM, y: y - h, width: util, height: h, color: cor.fundo });
    pagina.drawRectangle({ x: MARGEM, y: y - h, width: 2.5, height: h, color: cor.destaque });
    pagina.drawText(limpar(texto), { x: MARGEM + 8, y: y - 12.5, size: 10.5, font: negrito, color: cor.texto });
    y -= h + 2;
    cabecalhoColunas();
  };

  novaPagina();
  for (const g of grupos) {
    const grupo = db.grupos.find((x) => x.id === g.id);
    const nomeDe = (id: string | null | undefined) => db.publicadores.find((p) => p.id === id)?.nome;
    const funcoes = [grupo && nomeDe(grupo.superintendenteId), grupo && nomeDe(grupo.ajudanteId)].filter(Boolean).join(' e ');
    const titulo = `${g.nome}${funcoes ? ` — ${funcoes}` : ''} (${g.membros.length})`;
    // O título do grupo não fica sozinho no pé da página.
    if (y - 18 - 14 - ENTRELINHA * 2 < MARGEM) novaPagina();
    else if (g !== grupos[0]) y -= 10;
    tituloGrupo(titulo);
    g.membros.forEach((p, i) => {
      const e = dadosEmergencia(p);
      const celulas = [p.nome, p.telefone, p.endereco, e.contato, e.endereco].map((t, c) => quebrar(limpar(t), c === 0 ? negrito : normal, largs[c] - PAD * 2));
      const h = Math.max(...celulas.map((l) => l.length)) * ENTRELINHA + PAD;
      if (y - h < MARGEM) {
        novaPagina();
        tituloGrupo(`${g.nome} (cont.)`);
      }
      if (i % 2 === 1) pagina.drawRectangle({ x: MARGEM, y: y - h, width: util, height: h, color: cor.zebra });
      celulas.forEach((linhas, c) =>
        linhas.forEach((l, j) =>
          pagina.drawText(l, { x: xs[c] + PAD, y: y - PAD - 6 - j * ENTRELINHA, size: TAM, font: c === 0 ? negrito : normal, color: cor.texto }),
        ),
      );
      y -= h;
    });
  }
  return doc.save();
}
