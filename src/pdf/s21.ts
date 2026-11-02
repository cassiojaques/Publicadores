import { PDFArray, PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import modeloUrl from '../assets/S-21_T.pdf?url';
import { creditosAprovados, mesesDoAnoServico, totaisAnoServico, totalComCreditos, formatarData } from '../domain/serviceYear';
import type { Privilegio, Publicador } from '../domain/types';

/**
 * Campos do formulário S-21-T 11/23. O PDF oficial traz os widgets nas anotações da página,
 * mas com /AcroForm /Fields vazio — por isso registramos os campos antes de usar a API de formulário.
 * Linhas 20..31 = setembro..agosto; 32 = total.
 */
const CAMPO = {
  nome: '900_1_Text_SanSerif',
  nascimento: '900_2_Text_SanSerif',
  masculino: '900_3_CheckBox',
  feminino: '900_4_CheckBox',
  batismo: '900_5_Text_SanSerif',
  outrasOvelhas: '900_6_CheckBox',
  ungido: '900_7_CheckBox',
  anoServico: '900_13_Text_C_SanSerif',
  participou: (l: number) => `901_${l}_CheckBox`,
  estudos: (l: number) => `902_${l}_Text_C_SanSerif`,
  auxiliar: (l: number) => `903_${l}_CheckBox`,
  horas: (l: number) => `904_${l}_S21_Value`,
  obs: (l: number) => `905_${l}_Text_SanSerif`,
};

const CAMPO_PRIVILEGIO: Record<Privilegio, string> = {
  anciao: '900_8_CheckBox',
  servo_ministerial: '900_9_CheckBox',
  pioneiro_regular: '900_10_CheckBox',
  pioneiro_especial: '900_11_CheckBox',
  missionario: '900_12_CheckBox',
};

const LINHA_TOTAL = 32;

let modeloCache: Uint8Array | null = null;
export async function carregarModelo(): Promise<Uint8Array> {
  if (!modeloCache) {
    const r = await fetch(modeloUrl);
    if (!r.ok) throw new Error('Modelo S-21_T.pdf não encontrado.');
    modeloCache = new Uint8Array(await r.arrayBuffer());
  }
  return modeloCache;
}

function registrarCampos(doc: PDFDocument) {
  const acro = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
  const fields = acro.lookup(PDFName.of('Fields'), PDFArray);
  if (fields.size() > 0) return;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const a = doc.context.lookup(ref, PDFDict);
      if (a.get(PDFName.of('T'))) fields.push(ref);
    }
  }
}

function num(n: number | null | undefined) {
  return n === null || n === undefined || n === 0 ? '' : String(n);
}

/** Preenche o S-21 de um publicador para um ano de serviço. */
export async function gerarS21(
  modelo: Uint8Array,
  p: Publicador,
  anoServico: number,
  opcoes: { achatar?: boolean } = {},
): Promise<PDFDocument> {
  const doc = await PDFDocument.load(modelo);
  registrarCampos(doc);
  const form = doc.getForm();
  const texto = (nome: string, valor: string) => form.getTextField(nome).setText(valor);
  const marcar = (nome: string, v: boolean) => (v ? form.getCheckBox(nome).check() : form.getCheckBox(nome).uncheck());

  texto(CAMPO.nome, p.nome);
  texto(CAMPO.nascimento, formatarData(p.nascimento));
  texto(CAMPO.batismo, formatarData(p.batismo));
  marcar(CAMPO.masculino, p.sexo === 'M');
  marcar(CAMPO.feminino, p.sexo === 'F');
  marcar(CAMPO.outrasOvelhas, p.esperanca === 'outras_ovelhas');
  marcar(CAMPO.ungido, p.esperanca === 'ungido');
  for (const [priv, campo] of Object.entries(CAMPO_PRIVILEGIO)) marcar(campo, p.privilegios.includes(priv as Privilegio));
  texto(CAMPO.anoServico, String(anoServico));

  // O modelo oficial não tem colunas de crédito: para pioneiro regular vão nas observações.
  const pioneiro = p.privilegios.includes('pioneiro_regular');
  const credito = (creditos: number, aprovados: number, total: number) =>
    pioneiro && creditos ? `Créd. ${creditos} · aprov. ${aprovados} · total ${total}` : '';
  const juntar = (...partes: string[]) => partes.filter(Boolean).join(' — ');

  mesesDoAnoServico(anoServico).forEach((mes, i) => {
    const l = 20 + i;
    const r = p.relatorios[mes];
    marcar(CAMPO.participou(l), !!r?.participou);
    texto(CAMPO.estudos(l), num(r?.estudos));
    marcar(CAMPO.auxiliar(l), !!r?.auxiliar);
    texto(CAMPO.horas(l), num(r?.horas));
    texto(CAMPO.obs(l), juntar(credito(r?.creditos ?? 0, creditosAprovados(r), totalComCreditos(r)), r?.obs ?? ''));
  });
  const tot = totaisAnoServico(p, anoServico);
  texto(CAMPO.horas(LINHA_TOTAL), num(tot.horas));
  texto(CAMPO.obs(LINHA_TOTAL), credito(tot.creditos, tot.aprovados, tot.totalComCreditos));

  form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  if (opcoes.achatar) form.flatten();
  doc.setTitle(`S-21 — ${p.nome} — ${anoServico}`);
  return doc;
}

export async function gerarS21Bytes(p: Publicador, anoServico: number) {
  return (await gerarS21(await carregarModelo(), p, anoServico)).save();
}

/**
 * Cartão S-21 com os totais da congregação num ano de serviço (Publicadores, Pioneiros auxiliares
 * ou Pioneiros regulares…): estudos e horas somados por mês e o número de relatórios nas observações.
 * `porMes` segue a ordem setembro..agosto; null = mês sem relatório.
 */
export async function gerarS21Totais(
  modelo: Uint8Array,
  nome: string,
  anoServico: number,
  porMes: ({ relatorios: number; estudos: number; horas: number } | null)[],
): Promise<PDFDocument> {
  const doc = await PDFDocument.load(modelo);
  registrarCampos(doc);
  const form = doc.getForm();
  const texto = (campo: string, valor: string) => form.getTextField(campo).setText(valor);
  texto(CAMPO.nome, nome);
  texto(CAMPO.anoServico, String(anoServico));
  let horas = 0;
  porMes.forEach((t, i) => {
    if (!t) return;
    const l = 20 + i;
    texto(CAMPO.estudos(l), String(t.estudos));
    texto(CAMPO.horas(l), num(t.horas));
    texto(CAMPO.obs(l), `Número de relatórios: ${t.relatorios}`);
    horas += t.horas;
  });
  texto(CAMPO.horas(LINHA_TOTAL), num(horas));
  form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  doc.setTitle(`S-21 — ${nome} — ${anoServico}`);
  return doc;
}
