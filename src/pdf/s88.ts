import { PDFDocument, StandardFonts } from 'pdf-lib';
import modeloUrl from '../assets/S-88_T.pdf?url';
import { formatarMedia, mediaAno, mediaMes } from '../domain/assistencia';
import { mesesDoAnoServico } from '../domain/serviceYear';
import type { Db, TipoReuniao } from '../domain/types';

/**
 * Campos do S-88-T: quatro quadros numerados. Meio de semana = 1 (ano da esquerda) e 2 (ano da direita);
 * fim de semana = 3 e 4. Cada quadro tem 12 linhas (setembro..agosto) e a média do ano.
 */
const QUADRO: Record<TipoReuniao, [number, number]> = { meio: [1, 2], fim: [3, 4] };

let modeloCache: Uint8Array | null = null;
async function carregarModelo(): Promise<Uint8Array> {
  if (!modeloCache) {
    const r = await fetch(modeloUrl);
    if (!r.ok) throw new Error('Modelo S-88_T.pdf não encontrado.');
    modeloCache = new Uint8Array(await r.arrayBuffer());
  }
  return modeloCache;
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/** Preenche o S-88: o ano anterior à esquerda e `anoServico` à direita, para os dois tipos de reunião. */
export async function gerarS88(db: Db, anoServico: number, modelo?: Uint8Array): Promise<PDFDocument> {
  const doc = await PDFDocument.load(modelo ?? (await carregarModelo()));
  const form = doc.getForm();
  const texto = (nome: string, valor: string) => form.getTextField(nome).setText(valor);

  for (const tipo of ['meio', 'fim'] as TipoReuniao[]) {
    QUADRO[tipo].forEach((q, lado) => {
      const ano = anoServico - 1 + lado;
      texto(`Service Year_${q}`, String(ano));
      mesesDoAnoServico(ano).forEach((mes, i) => {
        const a = db.assistencia[mes]?.[tipo];
        const n = i + 1;
        texto(`${q}-Meeting_${n}`, num(a?.reunioes));
        texto(`${q}-Attendance_${n}`, num(a?.total));
        texto(`${q}-Average_${n}`, formatarMedia(mediaMes(a), '.'));
      });
      texto(`${q}-Average_Total`, formatarMedia(mediaAno(db, ano, tipo), '.'));
    });
  }

  form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  doc.setTitle(`S-88 — ${anoServico - 1} e ${anoServico}`);
  return doc;
}

export async function gerarS88Bytes(db: Db, anoServico: number): Promise<Uint8Array> {
  return (await gerarS88(db, anoServico)).save();
}

/**
 * Lê os números de um S-88 já preenchido (o modelo traz os campos) e devolve o que encontrou,
 * por mês: serve para trazer o histórico de um formulário existente.
 */
export async function lerS88(bytes: ArrayBuffer | Uint8Array): Promise<Db['assistencia']> {
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  const campo = (nome: string) => {
    try {
      return form.getTextField(nome).getText()?.trim() ?? '';
    } catch {
      return '';
    }
  };
  const lerNum = (s: string) => {
    const n = Number(s.replace(',', '.'));
    return s && Number.isFinite(n) ? n : null;
  };
  const saida: Db['assistencia'] = {};
  for (const tipo of ['meio', 'fim'] as TipoReuniao[]) {
    for (const q of QUADRO[tipo]) {
      const ano = Number(campo(`Service Year_${q}`));
      if (!ano) continue;
      mesesDoAnoServico(ano).forEach((mes, i) => {
        const reunioes = lerNum(campo(`${q}-Meeting_${i + 1}`));
        const total = lerNum(campo(`${q}-Attendance_${i + 1}`));
        if (reunioes === null && total === null) return;
        (saida[mes] ??= {})[tipo] = { reunioes, total };
      });
    }
  }
  return saida;
}
