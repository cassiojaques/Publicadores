import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { cifrar, decifrar, derivarChave, SenhaIncorretaError } from '../src/crypto/crypto';
import { anoServicoDe, interpretarData, mesesDoAnoServico, rotuloAnoServico, situacao, totaisAnoServico } from '../src/domain/serviceYear';
import { dbVazio, novoPublicador } from '../src/domain/types';
import { aplicar, analisarJson, normalizarMes, prever } from '../src/import/relatorioCampo';
import { definirAuxiliar, definirRelatorio, excluirMes, excluirRelatorio, mesesComDados, moverPublicador } from '../src/store/store';
import { statusDoMes, textoFaltantes, totaisDoMes } from '../src/domain/relatorios';
import { gerarS21 } from '../src/pdf/s21';
import { unzipSync } from 'fflate';
import { gerarPdfGrupos } from '../src/pdf/grupos';
import { lerLinhas, preverPlanilha, aplicarPlanilha, interpretarGrupo } from '../src/import/planilhaPublicadores';

describe('criptografia', () => {
  it('cifra e decifra com o PIN certo', async () => {
    const chave = await derivarChave('1234', undefined, 1000);
    const arq = await cifrar(chave, '{"ok":true}');
    expect(arq).not.toContain('ok');
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
  it('soma totais e calcula situação', () => {
    const p = novoPublicador({ nome: 'A' });
    p.relatorios['2025-09'] = { participou: true, estudos: 1, auxiliar: false, horas: 50, obs: '' };
    p.relatorios['2025-10'] = { participou: true, estudos: 2, auxiliar: false, horas: 40, obs: '' };
    expect(totaisAnoServico(p, 2026)).toEqual({ horas: 90, mesesParticipou: 2, estudos: 3 });
    const meses = new Set(['2025-09', '2025-10', '2025-11']);
    expect(situacao(p, meses, '2025-11')).toBe('irregular');
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
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
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

describe('ano de serviço e inativos', () => {
  it('rótulo do ano de serviço', () => {
    expect(rotuloAnoServico(2026)).toBe('Ano de Serviço 2026 (Setembro 2025 – Agosto 2026)');
  });
  it('inativo manual, automático após 6 meses e reativação na importação', () => {
    const meses = new Set(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
    const p = novoPublicador({ nome: 'Fulano' });
    expect(situacao(p, meses, '2026-08')).toBe('inativo'); // 6 meses sem relatar
    p.relatorios['2026-08'] = { participou: true, estudos: null, auxiliar: false, horas: null, obs: '' };
    expect(situacao(p, meses, '2026-08')).toBe('irregular');
    p.inativo = true;
    expect(situacao(p, meses, '2026-08')).toBe('inativo'); // marcado manualmente

    const db = dbVazio();
    db.publicadores.push(p);
    const prev = prever(db, analisarJson(JSON.stringify([{ nome: 'Fulano', mes: '2026-09', participou: true }])));
    expect(prev.itens[0].reativa).toBe(true);
    aplicar(db, prev, 'x.json', false);
    expect(p.inativo).toBe(false);
  });
});

describe('cartões em lote', () => {
  it('gera um zip com um PDF por publicador', async () => {
    const { gerarS21Zip } = await import('../src/pdf/s21');
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(readFileSync('src/assets/S-21_T.pdf'))) as typeof fetch;
    try {
      const ps = [novoPublicador({ nome: 'Ana' }), novoPublicador({ nome: 'Ana' }), novoPublicador({ nome: 'Bia/X' })];
      const nomes = Object.keys(unzipSync(await gerarS21Zip(ps, 2026))).sort();
      expect(nomes).toEqual(['S-21 2026 - Ana (2).pdf', 'S-21 2026 - Ana.pdf', 'S-21 2026 - BiaX.pdf']);
    } finally {
      globalThis.fetch = orig;
    }
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
