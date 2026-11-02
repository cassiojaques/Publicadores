import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Fuse from 'fuse.js';
import { ClipboardCopy, FileStack, FilterX, IdCard, Plus, Search, Users } from 'lucide-react';
import { mesesComDados, moverPublicador, useStore } from '../store/store';
import { situacao, type Situacao } from '../domain/serviceYear';
import { PRIVILEGIOS, type Privilegio, type Publicador } from '../domain/types';
import { Toggle, Vazio } from '../components/ui';
import { FormPublicador } from '../components/FormPublicador';
import { ExtrairDados } from '../components/ExtrairDados';
import { salvarArquivoGerado } from '../storage/storage';

const CORES_PRIV: Record<Privilegio | 'pap', string> = {
  anciao: 'border-indigo-500 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  servo_ministerial: 'border-sky-500 bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  pioneiro_regular: 'border-emerald-500 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  pioneiro_especial: 'border-teal-500 bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  missionario: 'border-amber-500 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  pap: 'border-lime-500 bg-lime-100 text-lime-700 dark:bg-lime-500/20 dark:text-lime-300',
};

/** Campo de texto da tabela: grava ao sair do campo ou com Enter; Esc desfaz. */
function CelulaTexto({ valor, onSalvar, className = '', ...resto }: { valor: string; onSalvar: (v: string) => void; className?: string; placeholder?: string; 'aria-label': string }) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  const salvar = () => {
    const limpo = v.trim().replace(/\s+/g, ' ');
    if (limpo !== valor) onSalvar(limpo);
  };
  return (
    <input
      {...resto}
      className={`w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:hover:border-slate-700 dark:focus:bg-slate-900 ${className}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          setV(valor);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

function Pilula({ ativo, cor, titulo, onClick, children }: { ativo: boolean; cor: string; titulo: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      title={`${titulo}${ativo ? ' (clique para remover)' : ' (clique para marcar)'}`}
      onClick={onClick}
      className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none transition ${
        ativo ? cor : 'border-dashed border-slate-300 text-slate-300 hover:border-slate-400 hover:text-slate-500 dark:border-slate-700 dark:text-slate-600'
      }`}
    >
      {children}
    </button>
  );
}

type FiltroDesig = Privilegio | 'pap' | 'nb';
const DESIGNACOES_FILTRO: { id: FiltroDesig; rotulo: string; titulo: string }[] = [
  ...PRIVILEGIOS.map((x) => ({ id: x.id, rotulo: x.curto, titulo: x.label })),
  { id: 'pap', rotulo: 'PAP', titulo: 'Pioneiro auxiliar permanente' },
  { id: 'nb', rotulo: 'Não batizado', titulo: 'Publicador não batizado' },
];

/** Liga/desliga um valor num conjunto de filtros. */
const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

