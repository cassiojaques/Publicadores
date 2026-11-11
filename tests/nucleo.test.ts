import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { cifrar, decifrar, derivarChave, SenhaIncorretaError } from '../src/crypto/crypto';
import { anoServicoDe, anosCompletos, textoAnos, creditosAprovados, interpretarData, mesesDoAnoServico, rotuloAnoServico, situacao, totaisAnoServico, totalComCreditos, ultimoMesFechado } from '../src/domain/serviceYear';
import { menorDeIdadeNaEscola, proximaEscola } from '../src/domain/escolaPioneiros';
import { dbVazio, novoPublicador } from '../src/domain/types';
import { aplicar, analisarJson, comMes, lerColadoRelatorio, mesSugerido, normalizarMes, prever, relataHoras, semAlteracao } from '../src/import/relatorioCampo';
import { definirAuxiliar, definirRelatorio, excluirMes, garantirMes, excluirRelatorio, mesesComDados, moverPublicador } from '../src/store/store';
import { statusDoMes, textoFaltantes, totaisDoMes } from '../src/domain/relatorios';
import { gerarS21 } from '../src/pdf/s21';
import { unzipSync } from 'fflate';
import { gerarPdfGrupos } from '../src/pdf/grupos';
import { consultaEndereco, localAtual, precisaLocalizar } from '../src/geo/geocodificar';
import { lerLinhas, preverPlanilha, aplicarPlanilha, interpretarGrupo } from '../src/import/planilhaPublicadores';

describe('criptografia', () => {
  it('cifra e decifra com o PIN certo', async () => {
    const chave = await derivarChave('1234', undefined, 1000);
    const arq = await cifrar(chave, '{"ok":true}');
    // Texto que não pode aparecer por acaso no base64 (que não tem aspas nem chaves).
    expect(arq).not.toContain('{"ok"');
    const { texto } = await decifrar(arq, '1234');
    expect(texto).toBe('{"ok":true}');
  });
  it('rejeita PIN errado', async () => {
    const arq = await cifrar(await derivarChave('1234', undefined, 1000), 'x');
    await expect(decifrar(arq, '4321')).rejects.toBeInstanceOf(SenhaIncorretaError);
  });
});

describe('ano de serviço', () => {
  it('setembro inicia o ano seguinte', () => {
    expect(anoServicoDe('2025-09')).toBe(2026);
    expect(anoServicoDe('2026-08')).toBe(2026);
    expect(mesesDoAnoServico(2026)[0]).toBe('2025-09');
    expect(mesesDoAnoServico(2026)[11]).toBe('2026-08');
  });
  it('aproveita créditos só até 55 h somando com as horas', () => {
    expect(creditosAprovados({ horas: 60, creditos: 10 })).toBe(0);
    expect(totalComCreditos({ horas: 60, creditos: 10 })).toBe(60);
    expect(creditosAprovados({ horas: 40, creditos: 25 })).toBe(15);
    expect(totalComCreditos({ horas: 40, creditos: 25 })).toBe(55);
    expect(creditosAprovados({ horas: 30, creditos: 10 })).toBe(10);
    expect(creditosAprovados({ horas: null, creditos: 70 })).toBe(55);
    expect(creditosAprovados({ horas: 50 })).toBe(0);
    const p = novoPublicador({ nome: 'PR', privilegios: ['pioneiro_regular'] });
    p.relatorios['2025-09'] = { participou: true, estudos: null, auxiliar: false, horas: 60, creditos: 10, obs: '' };
    p.relatorios['2025-10'] = { participou: true, estudos: null, auxiliar: false, horas: 40, creditos: 25, obs: '' };
    expect(totaisAnoServico(p, 2026)).toMatchObject({ horas: 100, creditos: 35, aprovados: 15, totalComCreditos: 115 });
  });
  it('soma totais e calcula situação', () => {
    const p = novoPublicador({ nome: 'A' });
    p.relatorios['2025-09'] = { participou: true, estudos: 1, auxiliar: false, horas: 50, obs: '' };
    p.relatorios['2025-10'] = { participou: true, estudos: 2, auxiliar: false, horas: 40, obs: '' };
    expect(totaisAnoServico(p, 2026)).toEqual({ horas: 90, mesesParticipou: 2, estudos: 3, creditos: 0, aprovados: 0, totalComCreditos: 90 });
    const meses = new Set(['2025-09', '2025-10', '2025-11']);
    expect(situacao(p, meses, '2025-11')).toBe('ativo');
    expect(situacao(novoPublicador({ nome: 'B' }), meses, '2025-11')).toBe('ativo'); // sem 6 meses de dados
    expect(situacao(p, new Set(['2025-09', '2025-10']), '2025-10')).toBe('ativo');
  });
});

