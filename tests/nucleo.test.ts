import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { cifrar, decifrar, derivarChave, SenhaIncorretaError } from '../src/crypto/crypto';
import { anoServicoDe, mesesDoAnoServico, situacao, totaisAnoServico } from '../src/domain/serviceYear';
import { dbVazio, novoPublicador } from '../src/domain/types';
import { aplicar, analisarJson, normalizarMes, prever } from '../src/import/relatorioCampo';
import { moverPublicador } from '../src/store/store';
import { gerarS21 } from '../src/pdf/s21';
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
    expect(linhas[2]).toMatchObject({ sexo: 'F', batizado: false, nota: 'Pioneiro auxiliar contínuo' });
    expect(linhas[3].privilegios).toEqual(['pioneiro_regular']);
  });
  it('cria grupos e escolhe o superintendente pelo nome', () => {
    const db = dbVazio();
    expect(aplicarPlanilha(db, preverPlanilha(db, linhas), false).criados).toBe(4);
    expect(db.grupos.map((g) => g.nome)).toEqual(['Grupo 1', 'Grupo 2']);
    const g2 = db.grupos[1];
    expect(db.publicadores.find((p) => p.id === g2.superintendenteId)?.nome).toBe('Luiz Silva');
    expect(db.grupos[0].superintendenteId).toBeNull();
    // Reimportar não duplica.
    expect(preverPlanilha(db, linhas).novos).toHaveLength(0);
  });
});
