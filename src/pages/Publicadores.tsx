import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Fuse from 'fuse.js';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, ClipboardCopy, FileStack, FilterX, IdCard, MapPin, Phone, Plus, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { mesesComDados, moverPublicador, useStore } from '../store/store';
import { situacao, type Situacao } from '../domain/serviceYear';
import { PRIVILEGIOS, type Privilegio, type Publicador } from '../domain/types';
import { Avatar, BadgeSituacao, BadgesPrivilegio, Folha, Toggle, Vazio } from '../components/ui';
import { FormPublicador } from '../components/FormPublicador';
import { ExtrairDados } from '../components/ExtrairDados';
import { salvarArquivoGerado } from '../storage/storage';
import { urlMapa } from '../geo/geocodificar';
import { urlWhatsapp } from '../domain/contato';
import { IconeWhatsapp } from '../components/ui';

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
function Chip({ ativo, onClick, titulo, n, children }: { ativo: boolean; onClick: () => void; titulo?: string; n?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={ativo}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition md:px-2.5 md:py-0.5 md:text-xs ${
        ativo
          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
          : `border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 ${n === 0 ? 'opacity-45' : ''}`
      }`}
    >
      {children}
      {n !== undefined && <span className={`text-[11px] tabular-nums ${ativo ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'}`}>{n}</span>}
    </button>
  );
}

function LinhaFiltro({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 md:flex-row md:items-center">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-indigo-900/60 dark:text-slate-500 md:w-24">{rotulo}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Pequena etiqueta removível, para resumir os filtros ativos no celular. */
function EtiquetaAtiva({ rotulo, onRemover }: { rotulo: string; onRemover: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemover}
      aria-label={`Remover filtro ${rotulo}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-600 py-1 pl-3 pr-2 text-xs font-medium text-white shadow-sm shadow-indigo-600/30"
    >
      {rotulo}
      <X size={13} />
    </button>
  );
}

interface Filtros {
  q: string;
  grupos: string[];
  desigs: FiltroDesig[];
  sits: Situacao[];
  sexos: ('M' | 'F')[];
  arquivados: boolean;
}
const FILTROS_VAZIOS: Filtros = { q: '', grupos: [], desigs: [], sits: [], sexos: [], arquivados: false };
const CHAVE_FILTROS = 'publicadores.filtros';

/** Últimos filtros usados na lista, para mantê-los ao voltar de um cartão ou recarregar. */
function filtrosSalvos(): Filtros {
  try {
    return { ...FILTROS_VAZIOS, ...JSON.parse(localStorage.getItem(CHAVE_FILTROS) ?? '{}') };
  } catch {
    return FILTROS_VAZIOS;
  }
}

type ColunaOrdem = 'nome' | 'sexo' | 'batizado' | 'desigs' | 'grupo' | 'telefone' | 'endereco' | 'situacao';
interface Ordem {
  col: ColunaOrdem;
  dir: 1 | -1;
}

const porNome = (a: Publicador, b: Publicador) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });

/** Posição da designação mais "alta" do publicador (ancião primeiro); sem designação = vazio. */
function menorDesig(p: Publicador): number | '' {
  const pos = [...PRIVILEGIOS.map((x, i) => (p.privilegios.includes(x.id) ? i : -1)), p.auxiliarPermanente ? PRIVILEGIOS.length : -1].filter((i) => i >= 0);
  return pos.length ? Math.min(...pos) : '';
}

/** Cabeçalho de coluna que ordena a lista ao clicar. */
function ThOrdenavel({ col, ordem, onOrdenar, className = '', titulo, children }: { col: ColunaOrdem; ordem: Ordem | null; onOrdenar: (c: ColunaOrdem) => void; className?: string; titulo?: string; children: ReactNode }) {
  const ativa = ordem?.col === col;
  return (
    <th className={`th ${className}`} aria-sort={ativa ? (ordem.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onOrdenar(col)}
        title={titulo ?? `Ordenar por ${String(children).toLowerCase()}`}
        className={`inline-flex items-center gap-1 uppercase hover:text-indigo-700 dark:hover:text-indigo-300 ${ativa ? 'text-indigo-700 dark:text-indigo-300' : ''}`}
      >
        {children}
        {ativa ? ordem.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} className="opacity-30" />}
      </button>
    </th>
  );
}

const selectCelula =
  'rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-slate-300 focus:border-indigo-500 dark:hover:border-slate-700 dark:bg-transparent';

export function Publicadores() {
  const { db, navegar, atualizar, toast, pagina } = useStore();
  const [inicio] = useState(() => {
    const filtroInicial = pagina.nome === 'publicadores' ? pagina.filtro : undefined;
    // Vindo do painel, abre só com o filtro do indicador; senão, retoma os últimos filtros.
    return filtroInicial ? { ...FILTROS_VAZIOS, sits: filtroInicial.situacoes ?? [], desigs: filtroInicial.designacoes ?? [] } : filtrosSalvos();
  });
  const [q, setQ] = useState(inicio.q);
  // Listas vazias = sem filtro. Dentro de cada tipo, basta casar um; entre tipos, todos.
  // Descarta grupos que não existem mais (sem chip para desmarcá-los).
  const [grupos, setGrupos] = useState<string[]>(() => inicio.grupos.filter((g) => g === 'sem' || db.grupos.some((x) => x.id === g)));
  const [desigs, setDesigs] = useState<FiltroDesig[]>(inicio.desigs);
  const [sits, setSits] = useState<Situacao[]>(inicio.sits);
  const [sexos, setSexos] = useState<('M' | 'F')[]>(inicio.sexos);
  const [arquivados, setArquivados] = useState(inicio.arquivados);
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_FILTROS, JSON.stringify({ q, grupos, desigs, sits, sexos, arquivados } satisfies Filtros));
    } catch {
      /* sem armazenamento local */
    }
  }, [q, grupos, desigs, sits, sexos, arquivados]);
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

  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const [ordem, setOrdem] = useState<Ordem | null>(null);
  /** 1º clique: crescente; 2º: decrescente; 3º: volta à ordem padrão. */
  const ordenarPor = (col: ColunaOrdem) =>
    setOrdem((o) => (o?.col !== col ? { col, dir: 1 } : o.dir === 1 ? { col, dir: -1 } : null));

  const baseBusca = (q.trim() ? fuse.search(q.trim()).map((r) => r.item) : [...db.publicadores].sort(porNome)).filter(
    (p) => p.arquivado === arquivados,
  );
  const temDesig = (p: Publicador, d: FiltroDesig) => (d === 'pap' ? p.auxiliarPermanente : d === 'nb' ? !p.batizado : p.privilegios.includes(d));
  type Faceta = 'grupos' | 'sexos' | 'sits' | 'desigs';
  /** Aplica os filtros, menos o de `ignorar` — assim cada botão mostra quantos resultaria ao marcá-lo. */
  const passa = (p: Publicador, ignorar?: Faceta) =>
    (ignorar === 'grupos' || !grupos.length || grupos.includes(p.grupoId ?? 'sem')) &&
    (ignorar === 'sexos' || !sexos.length || sexos.includes(p.sexo)) &&
    (ignorar === 'sits' || !sits.length || sits.includes(situacoes.get(p.id)!)) &&
    (ignorar === 'desigs' || !desigs.length || desigs.some((d) => temDesig(p, d)));
  const filtrada = baseBusca.filter((p) => passa(p));
  const lista = (() => {
    if (!ordem) return filtrada;
    const { col, dir } = ordem;
    const nomeGrupo = (p: Publicador) => db.grupos.find((g) => g.id === p.grupoId)?.nome ?? '';
    const chave = (p: Publicador): string | number => {
      switch (col) {
        case 'nome': return p.nome;
        case 'sexo': return p.sexo;
        case 'batizado': return p.batizado ? 1 : 0;
        case 'desigs': return menorDesig(p);
        case 'grupo': return nomeGrupo(p);
        case 'telefone': return p.telefone.replace(/\D/g, '');
        case 'endereco': return p.endereco;
        case 'situacao': return situacoes.get(p.id) === 'ativo' ? 0 : 1;
      }
    };
    const vazio = (v: string | number) => v === '';
    return [...filtrada].sort((a, b) => {
      const x = chave(a);
      const y = chave(b);
      // Vazio vale "menos que tudo": no sentido crescente fica em cima, no decrescente embaixo.
      const c = vazio(x) || vazio(y) ? Number(!vazio(x)) - Number(!vazio(y)) : typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true });
      return c * dir || porNome(a, b);
    });
  })();
  const contar = (f: Faceta, pred: (p: Publicador) => boolean) => baseBusca.filter((p) => passa(p, f) && pred(p)).length;

  const nFiltros = grupos.length + desigs.length + sits.length + sexos.length + (arquivados ? 1 : 0);
  const temFiltro = q !== '' || nFiltros > 0;
  const etiquetas = [
    ...sits.map((s) => ({ k: `s-${s}`, r: s === 'ativo' ? 'Ativos' : 'Inativos', rm: () => setSits((x) => x.filter((y) => y !== s)) })),
    ...sexos.map((s) => ({ k: `x-${s}`, r: s === 'M' ? 'Irmãos' : 'Irmãs', rm: () => setSexos((x) => x.filter((y) => y !== s)) })),
    ...desigs.map((d) => ({ k: `d-${d}`, r: DESIGNACOES_FILTRO.find((x) => x.id === d)?.rotulo ?? d, rm: () => setDesigs((x) => x.filter((y) => y !== d)) })),
    ...grupos.map((g) => ({ k: `g-${g}`, r: g === 'sem' ? 'Sem grupo' : (db.grupos.find((x) => x.id === g)?.nome ?? g), rm: () => setGrupos((x) => x.filter((y) => y !== g)) })),
    ...(arquivados ? [{ k: 'arq', r: 'Arquivados', rm: () => setArquivados(false) }] : []),
  ];
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

  const painelFiltros = (
    <div className="space-y-4 md:space-y-1.5">
      <LinhaFiltro rotulo="Situação">
        <Chip n={contar('sits', (p) => situacoes.get(p.id) === 'ativo')} ativo={sits.includes('ativo')} onClick={() => setSits((x) => alternar(x, 'ativo'))}>Ativos</Chip>
        <Chip n={contar('sits', (p) => situacoes.get(p.id) === 'inativo')} ativo={sits.includes('inativo')} onClick={() => setSits((x) => alternar(x, 'inativo'))}>Inativos</Chip>
      </LinhaFiltro>
      <LinhaFiltro rotulo="Sexo">
        <Chip n={contar('sexos', (p) => p.sexo === 'M')} ativo={sexos.includes('M')} onClick={() => setSexos((x) => alternar(x, 'M'))}>Irmãos</Chip>
        <Chip n={contar('sexos', (p) => p.sexo === 'F')} ativo={sexos.includes('F')} onClick={() => setSexos((x) => alternar(x, 'F'))}>Irmãs</Chip>
      </LinhaFiltro>
      <LinhaFiltro rotulo="Designações">
        {DESIGNACOES_FILTRO.map((d) => (
          <Chip key={d.id} n={contar('desigs', (p) => temDesig(p, d.id))} titulo={d.titulo} ativo={desigs.includes(d.id)} onClick={() => setDesigs((x) => alternar(x, d.id))}>
            {d.rotulo}
          </Chip>
        ))}
      </LinhaFiltro>
      <LinhaFiltro rotulo="Grupos">
        {db.grupos.map((g) => (
          <Chip key={g.id} n={contar('grupos', (p) => p.grupoId === g.id)} ativo={grupos.includes(g.id)} onClick={() => setGrupos((x) => alternar(x, g.id))}>
            {g.nome}
          </Chip>
        ))}
        <Chip n={contar('grupos', (p) => !p.grupoId)} ativo={grupos.includes('sem')} onClick={() => setGrupos((x) => alternar(x, 'sem'))}>Sem grupo</Chip>
      </LinhaFiltro>
    </div>
  );
  const seletorArquivados = (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
      <Toggle checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} />
      Arquivados
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2 md:gap-3">
          <h1 className="text-xl font-semibold md:text-2xl">Publicadores</h1>
          <p className="whitespace-nowrap text-sm text-slate-500">
            {lista.length} <span className="hidden sm:inline">exibidos</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="btn-outline px-2.5 md:px-3" onClick={copiarNomes} disabled={lista.length === 0} aria-label="Copiar nomes" title="Copia os nomes exibidos, um por linha, para colar numa planilha">
            <ClipboardCopy size={16} /> <span className="hidden lg:inline">Copiar nomes</span>
          </button>
          <button className="btn-outline px-2.5 md:px-3" onClick={() => setExtrair(true)} disabled={db.publicadores.length === 0} aria-label="Extrair dados" title="Gera um .zip com os cartões S-21 em pastas, os totais, os grupos e a lista de emergência">
            <FileStack size={16} /> <span className="hidden lg:inline">Extrair dados</span>
          </button>
          <button className="btn-primary" onClick={() => setNovo(true)} aria-label="Novo publicador">
            <Plus size={16} /> <span className="hidden sm:inline">Novo publicador</span>
          </button>
        </div>
      </div>

      <div className="card space-y-2 p-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input py-2 pl-9 pr-8 md:py-1.5" type="search" placeholder="Buscar por nome, telefone…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600" onClick={() => setQ('')} aria-label="Limpar busca">
                <X size={15} />
              </button>
            )}
          </div>
          {/* Celular: filtros num painel que sobe da base */}
          <button className="btn-outline relative shrink-0 py-2 md:hidden" onClick={() => setFiltrosAbertos(true)} aria-label="Abrir filtros">
            <SlidersHorizontal size={16} /> Filtros
            {nFiltros > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[11px] font-semibold text-white">{nFiltros}</span>
            )}
          </button>
          {/* Desktop */}
          <div className="hidden items-center gap-3 px-1 md:flex">{seletorArquivados}</div>
          <button className="btn-ghost hidden py-1.5 md:inline-flex" onClick={limparFiltros} disabled={!temFiltro} title="Volta todos os filtros ao padrão">
            <FilterX size={16} /> Limpar filtros
          </button>
        </div>
        {etiquetas.length > 0 && (
          <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1 md:hidden">
            {etiquetas.map((e) => (
              <EtiquetaAtiva key={e.k} rotulo={e.r} onRemover={e.rm} />
            ))}
          </div>
        )}
        <div className="hidden border-t border-slate-100 px-1 pt-2 dark:border-slate-800 md:block">{painelFiltros}</div>
      </div>

      <Folha
        aberto={filtrosAbertos}
        titulo="Filtros"
        onFechar={() => setFiltrosAbertos(false)}
        rodape={
          <div className="flex gap-2">
            <button className="btn-outline flex-1 py-2.5" onClick={limparFiltros} disabled={!temFiltro}>
              <FilterX size={16} /> Limpar
            </button>
            <button className="btn-primary flex-[2] py-2.5" onClick={() => setFiltrosAbertos(false)}>
              Ver {lista.length} {lista.length === 1 ? 'publicador' : 'publicadores'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {painelFiltros}
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">{seletorArquivados}</div>
        </div>
      </Folha>

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
          <>
          {/* Celular: um cartão por publicador; toque para abrir. */}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
            {lista.map((p) => {
              const s = situacoes.get(p.id)!;
              const grupo = db.grupos.find((g) => g.id === p.grupoId)?.nome;
              return (
                <li key={p.id} className="flex items-stretch">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-2 text-left active:bg-indigo-50 dark:active:bg-slate-800"
                    onClick={() => navegar({ nome: 'publicador', id: p.id })}
                    aria-label={`Abrir ${p.nome}`}
                  >
                    <Avatar nome={p.nome} tamanho={38} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{p.nome}</span>
                        {s === 'inativo' && <BadgeSituacao s={s} />}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <BadgesPrivilegio p={p} />
                        <span className="text-xs text-slate-500">{grupo ?? 'Sem grupo'}</span>
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />
                  </button>
                  {urlMapa(p, db.congregacao.cidade ?? '') && (
                    <a
                      href={urlMapa(p, db.congregacao.cidade ?? '')!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-12 shrink-0 items-center justify-center border-l border-slate-100 text-indigo-600 active:bg-indigo-50 dark:border-slate-800 dark:text-indigo-300 dark:active:bg-slate-800"
                      aria-label={`Abrir o endereço de ${p.nome} no mapa`}
                      title={p.endereco}
                    >
                      <MapPin size={18} />
                    </a>
                  )}
                  {p.telefone && urlWhatsapp(p.telefone) && (
                    <a
                      href={urlWhatsapp(p.telefone)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-12 shrink-0 items-center justify-center border-l border-slate-100 text-green-600 active:bg-green-50 dark:border-slate-800 dark:text-green-400 dark:active:bg-slate-800"
                      aria-label={`Chamar ${p.nome} no WhatsApp`}
                    >
                      <IconeWhatsapp size={18} />
                    </a>
                  )}
                  {p.telefone && (
                    <a
                      href={`tel:${p.telefone.replace(/[^\d+]/g, '')}`}
                      className="flex w-12 shrink-0 items-center justify-center border-l border-slate-100 text-emerald-600 active:bg-emerald-50 dark:border-slate-800 dark:text-emerald-400 dark:active:bg-slate-800"
                      aria-label={`Ligar para ${p.nome}`}
                    >
                      <Phone size={18} />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-indigo-100 dark:border-slate-800">
                <tr>
                  <th className="th w-8" />
                  <ThOrdenavel col="nome" ordem={ordem} onOrdenar={ordenarPor} className="min-w-[200px]">Nome</ThOrdenavel>
                  <ThOrdenavel col="sexo" ordem={ordem} onOrdenar={ordenarPor}>Sexo</ThOrdenavel>
                  <ThOrdenavel col="batizado" ordem={ordem} onOrdenar={ordenarPor} titulo="Ordenar por batizado">Bat.</ThOrdenavel>
                  <ThOrdenavel col="desigs" ordem={ordem} onOrdenar={ordenarPor}>Designações</ThOrdenavel>
                  <ThOrdenavel col="grupo" ordem={ordem} onOrdenar={ordenarPor}>Grupo</ThOrdenavel>
                  <ThOrdenavel col="telefone" ordem={ordem} onOrdenar={ordenarPor} className="min-w-[130px]">Telefone</ThOrdenavel>
                  <ThOrdenavel col="endereco" ordem={ordem} onOrdenar={ordenarPor} className="min-w-[220px]">Endereço</ThOrdenavel>
                  <ThOrdenavel col="situacao" ordem={ordem} onOrdenar={ordenarPor}>Situação</ThOrdenavel>
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
                      <td className="px-1 py-0.5">
                        <div className="flex items-center gap-0.5">
                          <CelulaTexto aria-label="Endereço" placeholder="—" valor={p.endereco} onSalvar={(v) => editar(p.id, (x) => (x.endereco = v))} />
                          {urlMapa(p, db.congregacao.cidade ?? '') && (
                            <a
                              href={urlMapa(p, db.congregacao.cidade ?? '')!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-md p-1.5 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
                              title="Abrir no mapa"
                              aria-label={`Abrir o endereço de ${p.nome} no mapa`}
                            >
                              <MapPin size={16} />
                            </a>
                          )}
                        </div>
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
          </>
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
