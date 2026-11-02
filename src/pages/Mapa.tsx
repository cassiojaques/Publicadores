import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, MapPinOff, Square } from 'lucide-react';
import { mesesComDados, useStore } from '../store/store';
import { situacao, type Situacao } from '../domain/serviceYear';
import type { Publicador } from '../domain/types';
import { consultaEndereco, espera, geocodificar, localAtual, precisaLocalizar } from '../geo/geocodificar';
import { Toggle } from '../components/ui';

/** Cores dos grupos, na ordem em que aparecem. Quem não tem grupo fica cinza. */
const CORES = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#e11d48', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#ec4899', '#0891b2', '#a16207'];
const COR_SEM_GRUPO = '#64748b';
const SEM = 'sem';
/** O mapa sempre abre em Esteio, RS. */
const CENTRO_INICIAL: L.LatLngTuple = [-29.8556, -51.1789];
const ZOOM_INICIAL = 14;

const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

function Chip({ ativo, onClick, cor, children }: { ativo: boolean; onClick: () => void; cor?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
        ativo
          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
          : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {cor && <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white/70" style={{ background: cor }} />}
      {children}
    </button>
  );
}

function iconePino(cor: string, qtd: number) {
  const tam = qtd > 1 ? 28 : 22;
  return L.divIcon({
    className: '',
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${tam}px;height:${tam}px;border-radius:9999px;background:${cor};border:3px solid #fff;box-shadow:0 0 0 1.5px rgba(15,23,42,.7),0 2px 6px rgba(0,0,0,.5);color:#fff;font:700 12px system-ui">${qtd > 1 ? qtd : ''}</span>`,
  });
}

export function Mapa() {
  const { db, atualizar, navegar, toast } = useStore();
  const meses = useMemo(() => mesesComDados(db), [db]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [sits, setSits] = useState<Situacao[]>([]);
  const [ajustar, setAjustar] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const cancelar = useRef<AbortController | null>(null);

  const divMapa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);

  const corDe = useMemo(() => {
    const m = new Map<string | null, string>(db.grupos.map((g, i) => [g.id, CORES[i % CORES.length]]));
    return (id: string | null) => m.get(id) ?? COR_SEM_GRUPO;
  }, [db.grupos]);
  const nomeGrupo = (id: string | null) => db.grupos.find((g) => g.id === id)?.nome ?? 'Sem grupo';

  // Publicadores que passam pelos filtros (com ou sem ponto no mapa).
  const filtrados = useMemo(
    () =>
      db.publicadores.filter(
        (p) =>
          !p.arquivado &&
          (grupos.length === 0 || grupos.includes(p.grupoId ?? SEM)) &&
          (sits.length === 0 || sits.includes(situacao(p, meses))),
      ),
    [db.publicadores, grupos, sits, meses],
  );
  const noMapa = filtrados.filter((p) => localAtual(p));
  const pendentes = filtrados.filter(precisaLocalizar);
  const semEndereco = filtrados.filter((p) => !p.endereco.trim());

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!divMapa.current) return;
    const m = L.map(divMapa.current, { zoomControl: true }).setView(CENTRO_INICIAL, ZOOM_INICIAL);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    mapa.current = m;
    const t = setTimeout(() => m.invalidateSize(), 50);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
    };
  }, []);

  // Desenha os pontos. Pessoas no mesmo endereço (família) viram um pino só, com o número.
  useEffect(() => {
    const c = camada.current;
    if (!c) return;
    c.clearLayers();
    const porPonto = new Map<string, Publicador[]>();
    for (const p of noMapa) {
      const l = localAtual(p)!;
      const k = `${l.lat.toFixed(5)},${l.lng.toFixed(5)}`;
      porPonto.set(k, [...(porPonto.get(k) ?? []), p]);
    }
    for (const pessoas of porPonto.values()) {
      const l = localAtual(pessoas[0])!;
      const marcador = L.marker([l.lat, l.lng], {
        icon: iconePino(corDe(pessoas[0].grupoId), pessoas.length),
        draggable: ajustar,
        title: pessoas.map((p) => p.nome).join(', '),
      });
      const conteudo = document.createElement('div');
      conteudo.className = 'space-y-1 text-sm';
      for (const p of pessoas) {
        const b = document.createElement('button');
        b.className = 'block text-left font-medium text-indigo-600 hover:underline';
        b.textContent = p.nome;
        b.onclick = () => navegar({ nome: 'publicador', id: p.id });
        conteudo.append(b);
      }
      const info = document.createElement('p');
      info.className = 'text-xs text-slate-500';
      info.textContent = `${nomeGrupo(pessoas[0].grupoId)} · ${pessoas[0].endereco}`;
      conteudo.append(info);
      marcador.bindPopup(conteudo);
      marcador.on('dragend', () => {
        const { lat, lng } = marcador.getLatLng();
        const ids = new Set(pessoas.map((p) => p.id));
        atualizar((d) => {
          for (const x of d.publicadores) if (ids.has(x.id)) x.local = { lat, lng, endereco: x.endereco.trim(), manual: true };
        });
      });
      c.addLayer(marcador);
    }
  }, [noMapa.map((p) => `${p.id}:${p.local?.lat},${p.local?.lng},${p.grupoId}`).join('|'), ajustar, corDe]);

  // Enquadra os pontos quando os filtros mudam; ao abrir, fica em Esteio.
  const chaveFiltros = `${grupos.join()}|${sits.join()}`;
  const filtrosAnteriores = useRef(chaveFiltros);
  useEffect(() => {
    if (filtrosAnteriores.current === chaveFiltros) return;
    filtrosAnteriores.current = chaveFiltros;
    const m = mapa.current;
    if (!m) return;
    if (noMapa.length === 0) {
      m.setView(CENTRO_INICIAL, ZOOM_INICIAL);
      return;
    }
    const limites = L.latLngBounds(noMapa.map((p) => [localAtual(p)!.lat, localAtual(p)!.lng]));
    m.fitBounds(limites, { padding: [40, 40], maxZoom: 16 });
  }, [chaveFiltros]);

  async function localizar() {
    const fila = pendentes.map((p) => ({ id: p.id, endereco: p.endereco.trim() }));
    const ctrl = new AbortController();
    cancelar.current = ctrl;
    setFalhas([]);
    setProgresso({ feito: 0, total: fila.length });
    let achados = 0;
    try {
      for (const [i, item] of fila.entries()) {
        if (i > 0) await espera(1100, ctrl.signal);
        const ponto = await geocodificar(consultaEndereco(item.endereco, db.congregacao.cidade ?? ''), ctrl.signal);
        if (ponto) {
          achados++;
          atualizar((d) => {
            const x = d.publicadores.find((y) => y.id === item.id);
            if (x && x.endereco.trim() === item.endereco) x.local = { ...ponto, endereco: item.endereco };
          });
        } else setFalhas((f) => [...f, item.id]);
        setProgresso({ feito: i + 1, total: fila.length });
      }
      toast(`${achados} de ${fila.length} endereços localizados.`, achados === fila.length ? 'ok' : 'info');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(`Não foi possível localizar: ${(e as Error).message}`, 'erro');
    } finally {
      setProgresso(null);
      cancelar.current = null;
    }
  }

  const naoEncontrados = db.publicadores.filter((p) => falhas.includes(p.id));

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Mapa</h1>
        <p className="text-sm text-slate-500">Onde moram os publicadores. Clique num ponto para ver quem mora ali.</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-slate-400">Grupo</span>
        {db.grupos.map((g) => (
          <Chip key={g.id} cor={corDe(g.id)} ativo={grupos.includes(g.id)} onClick={() => setGrupos((x) => alternar(x, g.id))}>
            {g.nome}
          </Chip>
        ))}
        <Chip cor={COR_SEM_GRUPO} ativo={grupos.includes(SEM)} onClick={() => setGrupos((x) => alternar(x, SEM))}>
          Sem grupo
        </Chip>
        <span className="ml-3 mr-1 text-xs font-medium uppercase tracking-wide text-slate-400">Situação</span>
        <Chip ativo={sits.includes('ativo')} onClick={() => setSits((x) => alternar(x, 'ativo'))}>Ativos</Chip>
        <Chip ativo={sits.includes('inativo')} onClick={() => setSits((x) => alternar(x, 'inativo'))}>Inativos</Chip>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400" title="Arraste os pontos para corrigir a posição">
          <Toggle checked={ajustar} onChange={(e) => setAjustar(e.target.checked)} />
          Ajustar pontos
        </label>
      </div>

      <div className="grid min-h-[480px] flex-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div ref={divMapa} className="card z-0 min-h-[420px] overflow-hidden" />

        <aside className="space-y-4">
          <div className="card space-y-3 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <MapPin size={16} className="text-indigo-500" /> {noMapa.length} de {filtrados.length} no mapa
            </p>
            {pendentes.length > 0 && (
              <>
                <p className="text-slate-500">
                  {pendentes.length} {pendentes.length === 1 ? 'endereço ainda não foi localizado' : 'endereços ainda não foram localizados'}.
                </p>
                <label className="block">
                  <span className="label">Cidade para completar os endereços</span>
                  <input
                    className="input"
                    placeholder="Ex.: Campinas - SP"
                    value={db.congregacao.cidade ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      atualizar((d) => {
                        d.congregacao.cidade = v;
                      });
                    }}
                  />
                </label>
                {progresso ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Loader2 size={14} className="animate-spin" /> Localizando {progresso.feito} de {progresso.total}…
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(progresso.feito / progresso.total) * 100}%` }} />
                    </div>
                    <button className="btn-ghost w-full" onClick={() => cancelar.current?.abort()}>
                      <Square size={14} /> Parar
                    </button>
                  </div>
                ) : (
                  <button className="btn-primary w-full" onClick={localizar}>
                    <MapPin size={16} /> Localizar endereços
                  </button>
                )}
                <p className="text-xs text-slate-400">
                  Usa o OpenStreetMap. Só o endereço e a cidade são enviados, nunca o nome. Cerca de um por segundo.
                </p>
              </>
            )}
            {semEndereco.length > 0 && <p className="text-xs text-slate-500">{semEndereco.length} sem endereço no cadastro.</p>}
          </div>

          {naoEncontrados.length > 0 && (
            <div className="card p-4 text-sm">
              <p className="mb-2 flex items-center gap-2 font-semibold">
                <MapPinOff size={16} className="text-amber-500" /> Não encontrados
              </p>
              <p className="mb-2 text-xs text-slate-500">Confira o endereço no cadastro (rua, número e bairro) e tente de novo.</p>
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {naoEncontrados.map((p) => (
                  <li key={p.id}>
                    <button className="w-full text-left hover:underline" onClick={() => navegar({ nome: 'publicador', id: p.id })}>
                      <span className="font-medium">{p.nome}</span>
                      <span className="block truncate text-xs text-slate-500">{p.endereco}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
