import { useEffect, useState } from 'react';
import { novoPublicador, PRIVILEGIOS, type Privilegio, type Publicador } from '../domain/types';
import { moverPublicador, useStore } from '../store/store';
import { Campo, Modal, Toggle } from './ui';
import { CampoData } from './CampoData';

/** Cria (publicador ausente) ou edita um publicador. */
export function FormPublicador({
  aberto,
  publicador,
  grupoInicial = null,
  onFechar,
}: {
  aberto: boolean;
  publicador?: Publicador;
  grupoInicial?: string | null;
  onFechar: (salvoId?: string) => void;
}) {
  const { db, atualizar, toast } = useStore();
  const [p, setP] = useState<Publicador>(() => publicador ?? novoPublicador({ grupoId: grupoInicial }));

  useEffect(() => {
    if (aberto) setP(publicador ? structuredClone(publicador) : novoPublicador({ grupoId: grupoInicial }));
  }, [aberto, publicador, grupoInicial]);

  /** Ancião e servo ministerial são só para irmãos. */
  const soIrmao = (id: Privilegio) => id === 'anciao' || id === 'servo_ministerial';
  /** Só um entre ancião e servo; só um entre PR, PE, MC e PAP. */
  const GRUPOS_EXCLUSIVOS: Privilegio[][] = [['anciao', 'servo_ministerial'], ['pioneiro_regular', 'pioneiro_especial', 'missionario']];
  const set = <K extends keyof Publicador>(k: K, v: Publicador[K]) => setP((x) => ({ ...x, [k]: v }));

  function salvar() {
    if (!p.nome.trim()) return;
    const nome = p.nome.trim().replace(/\s+/g, ' ');
    const privilegios = p.sexo === 'F' ? p.privilegios.filter((y) => !soIrmao(y)) : p.privilegios;
    atualizar((d) => {
      const i = d.publicadores.findIndex((x) => x.id === p.id);
      if (i < 0) {
        d.publicadores.push({ ...p, nome, privilegios });
        return;
      }
      const grupoNovo = p.grupoId;
      d.publicadores[i] = { ...p, nome, privilegios, grupoId: d.publicadores[i].grupoId };
      moverPublicador(d, p.id, grupoNovo);
      // Irmã não pode ser superintendente/ajudante.
      if (p.sexo === 'F')
        for (const g of d.grupos) {
          if (g.superintendenteId === p.id) g.superintendenteId = null;
          if (g.ajudanteId === p.id) g.ajudanteId = null;
        }
    });
    toast(publicador ? 'Publicador atualizado.' : 'Publicador adicionado.');
    onFechar(p.id);
  }

  return (
    <Modal
      aberto={aberto}
      titulo={publicador ? 'Editar publicador' : 'Novo publicador'}
      onFechar={() => onFechar()}
      largura="max-w-2xl"
      rodape={
        <>
          <button className="btn-ghost" onClick={() => onFechar()}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={salvar} disabled={!p.nome.trim()}>
            Salvar
          </button>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <Campo rotulo="Nome completo" className="sm:col-span-2">
          <input className="input" autoFocus value={p.nome} onChange={(e) => set('nome', e.target.value)} />
        </Campo>
        <div>
          <span className="label">Data de nascimento</span>
          <CampoData rotulo="Data de nascimento" valor={p.nascimento} onChange={(v) => set('nascimento', v)} />
        </div>
        <div>
          <span className="label flex items-center justify-between">
            Data de batismo
            <label className="flex items-center gap-1.5 font-normal">
              <Toggle
                checked={!p.batizado}
                onChange={(e) => setP((x) => ({ ...x, batizado: !e.target.checked, batismo: e.target.checked ? '' : x.batismo }))}
              />
              Não batizado
            </label>
          </span>
          <CampoData rotulo="Data de batismo" disabled={!p.batizado} valor={p.batismo} onChange={(v) => set('batismo', v)} />
        </div>
        <Campo rotulo="Sexo">
          <div className="flex gap-2">
            {(['M', 'F'] as const).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setP((x) => ({ ...x, sexo: s, privilegios: s === 'F' ? x.privilegios.filter((y) => !soIrmao(y)) : x.privilegios }))}
                className={`btn flex-1 border ${
                  p.sexo === s
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                {s === 'M' ? 'Masculino' : 'Feminino'}
              </button>
            ))}
          </div>
        </Campo>
        <Campo rotulo="Esperança">
          <div className="flex gap-2">
            {(
              [
                ['outras_ovelhas', 'Outras ovelhas'],
                ['ungido', 'Ungido'],
              ] as const
            ).map(([v, t]) => (
              <button
                type="button"
                key={v}
                onClick={() => set('esperanca', v)}
                className={`btn flex-1 border ${
                  p.esperanca === v
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Campo>
        <div className="sm:col-span-2">
          <span className="label">Designações</span>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {PRIVILEGIOS.map((x) => {
              const marcado = p.privilegios.includes(x.id);
              const bloqueado = p.sexo === 'F' && soIrmao(x.id);
              return (
                <label
                  key={x.id}
                  title={bloqueado ? 'Só para irmãos' : undefined}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                    bloqueado ? 'cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-800' : 'cursor-pointer'
                  } ${marcado ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : bloqueado ? '' : 'border-slate-300 dark:border-slate-700'}`}
                >
                  <Toggle
                    checked={marcado}
                    disabled={bloqueado}
                    onChange={() =>
                      setP((v) => {
                        if (marcado) return { ...v, privilegios: v.privilegios.filter((y) => y !== x.id) };
                        const grupo = GRUPOS_EXCLUSIVOS.find((g) => g.includes(x.id)) ?? [];
                        const pioneiro = x.id === 'pioneiro_regular' || x.id === 'pioneiro_especial' || x.id === 'missionario';
                        return {
                          ...v,
                          privilegios: [...v.privilegios.filter((y) => !grupo.includes(y)), x.id],
                          auxiliarPermanente: pioneiro ? false : v.auxiliarPermanente,
                        };
                      })
                    }
                  />
                  {x.label}
                </label>
              );
            })}
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <Toggle className="mt-0.5"
            checked={p.auxiliarPermanente}
            onChange={(e) =>
              setP((v) => ({
                ...v,
                auxiliarPermanente: e.target.checked,
                privilegios: e.target.checked ? v.privilegios.filter((y) => !['pioneiro_regular', 'pioneiro_especial', 'missionario'].includes(y)) : v.privilegios,
              }))
            }
          />
          <span>
            <span className="font-medium">Pioneiro auxiliar permanente</span>
            <span className="block text-xs text-slate-500">
              Conta como pioneiro auxiliar todo mês até você desmarcar. Para um mês só, marque "Pion. aux." no mês do cartão.
            </span>
          </span>
        </label>
        <Campo rotulo="Grupo de campo">
          <select
            className="input"
            value={p.grupoId ?? ''}
            onChange={(e) => set('grupoId', e.target.value || null)}
          >
            <option value="">Sem grupo</option>
            {db.grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Telefone">
          <input className="input" value={p.telefone} onChange={(e) => set('telefone', e.target.value)} />
        </Campo>
        <Campo rotulo="Endereço" className="sm:col-span-2">
          <input className="input" value={p.endereco} onChange={(e) => set('endereco', e.target.value)} />
        </Campo>
        <Campo rotulo="Anotações" className="sm:col-span-2">
          <textarea
            className="input min-h-[70px]"
            value={p.anotacoes}
            onChange={(e) => set('anotacoes', e.target.value)}
          />
        </Campo>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <Toggle className="mt-0.5" cor="rose" checked={p.inativo} onChange={(e) => set('inativo', e.target.checked)} />
          <span>
            <span className="font-medium">Inativo</span>
            <span className="block text-xs text-slate-500">
              Também fica inativo automaticamente após 6 meses sem relatar. Volta a ativo quando um relatório importado mostrar participação.
            </span>
          </span>
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