describe('importação', () => {
  it('normaliza formatos de mês', () => {
    expect(normalizarMes('2026-09')).toBe('2026-09');
    expect(normalizarMes('9/2026')).toBe('2026-09');
    expect(normalizarMes('01/09/2026')).toBe('2026-09');
    expect(normalizarMes(9, 2026)).toBe('2026-09');
  });
  it('casa por nome sem acento e aplica', () => {
    const db = dbVazio();
    db.publicadores.push(novoPublicador({ nome: 'João da Silva' }));
    const linhas = analisarJson(JSON.stringify({ mes: '2026-09', relatorios: [
      { nome: 'joao  da silva', estudos: 2, horas: 0 },
      { nome: 'Fulano Novo', participou: 'sim' },
    ] }));
    const prev = prever(db, linhas);
    expect(prev.itens[0].publicador?.nome).toBe('João da Silva');
    expect(prev.itens[1].publicador).toBeNull();
    expect(aplicar(db, prev, 'x.json', true)).toBe(2);
    expect(db.publicadores[0].relatorios['2026-09'].participou).toBe(true);
    expect(db.publicadores).toHaveLength(2);
    expect(db.importacoes[0].mes).toBe('2026-09');
  });
  it('reimportar o mesmo mês mantém as importações anteriores no histórico', () => {
    const db = dbVazio();
    db.publicadores.push(novoPublicador({ nome: 'Ana' }));
    garantirMes(db, '2026-09', '(manual)');
    const linhas = analisarJson(JSON.stringify({ mes: '2026-09', relatorios: [{ nome: 'Ana', participou: 'sim' }] }));
    aplicar(db, prever(db, linhas), 'a.json', false);
    const mudou = analisarJson(JSON.stringify({ mes: '2026-09', relatorios: [{ nome: 'Ana', participou: 'sim', estudos: 1 }] }));
    aplicar(db, prever(db, mudou), 'b.json', false);
    expect(db.importacoes.map((i) => i.arquivo)).toEqual(['a.json', 'b.json']);
  });
  it('linhas iguais ao que já está gravado não contam como alteração', () => {
    const db = dbVazio();
    db.publicadores.push(novoPublicador({ nome: 'Ana' }), novoPublicador({ nome: 'Bia' }));
    const json = (estudosBia: number) =>
      analisarJson(JSON.stringify({ mes: '2026-09', relatorios: [{ nome: 'Ana', participou: 'sim', estudos: 2, observacoes: 'ok' }, { nome: 'Bia', participou: 'sim', estudos: estudosBia }] }));
    expect(aplicar(db, prever(db, json(1)), 'a.json', false)).toBe(2);

    const igual = prever(db, json(1));
    expect(igual.itens.every((i) => semAlteracao(i.publicador, i.linha))).toBe(true);
    expect(aplicar(db, igual, 'b.json', false)).toBe(0);
    expect(db.importacoes.map((i) => i.arquivo)).toEqual(['a.json']); // nada mudou: não entra no histórico

    const outra = prever(db, json(3));
    expect(outra.itens.map((i) => semAlteracao(i.publicador, i.linha))).toEqual([true, false]);
    expect(aplicar(db, outra, 'c.json', false)).toBe(1);
    expect(db.publicadores[1].relatorios['2026-09'].estudos).toBe(3);
  });
});

