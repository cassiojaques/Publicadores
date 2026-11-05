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

/** Mesmas cores dos grupos no mapa e nos relatórios. */
const CORES_GRUPO = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#e11d48', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#ec4899', '#0891b2', '#a16207'];
const COR_SEM_GRUPO = '#64748b';

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
/** Mistura a cor com branco: `t` = 0 é a cor pura, 1 é branco. */
const clarear = (h: string, t: number) => {
  const [r, g, b] = hex(h);
  return rgb(r + (1 - r) * t, g + (1 - g) * t, b + (1 - b) * t);
};

/**
 * Lista de emergência (telefone, endereço e contato de emergência). Cada grupo de campo começa numa
 * página própria, com sua cor, e nunca divide a página com outro grupo.
 */
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
  const grupos = [
    ...db.grupos.map((g, i) => ({ id: g.id as string | null, nome: g.nome, cor: CORES_GRUPO[i % CORES_GRUPO.length] })),
    { id: null, nome: 'Sem grupo', cor: COR_SEM_GRUPO },
  ]
    .map((g) => ({ ...g, membros: membros.filter((p) => (p.grupoId ?? null) === g.id).sort(porNome) }))
    .filter((g) => g.membros.length > 0);

  let pagina: PDFPage;
  let y = 0;
  let nPagina = 0;

  /** Nova página de um grupo: título geral, faixa colorida com o grupo e o cabeçalho das colunas. */
  const novaPagina = (g: (typeof grupos)[number], titulo: string, continuacao: boolean) => {
    pagina = doc.addPage(A4_PAISAGEM);
    nPagina++;
    const topo = H - MARGEM;
    const corG = rgb(...hex(g.cor));
    pagina.drawText(`Lista de Emergência${db.congregacao.nome ? ' — ' + limpar(db.congregacao.nome) : ''}`, { x: MARGEM, y: topo - 12, size: 14, font: negrito, color: cor.texto });
    const resumo = `${data} · página ${nPagina}`;
    pagina.drawText(resumo, { x: W - MARGEM - normal.widthOfTextAtSize(resumo, 8), y: topo - 10, size: 8, font: normal, color: cor.suave });
    pagina.drawLine({ start: { x: MARGEM, y: topo - 20 }, end: { x: W - MARGEM, y: topo - 20 }, thickness: 1.2, color: corG });
    y = topo - 30;

    const h = 24;
    pagina.drawRectangle({ x: MARGEM, y: y - h, width: util, height: h, color: corG });
    pagina.drawText(limpar(continuacao ? `${g.nome} (continuação)` : g.nome), { x: MARGEM + 10, y: y - 16, size: 13, font: negrito, color: rgb(1, 1, 1) });
    const lado = limpar(titulo);
    if (lado) pagina.drawText(lado, { x: W - MARGEM - 10 - normal.widthOfTextAtSize(lado, 9), y: y - 15.5, size: 9, font: normal, color: rgb(1, 1, 1) });
    y -= h;

    const hc = 14;
    pagina.drawRectangle({ x: MARGEM, y: y - hc, width: util, height: hc, color: clarear(g.cor, 0.85) });
    COLUNAS.forEach((c, i) => pagina.drawText(c.titulo.toUpperCase(), { x: xs[i] + PAD + 4, y: y - 9.5, size: 6.5, font: negrito, color: cor.texto }));
    y -= hc;
  };

  for (const g of grupos) {
    const grupo = db.grupos.find((x) => x.id === g.id);
    const nomeDe = (id: string | null | undefined) => db.publicadores.find((p) => p.id === id)?.nome;
    const funcoes = [grupo && nomeDe(grupo.superintendenteId), grupo && nomeDe(grupo.ajudanteId)].filter(Boolean).join(' e ');
    const titulo = `${funcoes ? `${funcoes} · ` : ''}${g.membros.length} ${g.membros.length === 1 ? 'publicador' : 'publicadores'}`;
    novaPagina(g, titulo, false);
    g.membros.forEach((p, i) => {
      const e = dadosEmergencia(p);
      const celulas = [p.nome, p.telefone, p.endereco, e.contato, e.endereco].map((t, c) => quebrar(limpar(t), c === 0 ? negrito : normal, largs[c] - PAD * 2 - 4));
      const h = Math.max(...celulas.map((l) => l.length)) * ENTRELINHA + PAD + 2;
      if (y - h < MARGEM) novaPagina(g, titulo, true);
      if (i % 2 === 1) pagina.drawRectangle({ x: MARGEM, y: y - h, width: util, height: h, color: clarear(g.cor, 0.94) });
      pagina.drawRectangle({ x: MARGEM, y: y - h, width: 2.5, height: h, color: rgb(...hex(g.cor)) });
      pagina.drawLine({ start: { x: MARGEM, y: y - h }, end: { x: W - MARGEM, y: y - h }, thickness: 0.3, color: clarear(g.cor, 0.75) });
      celulas.forEach((linhas, c) =>
        linhas.forEach((l, j) =>
          pagina.drawText(l, { x: xs[c] + PAD + 4, y: y - PAD - 6 - j * ENTRELINHA, size: TAM, font: c === 0 ? negrito : normal, color: cor.texto }),
        ),
      );
      y -= h;
    });
  }
  return doc.save();
}
