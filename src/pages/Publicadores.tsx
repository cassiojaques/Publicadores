import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { ClipboardCopy, FileStack, Plus, Search, Users } from 'lucide-react';
import { mesesComDados, moverPublicador, useStore } from '../store/store';
import { situacao, type Situacao } from '../domain/serviceYear';
import { PRIVILEGIOS, type Privilegio } from '../domain/types';
import { Avatar, BadgeSituacao, BadgesPrivilegio, Vazio } from '../components/ui';
import { FormPublicador } from '../components/FormPublicador';
import { GerarCartoes } from '../components/GerarCartoes';
import { salvarArquivoGerado } from '../storage/storage';

export function Publicadores() {
  const { db, navegar, atualizar, toast } = useStore();
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState<string>('todos');
  const [priv, setPriv] = useState<Privilegio | 'todos'>('todos');
  const [sit, setSit] = useState<Situacao | 'todos'>('todos');
  const [arquivados, setArquivados] = useState(false);
  const [novo, setNovo] = useState(false);
  const [gerarCartoes, setGerarCartoes] = useState(false);

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
    .filter((p) => grupo === 'todos' || (grupo === 'sem' ? !p.grupoId : p.grupoId === grupo))
    .filter((p) => priv === 'todos' || p.privilegios.includes(priv))
    .filter((p) => sit === 'todos' || situacoes.get(p.id) === sit);

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
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Publicadores</h1>
          <p className="text-sm text-slate-500">{lista.length} exibidos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={copiarNomes} disabled={lista.length === 0} title="Copia os nomes exibidos, um por linha, para colar numa planilha">
            <ClipboardCopy size={16} /> Copiar nomes
          </button>
          <button className="btn-outline" onClick={() => setGerarCartoes(true)} disabled={db.publicadores.length === 0} title="Gera o S-21 de todos os publicadores de uma vez">
            <FileStack size={16} /> Gerar todos os cartões
          </button>
          <button className="btn-primary" onClick={() => setNovo(true)}>
            <Plus size={16} /> Novo publicador
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Filtrar por nome, telefone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
          <option value="todos">Todos os grupos</option>
          <option value="sem">Sem grupo</option>
          {db.grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={priv} onChange={(e) => setPriv(e.target.value as Privilegio | 'todos')}>
          <option value="todos">Todas as designações</option>
          {PRIVILEGIOS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={sit} onChange={(e) => setSit(e.target.value as Situacao | 'todos')}>
          <option value="todos">Qualquer situação</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
        <label className="flex items-center gap-2 px-2 text-sm text-slate-600 dark:text-slate-400">
          <input type="checkbox" className="accent-indigo-600" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} />
          Arquivados
        </label>
      </div>

      <div className="card overflow-hidden">
        {lista.length === 0 ? (
          <Vazio icone={<Users size={40} />} titulo="Nenhum publicador encontrado">
            {db.publicadores.length === 0 && (
              <button className="btn-primary mt-2" onClick={() => setNovo(true)}>
                <Plus size={16} /> Adicionar o primeiro
              </button>
            )}
          </Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
                <tr>
                  <th className="th">Nome</th>
                  <th className="th">Designações</th>
                  <th className="th">Situação</th>
                  <th className="th">Grupo</th>
                  <th className="th hidden lg:table-cell">Telefone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lista.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => navegar({ nome: 'publicador', id: p.id })}
                  >
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <Avatar nome={p.nome} />
                        <span className="font-medium">{p.nome}</span>
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        <BadgesPrivilegio p={p} />
                      </div>
                    </td>
                    <td className="td">
                      <BadgeSituacao s={situacoes.get(p.id)!} />
                    </td>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="input w-auto py-1"
                        value={p.grupoId ?? ''}
                        onChange={(e) => {
                          const g = e.target.value || null;
                          atualizar((d) => moverPublicador(d, p.id, g));
                        }}
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
                    <td className="td hidden text-slate-500 lg:table-cell">{p.telefone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GerarCartoes aberto={gerarCartoes} onFechar={() => setGerarCartoes(false)} exibidos={lista} />
      <FormPublicador
        aberto={novo}
        grupoInicial={grupo !== 'todos' && grupo !== 'sem' ? grupo : null}
        onFechar={() => setNovo(false)}
      />
    </div>
  );
}
