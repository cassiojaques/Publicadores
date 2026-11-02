/**
 * Imagem PNG simples com quem falta relatar, separado por grupo — para mandar no WhatsApp.
 * Desenhada direto no canvas: cada grupo vira um quadro, distribuído em colunas.
 */

const CORES = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#e11d48', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#ec4899', '#0891b2', '#a16207'];
const COR_SEM_GRUPO = '#64748b';
const FONTE = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

const MARGEM = 40;
const ESPACO = 20;
const LARGURA_COLUNA = 320;
const ALTURA_CABECALHO_GRUPO = 44;
const ALTURA_NOME = 30;
const PADDING_GRUPO = 14;

export interface GrupoFaltantes {
  grupo: string;
  nomes: string[];
}

function encurtar(ctx: CanvasRenderingContext2D, texto: string, largura: number) {
  if (ctx.measureText(texto).width <= largura) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function retanguloArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function gerarImagemFaltantes(
  grupos: GrupoFaltantes[],
  opcoes: { titulo: string; subtitulo: string; corDoGrupo?: (nome: string) => string | undefined },
): Promise<Uint8Array> {
  const total = grupos.reduce((s, g) => s + g.nomes.length, 0);
  const colunas = grupos.length <= 1 ? 1 : grupos.length <= 4 ? 2 : 3;
  const alturaGrupo = (g: GrupoFaltantes) => ALTURA_CABECALHO_GRUPO + PADDING_GRUPO + g.nomes.length * ALTURA_NOME + PADDING_GRUPO / 2;

  // Cada grupo vai para a coluna mais baixa, na ordem.
  const topoConteudo = MARGEM + 96;
  const alturas = Array<number>(colunas).fill(0);
  const posicoes = grupos.map((g) => {
    const c = alturas.indexOf(Math.min(...alturas));
    const pos = { x: MARGEM + c * (LARGURA_COLUNA + ESPACO), y: topoConteudo + alturas[c] };
    alturas[c] += alturaGrupo(g) + ESPACO;
    return pos;
  });

  const largura = MARGEM * 2 + colunas * LARGURA_COLUNA + (colunas - 1) * ESPACO;
  const altura = topoConteudo + Math.max(0, ...alturas) - ESPACO + MARGEM;
  const escala = 2;

  const canvas = document.createElement('canvas');
  canvas.width = largura * escala;
  canvas.height = altura * escala;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(escala, escala);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, largura, altura);

  // Título
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 26px ${FONTE}`;
  ctx.fillText(encurtar(ctx, opcoes.titulo, largura - MARGEM * 2 - 120), MARGEM, MARGEM + 16);
  ctx.fillStyle = '#64748b';
  ctx.font = `400 15px ${FONTE}`;
  ctx.fillText(encurtar(ctx, opcoes.subtitulo, largura - MARGEM * 2), MARGEM, MARGEM + 50);

  // Total no canto
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e11d48';
  ctx.font = `700 30px ${FONTE}`;
  ctx.fillText(String(total), largura - MARGEM, MARGEM + 14);
  ctx.fillStyle = '#64748b';
  ctx.font = `400 13px ${FONTE}`;
  ctx.fillText(total === 1 ? 'falta' : 'faltam', largura - MARGEM, MARGEM + 42);
  ctx.textAlign = 'left';

  grupos.forEach((g, i) => {
    const { x, y } = posicoes[i];
    const h = alturaGrupo(g);
    const cor = opcoes.corDoGrupo?.(g.grupo) ?? (g.grupo === 'Sem grupo' ? COR_SEM_GRUPO : CORES[i % CORES.length]);

    // Quadro
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,.08)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    retanguloArredondado(ctx, x, y, LARGURA_COLUNA, h, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    retanguloArredondado(ctx, x, y, LARGURA_COLUNA, h, 12);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Cabeçalho colorido
    ctx.save();
    retanguloArredondado(ctx, x, y, LARGURA_COLUNA, h, 12);
    ctx.clip();
    ctx.fillStyle = cor;
    ctx.fillRect(x, y, LARGURA_COLUNA, ALTURA_CABECALHO_GRUPO);
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 16px ${FONTE}`;
    ctx.fillText(encurtar(ctx, g.grupo, LARGURA_COLUNA - 70), x + 16, y + ALTURA_CABECALHO_GRUPO / 2);
    ctx.textAlign = 'right';
    ctx.font = `600 14px ${FONTE}`;
    ctx.fillText(String(g.nomes.length), x + LARGURA_COLUNA - 16, y + ALTURA_CABECALHO_GRUPO / 2);
    ctx.textAlign = 'left';

    // Nomes
    ctx.font = `400 15px ${FONTE}`;
    g.nomes.forEach((nome, j) => {
      const ny = y + ALTURA_CABECALHO_GRUPO + PADDING_GRUPO / 2 + j * ALTURA_NOME + ALTURA_NOME / 2;
      if (j > 0) {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(x + 16, ny - ALTURA_NOME / 2, LARGURA_COLUNA - 32, 1);
      }
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(x + 22, ny, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.fillText(encurtar(ctx, nome, LARGURA_COLUNA - 56), x + 36, ny);
    });
  });

  const blob = await new Promise<Blob>((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao gerar a imagem.'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