describe('grupos', () => {
  it('mover tira as funções do grupo anterior', () => {
    const db = dbVazio();
    const p = novoPublicador({ nome: 'A', grupoId: 'g1' });
    db.publicadores.push(p);
    db.grupos.push({ id: 'g1', nome: 'G1', superintendenteId: p.id, ajudanteId: null }, { id: 'g2', nome: 'G2', superintendenteId: null, ajudanteId: null });
    moverPublicador(db, p.id, 'g2');
    expect(db.grupos[0].superintendenteId).toBeNull();
    expect(p.grupoId).toBe('g2');
  });
});

describe('PDFs', () => {
  const modelo = new Uint8Array(readFileSync('src/assets/S-21_T.pdf'));
  it('preenche o S-21', async () => {
    const p = novoPublicador({ nome: 'Maria Conceição', sexo: 'F', nascimento: '1990-05-01', privilegios: ['pioneiro_regular'] });
    p.relatorios['2025-09'] = { participou: true, estudos: 3, auxiliar: false, horas: 52, obs: 'ok' };
    const doc = await gerarS21(modelo, p, 2026);
    const form = doc.getForm();
    expect(form.getTextField('900_1_Text_SanSerif').getText()).toBe('Maria Conceição');
    expect(form.getTextField('900_2_Text_SanSerif').getText()).toBe('01/05/1990');
    expect(form.getCheckBox('900_4_CheckBox').isChecked()).toBe(true);
    expect(form.getCheckBox('900_10_CheckBox').isChecked()).toBe(true);
    expect(form.getCheckBox('901_20_CheckBox').isChecked()).toBe(true);
    expect(form.getTextField('904_20_S21_Value').getText()).toBe('52');
    expect(form.getTextField('904_32_S21_Value').getText()).toBe('52');
    const bytes = await doc.save();
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
  it('gera PDF dos grupos', async () => {
    const db = dbVazio('Central');
    db.grupos.push({ id: 'g1', nome: 'Grupo 1', superintendenteId: null, ajudanteId: null });
    for (let i = 0; i < 120; i++) db.publicadores.push(novoPublicador({ nome: `Publicador ${i}`, grupoId: 'g1' }));
    const bytes = await gerarPdfGrupos(db);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
  it('PDF dos grupos sempre numa página e respeita o filtro de situação', async () => {
    const db = dbVazio('Central');
    for (let g = 1; g <= 9; g++) {
      db.grupos.push({ id: `g${g}`, nome: `Grupo ${g}`, superintendenteId: null, ajudanteId: null });
      for (let i = 0; i < 25; i++) db.publicadores.push(novoPublicador({ nome: `Pub ${g}-${i}`, grupoId: `g${g}`, inativo: i === 0 }));
    }
    for (const [sit, siglas] of [['todos', true], ['ativo', false], ['inativo', true]] as const) {
      const pdf = await PDFDocument.load(await gerarPdfGrupos(db, { situacao: sit, siglas }));
      expect(pdf.getPageCount()).toBe(1);
    }
  });
});


describe('planilha de publicadores', () => {
  const linhas = lerLinhas([
    { Nome: 'Luiz Silva', Grupo: 'G-2 (Luiz)', Sex: 'Masc.', Classe: 'O. Ovelhas', Batismo: 'Ancião ', Categoria: 'Publicador' },
    { Nome: 'Luiz Souza', Grupo: 'G-2 (Luiz)', Sex: 'Masc.', Classe: 'O. Ovelhas', Batismo: 'Ir. Batizado', Categoria: 'Irregular' },
    { Nome: 'Ana Reis', Grupo: 'G-1 (Pedro)', Sex: 'Fem.', Classe: 'O. Ovelhas', Batismo: 'Não Batizado', Categoria: 'P. Auxiliar Permanente' },
    { Nome: 'Bia Lima', Grupo: 'G-1 (Pedro)', Sex: 'Fem.', Classe: 'O. Ovelhas', Batismo: 'Ir. Batizado', Categoria: 'P. Regular' },
  ]);
  it('interpreta colunas', () => {
    expect(interpretarGrupo('G-2 (Luiz)')).toEqual({ nome: 'Grupo 2', dica: 'Luiz' });
    expect(linhas[0].privilegios).toEqual(['anciao']);
    expect(linhas[1].privilegios).toEqual([]);
    expect(linhas[2]).toMatchObject({ sexo: 'F', batizado: false, auxiliar: 'permanente' });
    expect(linhas[3].privilegios).toEqual(['pioneiro_regular']);
  });
  it('lê as colunas Batizado, Situação e Privilégio', () => {
    const [a, b, c, d] = lerLinhas([
      { Nome: 'Rui', Grupo: 'G-1', Sexo: 'M', Batizado: 'Sim', 'Situação': 'Pioneiro Regular', 'Privilégio': 'Servo Ministerial' },
      { Nome: 'Eva', Grupo: 'G-1', Sexo: 'F', Batizado: 'Não', 'Situação': 'Pioneiro Auxiliar', 'Privilégio': '' },
      { Nome: 'Lia', Grupo: 'G-1', Sexo: 'F', Batizado: 'Sim', 'Situação': 'Pioneiro Auxiliar Permanente', 'Privilégio': '' },
      { Nome: 'Teo', Grupo: 'G-1', Sexo: 'M', Batizado: 'Sim', 'Situação': 'Inativo', 'Privilégio': 'Ancião' },
    ]);
    expect(a).toMatchObject({ batizado: true, privilegios: ['servo_ministerial', 'pioneiro_regular'], auxiliar: 'nao', inativo: false });
    expect(b).toMatchObject({ sexo: 'F', batizado: false, auxiliar: 'mes' });
    expect(c).toMatchObject({ auxiliar: 'permanente' });
    expect(d).toMatchObject({ inativo: true, privilegios: ['anciao'] });
    const db = dbVazio();
    aplicarPlanilha(db, preverPlanilha(db, [a, b, c, d]), false, '2026-11');
    const [rui, eva, lia, teo] = db.publicadores;
    expect(eva.auxiliarMeses).toEqual(['2026-11']);
    expect(lia.auxiliarPermanente).toBe(true);
    expect(teo.inativo).toBe(true);
    expect(rui.auxiliarMeses).toEqual([]);
  });
  it('designação de auxiliar vale no relatório do mês', () => {
    const db = dbVazio();
    const lia = novoPublicador({ nome: 'Lia', auxiliarPermanente: true });
    const eva = novoPublicador({ nome: 'Eva' });
    db.publicadores.push(lia, eva);
    definirAuxiliar(db, eva.id, '2026-11', true);
    expect(eva.relatorios['2026-11']).toBeUndefined(); // só designa, não conta como entregue
    expect(eva.auxiliarMeses).toEqual(['2026-11']);
    definirRelatorio(db, lia.id, '2026-10', 'horas', 30);
    expect(lia.relatorios['2026-10'].auxiliar).toBe(true);
    const previa = prever(db, [{ mes: '2026-11', nome: 'Eva', relatorio: { participou: true, estudos: null, auxiliar: false, horas: 30, obs: '' } }]);
    expect(previa.itens[0].linha.relatorio.auxiliar).toBe(true);
  });
  it('cria grupos e escolhe o superintendente pelo nome', () => {
    const db = dbVazio();
    expect(aplicarPlanilha(db, preverPlanilha(db, linhas), false, '2026-11').criados).toBe(4);
    expect(db.grupos.map((g) => g.nome)).toEqual(['Grupo 1', 'Grupo 2']);
    const g2 = db.grupos[1];
    expect(db.publicadores.find((p) => p.id === g2.superintendenteId)?.nome).toBe('Luiz Silva');
    expect(db.grupos[0].superintendenteId).toBeNull();
    // Reimportar não duplica.
    expect(preverPlanilha(db, linhas).novos).toHaveLength(0);
  });
});

describe('datas coladas', () => {
  it('aceita formatos comuns', () => {
    expect(interpretarData('15/03/1990')).toBe('1990-03-15');
    expect(interpretarData(' 5-3-1990 ')).toBe('1990-03-05');
    expect(interpretarData('15.03.1990')).toBe('1990-03-15');
    expect(interpretarData('1990-03-15')).toBe('1990-03-15');
    expect(interpretarData('15031990')).toBe('1990-03-15');
    expect(interpretarData('15/03/90')).toBe('1990-03-15');
    expect(interpretarData('15 de março de 1990')).toBe('1990-03-15');
    expect(interpretarData('15 mar 1990')).toBe('1990-03-15');
  });
  it('rejeita datas inválidas', () => {
    expect(interpretarData('31/02/2020')).toBeNull();
    expect(interpretarData('abc')).toBeNull();
    expect(interpretarData('')).toBeNull();
  });
});

describe('anos desde uma data', () => {
  const hoje = new Date(2026, 10, 11); // 11/11/2026
  it('conta só anos completos', () => {
    expect(anosCompletos('1990-11-11', hoje)).toBe(36);
    expect(anosCompletos('1990-11-12', hoje)).toBe(35);
    expect(anosCompletos('1990-12-01', hoje)).toBe(35);
  });
  it('texto em português', () => {
    expect(textoAnos('2010-01-01', hoje)).toBe('16 anos');
    expect(textoAnos('2025-11-11', hoje)).toBe('1 ano');
    expect(textoAnos('2026-03-01', hoje)).toBe('menos de 1 ano');
  });
  it('vazio ou futuro não mostram nada', () => {
    expect(textoAnos('', hoje)).toBe('');
    expect(textoAnos('2027-01-01', hoje)).toBe('');
  });
});

describe('escola de pioneiros', () => {
  const base = { escolaPioneiros: null, escolaNaoConcluida: false, inicioPioneiro: '' };
  it('sem dados não há próximo ano', () => {
    expect(proximaEscola(base)).toBeNull();
  });
  it('primeira vez: até 1.º de setembro faz no ano seguinte; depois, daqui a dois anos', () => {
    expect(proximaEscola({ ...base, inicioPioneiro: '2026-09-01' })).toEqual({ ano: 2027, motivo: 'primeira' });
    expect(proximaEscola({ ...base, inicioPioneiro: '2026-03-10' })).toEqual({ ano: 2027, motivo: 'primeira' });
    expect(proximaEscola({ ...base, inicioPioneiro: '2026-09-02' })).toEqual({ ano: 2028, motivo: 'primeira' });
    expect(proximaEscola({ ...base, inicioPioneiro: '2026-12-15' })).toEqual({ ano: 2028, motivo: 'primeira' });
  });
  it('quem já fez espera 5 anos', () => {
    expect(proximaEscola({ ...base, inicioPioneiro: '2015-01-01', escolaPioneiros: 2027 })).toEqual({ ano: 2032, motivo: 'repeticao' });
  });
  it('quem não conseguiu cursar é convidado no ano seguinte', () => {
    expect(proximaEscola({ ...base, escolaPioneiros: 2026, escolaNaoConcluida: true })).toEqual({ ano: 2027, motivo: 'reconvite' });
  });
  it('menor de 18 no ano da escola', () => {
    expect(menorDeIdadeNaEscola('2010-05-01', 2027)).toBe(true);
    expect(menorDeIdadeNaEscola('2009-05-01', 2027)).toBe(false);
    expect(menorDeIdadeNaEscola('', 2027)).toBe(false);
  });
});

describe('ano de serviço e inativos', () => {
  it('rótulo do ano de serviço', () => {
    expect(rotuloAnoServico(2026)).toBe('Ano de Serviço 2026 (Setembro 2025 – Agosto 2026)');
  });
  it('inativo manual, automático após 6 meses e reativação na importação', () => {
    const meses = new Set(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
    const p = novoPublicador({ nome: 'Fulano' });
    expect(situacao(p, meses, '2026-08')).toBe('inativo'); // 6 meses sem relatar
    p.relatorios['2026-08'] = { participou: true, estudos: null, auxiliar: false, horas: null, obs: '' };
    expect(situacao(p, meses, '2026-08')).toBe('ativo');
    p.inativo = true;
    expect(situacao(p, meses, '2026-08')).toBe('inativo'); // marcado manualmente

    const db = dbVazio();
    db.publicadores.push(p);
    const prev = prever(db, analisarJson(JSON.stringify([{ nome: 'Fulano', mes: '2026-09', participou: true }])));
    expect(prev.itens[0].reativa).toBe(true);
    aplicar(db, prev, 'x.json', false);
    expect(p.inativo).toBe(false);
  });
  it('o mês ainda no prazo (até o dia 20) não conta como falta', () => {
    expect(ultimoMesFechado(new Date(2026, 10, 2))).toBe('2026-09');
    expect(ultimoMesFechado(new Date(2026, 10, 20))).toBe('2026-09');
    expect(ultimoMesFechado(new Date(2026, 10, 21))).toBe('2026-10');
    expect(ultimoMesFechado(new Date(2027, 0, 5))).toBe('2026-11');
    // Relatou até abril; maio a setembro sem relatar. Outubro só conta depois de 20/11.
    const meses = new Set(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    const p = novoPublicador({ nome: 'Bruno' });
    p.relatorios['2026-04'] = { participou: true, estudos: null, auxiliar: false, horas: null, obs: '' };
    expect(situacao(p, meses, ultimoMesFechado(new Date(2026, 10, 2)))).toBe('ativo');
    expect(situacao(p, meses, ultimoMesFechado(new Date(2026, 10, 21)))).toBe('inativo');
  });
});

describe('extrair dados', () => {
  it('extrai só o que foi escolhido: um PDF sai como arquivo, pastas viram zip', async () => {
    const { gerarSelecao, pastasDaExtracao } = await import('../src/pdf/extracao');
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string) => new Response(readFileSync(String(url).includes('S-88') ? 'src/assets/S-88_T.pdf' : 'src/assets/S-21_T.pdf'))) as typeof fetch;
    try {
      const db = dbVazio('Central');
      db.grupos.push({ id: 'g1', nome: 'Grupo 1', superintendenteId: null, ajudanteId: null });
      db.publicadores.push(novoPublicador({ nome: 'Ana', grupoId: 'g1' }), novoPublicador({ nome: 'Caio', inativo: true }));
      const { folhas } = pastasDaExtracao(db);
      const unico = await gerarSelecao(db, 2026, { arquivos: ['Registro de Assistência (S-88).pdf'], pastas: [] });
      expect(unico.mime).toBe('application/pdf');
      expect(unico.nome).toBe('Registro de Assistência (S-88).pdf');
      const inativos = [...folhas].find((f) => f.startsWith('Inativos'))!;
      const zip = await gerarSelecao(db, 2026, { arquivos: [], pastas: [inativos] });
      expect(zip.mime).toBe('application/zip');
      expect(Object.keys(unzipSync(zip.bytes))).toEqual([`${inativos}/Caio.pdf`]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('gera o zip com as pastas do arquivo e os PDFs da raiz', async () => {
    const { gerarExtracao } = await import('../src/pdf/extracao');
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string) => new Response(readFileSync(String(url).includes('S-88') ? 'src/assets/S-88_T.pdf' : 'src/assets/S-21_T.pdf'))) as typeof fetch;
    try {
      const db = dbVazio('Central');
      db.assistencia['2025-09'] = { meio: { reunioes: 4, total: 363 }, fim: { reunioes: 4, total: 435 } };
      const sup = novoPublicador({ nome: 'Carlos Lima', grupoId: 'g1', privilegios: ['anciao'] });
      db.publicadores.push(sup);
      db.grupos.push({ id: 'g1', nome: 'Grupo 1', superintendenteId: sup.id, ajudanteId: null });
      db.publicadores.push(
        novoPublicador({ nome: 'Ana', grupoId: 'g1', anotacoes: 'Contato de emergência: (51) 9999-0000 (mãe) 😀' }),
        novoPublicador({ nome: 'Ana', grupoId: 'g1' }),
        novoPublicador({ nome: 'Bia/X', grupoId: 'g1', privilegios: ['pioneiro_regular'] }),
        novoPublicador({ nome: 'Caio', grupoId: 'g1', inativo: true }),
        novoPublicador({ nome: 'Dora', arquivado: true }),
      );
      db.publicadores[3].relatorios['2025-09'] = { participou: true, estudos: 2, auxiliar: false, horas: 50, obs: '' };
      const zip = unzipSync(await gerarExtracao(db, 2026));
      expect(Object.keys(zip).sort()).toEqual([
        'Ativos (4)/Outros publicadores (3)/Grupo 1 - Carlos (3)/Ana (2).pdf',
        'Ativos (4)/Outros publicadores (3)/Grupo 1 - Carlos (3)/Ana.pdf',
        'Ativos (4)/Outros publicadores (3)/Grupo 1 - Carlos (3)/Carlos Lima.pdf',
        'Ativos (4)/P. regulares, p. especiais e mis. em campo (1)/BiaX (Grupo 1).pdf',
        'Grupos de Saída de Campo.pdf',
        'Inativos (1)/Caio (Grupo 1).pdf',
        'Lista de Emergência.pdf',
        'Registro de Assistência (S-88).pdf',
        'Total (Pioneiros Reg. Espe. e Missionários em campo).pdf',
        'Total (Pioneiros auxiliares).pdf',
        'Total (Publicadores).pdf',
      ]);
      const s88 = (await PDFDocument.load(zip['Registro de Assistência (S-88).pdf'])).getForm();
      expect(s88.getTextField('Service Year_1').getText()).toBe('2025');
      expect(s88.getTextField('Service Year_2').getText()).toBe('2026');
      expect(s88.getTextField('2-Attendance_1').getText()).toBe('363');
      expect(s88.getTextField('2-Average_1').getText()).toBe('90.75');
      expect(s88.getTextField('4-Average_Total').getText()).toBe('108.75');
      const total = (await PDFDocument.load(zip['Total (Pioneiros Reg. Espe. e Missionários em campo).pdf'])).getForm();
      expect(total.getTextField('900_1_Text_SanSerif').getText()).toBe('Pioneiros regulares, especiais e missionários em campo');
      expect(total.getTextField('902_20_Text_C_SanSerif').getText()).toBe('2');
      expect(total.getTextField('904_20_S21_Value').getText()).toBe('50');
      expect(total.getTextField('905_20_Text_SanSerif').getText()).toBe('Número de relatórios: 1');
      expect(total.getTextField('904_21_S21_Value').getText() ?? '').toBe('');
    } finally {
      globalThis.fetch = orig;
    }
  });
  it('lê o contato de emergência das anotações', async () => {
    const { dadosEmergencia } = await import('../src/pdf/emergencia');
    const p = novoPublicador({ anotacoes: 'Contato de emergência: (51) 1234 (Pai)\nEndereço de emergência: Rua A, 1' });
    expect(dadosEmergencia(p)).toEqual({ contato: '(51) 1234 (Pai)', endereco: 'Rua A, 1' });
  });
});

describe('menu de relatórios', () => {
  function montar() {
    const db = dbVazio();
    db.grupos.push({ id: 'g1', nome: 'Grupo 1', superintendenteId: null, ajudanteId: null });
    const ana = novoPublicador({ nome: 'Ana', grupoId: 'g1', privilegios: ['pioneiro_regular'] });
    const bia = novoPublicador({ nome: 'Bia', grupoId: 'g1' });
    const caio = novoPublicador({ nome: 'Caio', grupoId: 'g1', inativo: true });
    const davi = novoPublicador({ nome: 'Davi', arquivado: true });
    db.publicadores.push(ana, bia, caio, davi);
    return { db, ana, bia, caio };
  }

  it('separa quem relatou, quem falta e inativos, e soma no formato S-1', () => {
    const { db, ana, bia } = montar();
    definirRelatorio(db, ana.id, '2026-10', 'participou', true);
    definirRelatorio(db, ana.id, '2026-10', 'horas', 50);
    definirRelatorio(db, ana.id, '2026-10', 'estudos', 2);
    expect(db.importacoes.map((i) => i.mes)).toEqual(['2026-10']); // mês registrado ao editar
    const linhas = statusDoMes(db, '2026-10', mesesComDados(db));
    expect(Object.fromEntries(linhas.map((l) => [l.p.nome, l.status]))).toEqual({ Ana: 'relatou', Bia: 'falta', Caio: 'inativo' });
    expect(totaisDoMes(linhas).regulares).toEqual({ relatorios: 1, estudos: 2, horas: 50 });
    expect(textoFaltantes(db, linhas)).toBe('Grupo 1\nBia');
    // Relatório sem participação conta como entregue.
    definirRelatorio(db, bia.id, '2026-10', 'participou', false);
    expect(statusDoMes(db, '2026-10', mesesComDados(db)).find((l) => l.p.id === bia.id)?.status).toBe('relatou');
  });

  it('exclui um relatório ou o mês inteiro, refletindo nos cartões', () => {
    const { db, ana, bia } = montar();
    definirRelatorio(db, ana.id, '2026-10', 'participou', true);
    definirRelatorio(db, bia.id, '2026-10', 'participou', true);
    excluirRelatorio(db, bia.id, '2026-10');
    expect(bia.relatorios['2026-10']).toBeUndefined();
    expect(ana.relatorios['2026-10']?.participou).toBe(true);
    excluirMes(db, '2026-10');
    expect(ana.relatorios['2026-10']).toBeUndefined();
    expect(db.importacoes).toHaveLength(0);
  });
});

describe('relatório colado da planilha', () => {
  const texto = [
    'Nome\tParticipou\tEstudos\tHoras\tObservações\tEnviado em',
    'Ana Lima\tSim\t1\t\t\t01/11/2026, 15:19',
    'Beto Souza\tSim\t2\t50\tNão\t01/11/2026, 15:21',
    'Caio Reis\tNão\t0\t\t\t02/11/2026, 09:00',
    '\t\t\t\t\t',
  ].join('\n');
  it('lê colunas, sugere o mês anterior ao envio e marca PA como designação', () => {
    const lidas = lerColadoRelatorio(texto);
    expect(lidas).toHaveLength(3);
    expect(lidas[1].relatorio).toMatchObject({ participou: true, estudos: 2, horas: 50, obs: 'Não' });
    expect(lidas[2].relatorio.participou).toBe(false);
    expect(mesSugerido(lidas)).toBe('2026-10');

    const db = dbVazio();
    const beto = novoPublicador({ nome: 'Beto Souza' });
    db.publicadores.push(novoPublicador({ nome: 'Ana Lima' }), beto, novoPublicador({ nome: 'Caio Reis' }));
    expect(relataHoras(beto)).toBe(false);
    const previa = prever(db, comMes(lidas, '2026-10'));
    previa.itens[1].linha.relatorio.auxiliar = true; // marcado PA na prévia
    aplicar(db, previa, 'colado', false);
    expect(beto.relatorios['2026-10']).toMatchObject({ horas: 50, auxiliar: true });
    expect(beto.auxiliarMeses).toEqual(['2026-10']);
  });
});

describe('mapa', () => {
  it('completa o endereço com a cidade só quando falta', () => {
    expect(consultaEndereco(' Rua A,  10 ', 'Campinas - SP')).toBe('Rua A, 10, Campinas - SP');
    expect(consultaEndereco('Rua A, 10, Campinas', 'Campinas - SP')).toBe('Rua A, 10, Campinas');
    expect(consultaEndereco('Rua A, 10', '')).toBe('Rua A, 10');
  });
  it('pede para localizar de novo quando o endereço muda', () => {
    const p = novoPublicador({ endereco: 'Rua A, 10' });
    expect(precisaLocalizar(p)).toBe(true);
    p.local = { lat: 1, lng: 2, endereco: 'Rua A, 10' };
    expect(precisaLocalizar(p)).toBe(false);
    expect(localAtual(p)).not.toBeNull();
    p.endereco = 'Rua B, 20';
    expect(precisaLocalizar(p)).toBe(true);
    expect(localAtual(p)).toBeNull();
    expect(precisaLocalizar(novoPublicador())).toBe(false);
  });
});

describe('whatsapp', () => {
  it('monta o link com o código do Brasil', async () => {
    const { urlWhatsapp } = await import('../src/domain/contato');
    expect(urlWhatsapp('(11) 98765-4321')).toBe('https://wa.me/5511987654321');
    expect(urlWhatsapp('+55 11 98765-4321')).toBe('https://wa.me/5511987654321');
    expect(urlWhatsapp('011 3456-7890')).toBe('https://wa.me/551134567890');
    expect(urlWhatsapp('1234')).toBeNull();
  });
});