/** Botão de pré-filtro: clica para incluir/excluir. Vários do mesmo tipo somam (um OU outro). */
function Chip({ ativo, onClick, titulo, children }: { ativo: boolean; onClick: () => void; titulo?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={ativo}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
        ativo
          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
          : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function LinhaFiltro({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-indigo-900/50 dark:text-slate-500">{rotulo}</span>
      {children}
    </div>
  );
}

const selectCelula =
  'rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-slate-300 focus:border-indigo-500 dark:hover:border-slate-700 dark:bg-transparent';

export function Publicadores() {
  const { db, navegar, atualizar, toast } = useStore();
  const [q, setQ] = useState('');
  // Listas vazias = sem filtro. Dentro de cada tipo, basta casar um; entre tipos, todos.
  const [grupos, setGrupos] = useState<string[]>([]);
  const [desigs, setDesigs] = useState<FiltroDesig[]>([]);
  const [sits, setSits] = useState<Situacao[]>([]);
  const [sexos, setSexos] = useState<('M' | 'F')[]>([]);
  const [arquivados, setArquivados] = useState(false);
  const [novo, setNovo] = useState(false);
  const [extrair, setExtrair] = useState(false);

  const meses = useMemo(() => mesesComDados(db), [db]);
  const situacoes = useMemo(
    () => new Map(db.publicadores.map((p) => [p.id, situacao(p, meses)])),
    [db.publicadores, meses],
  );
  const fuse = useMemo(
    () => new Fuse(db.publicadores, { keys: ['nome', 'telefone', 'endereco'], threshold: 0.35, ignoreLocation: true }),
    [db.publicadores],
  );

  const lista = (q.trim() ? fuse.search(q.trim()).map((r) => r.item) : [...db.publicadores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })))
    .filter((p) => p.arquivado === arquivados)
    .filter((p) => !grupos.length || grupos.includes(p.grupoId ?? 'sem'))
    .filter((p) => !sexos.length || sexos.includes(p.sexo))
    .filter((p) => !sits.length || sits.includes(situacoes.get(p.id)!))
    .filter(
      (p) =>
        !desigs.length ||
        desigs.some((d) => (d === 'pap' ? p.auxiliarPermanente : d === 'nb' ? !p.batizado : p.privilegios.includes(d))),
    );

  const temFiltro = q !== '' || grupos.length > 0 || desigs.length > 0 || sits.length > 0 || sexos.length > 0 || arquivados;
  function limparFiltros() {
    setQ('');
    setGrupos([]);
    setDesigs([]);
    setSits([]);
    setSexos([]);
    setArquivados(false);
  }

  const editar = (id: string, fn: (p: Publicador, d: typeof db) => void) =>
    atualizar((d) => {
      const p = d.publicadores.find((x) => x.id === id);
      if (p) fn(p, d);
    });

  /** Um nome por linha, na ordem exibida — pronto para colar numa coluna de planilha. */
  async function copiarNomes() {
    const texto = lista.map((p) => p.nome).join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      toast(`${lista.length} nomes copiados. Cole na planilha com Ctrl+V.`);
    } catch {
      await salvarArquivoGerado('Publicadores.txt', texto, 'text/plain');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">Publicadores</h1>
          <p className="text-sm text-slate-500">{lista.length} exibidos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={copiarNomes} disabled={lista.length === 0} title="Copia os nomes exibidos, um por linha, para colar numa planilha">
            <ClipboardCopy size={16} /> Copiar nomes
          </button>
          <button className="btn-outline" onClick={() => setExtrair(true)} disabled={db.publicadores.length === 0} title="Gera um .zip com os cartões S-21 em pastas, os totais, os grupos e a lista de emergência">
            <FileStack size={16} /> Extrair dados
          </button>
          <button className="btn-primary" onClick={() => setNovo(true)}>
            <Plus size={16} /> Novo publicador
          </button>
        </div>
      </div>

      <div className="card space-y-2 p-2">
        <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input py-1.5 pl-9" placeholder="Filtrar por nome, telefone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 px-2 text-sm text-slate-600 dark:text-slate-400">
          <Toggle checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} />
          Arquivados
        </label>
        <button className="btn-ghost py-1.5" onClick={limparFiltros} disabled={!temFiltro} title="Volta todos os filtros ao padrão">
          <FilterX size={16} /> Limpar filtros
        </button>
        </div>
        <div className="space-y-1.5 border-t border-slate-100 px-1 pt-2 dark:border-slate-800">
          <LinhaFiltro rotulo="Situação">
            <Chip ativo={sits.includes('ativo')} onClick={() => setSits((x) => alternar(x, 'ativo'))}>Ativos</Chip>
            <Chip ativo={sits.includes('inativo')} onClick={() => setSits((x) => alternar(x, 'inativo'))}>Inativos</Chip>
            <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
            <Chip ativo={sexos.includes('M')} onClick={() => setSexos((x) => alternar(x, 'M'))}>Irmãos</Chip>
            <Chip ativo={sexos.includes('F')} onClick={() => setSexos((x) => alternar(x, 'F'))}>Irmãs</Chip>
          </LinhaFiltro>
          <LinhaFiltro rotulo="Designações">
            {DESIGNACOES_FILTRO.map((d) => (
              <Chip key={d.id} titulo={d.titulo} ativo={desigs.includes(d.id)} onClick={() => setDesigs((x) => alternar(x, d.id))}>
                {d.rotulo}
              </Chip>
            ))}
          </LinhaFiltro>
          <LinhaFiltro rotulo="Grupos">
            {db.grupos.map((g) => (
              <Chip key={g.id} ativo={grupos.includes(g.id)} onClick={() => setGrupos((x) => alternar(x, g.id))}>
                {g.nome}
              </Chip>
            ))}
            <Chip ativo={grupos.includes('sem')} onClick={() => setGrupos((x) => alternar(x, 'sem'))}>Sem grupo</Chip>
          </LinhaFiltro>
        </div>
      </div>

      <div className="card overflow-hidden">
        {lista.length === 0 ? (
          <Vazio icone={<Users size={40} />} titulo="Nenhum publicador encontrado">
            {db.publicadores.length === 0 ? (
              <button className="btn-primary mt-2" onClick={() => setNovo(true)}>
                <Plus size={16} /> Adicionar o primeiro
              </button>
            ) : (
              temFiltro && (
                <button className="btn-outline mt-2" onClick={limparFiltros}>
                  <FilterX size={16} /> Limpar filtros
                </button>
              )
            )}
          </Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-indigo-100 dark:border-slate-800">
                <tr>
                  <th className="th w-8" />
                  <th className="th min-w-[200px]">Nome</th>
                  <th className="th">Sexo</th>
                  <th className="th" title="Batizado">Bat.</th>
                  <th className="th">Designações</th>
                  <th className="th">Grupo</th>
                  <th className="th min-w-[130px]">Telefone</th>
                  <th className="th">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 [&>tr:nth-child(even)]:bg-slate-50/70 dark:[&>tr:nth-child(even)]:bg-slate-800/20">
                {lista.map((p) => {
                  const s = situacoes.get(p.id)!;
                  const auto = s === 'inativo' && !p.inativo;
                  return (
                    <tr key={p.id} className="hover:!bg-indigo-50/60 dark:hover:!bg-slate-800/40">
                      <td className="py-0.5 pl-2">
                        <button
                          className="rounded-md p-1 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
                          onClick={() => navegar({ nome: 'publicador', id: p.id })}
                          title="Abrir cartão e mais dados"
                          aria-label={`Abrir ${p.nome}`}
                        >
                          <IdCard size={18} />
                        </button>
                      </td>
                      <td className="px-1 py-0.5">
                        <CelulaTexto
                          aria-label="Nome"
                          className="font-medium"
                          valor={p.nome}
                          onSalvar={(v) => (v ? editar(p.id, (x) => (x.nome = v)) : toast('O nome não pode ficar vazio.', 'erro'))}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <select
                          className={selectCelula}
                          value={p.sexo}
                          aria-label={`Sexo de ${p.nome}`}
                          onChange={(e) =>
                            editar(p.id, (x, d) => {
                              x.sexo = e.target.value as 'M' | 'F';
                              // Irmã não pode ser superintendente/ajudante.
                              if (x.sexo === 'F')
                                for (const g of d.grupos) {
                                  if (g.superintendenteId === x.id) g.superintendenteId = null;
                                  if (g.ajudanteId === x.id) g.ajudanteId = null;
                                }
                            })
                          }
                        >
                          <option value="M">M</option>
                          <option value="F">F</option>
                        </select>
                      </td>
                      <td className="px-3 py-0.5 text-center">
                        <Toggle
                          checked={p.batizado}
                          aria-label={`${p.nome} é batizado`}
                          onChange={(e) =>
                            editar(p.id, (x) => {
                              x.batizado = e.target.checked;
                              if (!x.batizado) x.batismo = '';
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-0.5">
                        <div className="flex gap-1">
                          {PRIVILEGIOS.map((x) => {
                            const tem = p.privilegios.includes(x.id);
                            return (
                              <Pilula
                                key={x.id}
                                ativo={tem}
                                cor={CORES_PRIV[x.id]}
                                titulo={x.label}
                                onClick={() =>
                                  editar(p.id, (y) => {
                                    y.privilegios = tem ? y.privilegios.filter((z) => z !== x.id) : [...y.privilegios, x.id];
                                  })
                                }
                              >
                                {x.curto}
                              </Pilula>
                            );
                          })}
                          <Pilula
                            ativo={p.auxiliarPermanente}
                            cor={CORES_PRIV.pap}
                            titulo="Pioneiro auxiliar permanente"
                            onClick={() => editar(p.id, (y) => (y.auxiliarPermanente = !y.auxiliarPermanente))}
                          >
                            PAP
                          </Pilula>
                        </div>
                      </td>
                      <td className="px-1 py-0.5">
                        <select
                          className={`${selectCelula} max-w-[160px]`}
                          value={p.grupoId ?? ''}
                          onChange={(e) => atualizar((d) => moverPublicador(d, p.id, e.target.value || null))}
                          aria-label={`Grupo de ${p.nome}`}
                        >
                          <option value="">Sem grupo</option>
                          {db.grupos.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-0.5">
                        <CelulaTexto aria-label="Telefone" placeholder="—" valor={p.telefone} onSalvar={(v) => editar(p.id, (x) => (x.telefone = v))} />
                      </td>
                      <td className="px-3 py-0.5">
                        <button
                          type="button"
                          className={`badge cursor-pointer ${
                            s === 'inativo'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          }`}
                          title={
                            auto
                              ? 'Inativo automático: 6 meses sem relatar. Volta a ativo quando relatar.'
                              : p.inativo
                                ? 'Marcado como inativo. Clique para reativar.'
                                : 'Clique para marcar como inativo.'
                          }
                          disabled={auto}
                          onClick={() => editar(p.id, (x) => (x.inativo = !x.inativo))}
                        >
                          {s === 'inativo' ? 'Inativo' : 'Ativo'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ExtrairDados aberto={extrair} onFechar={() => setExtrair(false)} />
      <FormPublicador
        aberto={novo}
        grupoInicial={grupos.length === 1 && grupos[0] !== 'sem' ? grupos[0] : null}
        onFechar={() => setNovo(false)}
      />
    </div>
  );
}
