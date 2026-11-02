import { useRef, useState } from 'react';
import { Download, FolderOpen, KeyRound, Package, Upload } from 'lucide-react';
import { useStore } from '../store/store';
import { exportarPacote, salvarArquivoGerado } from '../storage/storage';
import { senhaValida } from './Acesso';
import { Campo, Confirmar } from '../components/ui';
import type { Db } from '../domain/types';
import { textoVersao } from '../versao';

export const CHAVE_BLOQUEIO = 'publicadores.bloqueioMin';
export function minutosBloqueio(): number {
  try {
    return Number(localStorage.getItem(CHAVE_BLOQUEIO) ?? 0);
  } catch {
    return 0;
  }
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{titulo}</h2>
      {descricao && <p className="mb-4 mt-0.5 text-sm text-slate-500">{descricao}</p>}
      {children}
    </section>
  );
}

export function Config() {
  const { db, arm, atualizar, trocarSenha, trocarArquivo, substituirDb, toast } = useStore();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erroSenha, setErroSenha] = useState('');
  const [bloqueio, setBloqueio] = useState(minutosBloqueio());
  const [restaurar, setRestaurar] = useState<Db | null>(null);
  const inputJson = useRef<HTMLInputElement>(null);

  async function mudarSenha() {
    setErroSenha('');
    if (!senhaValida(nova)) return setErroSenha('Use um PIN de 4 dígitos ou uma senha com 6+ caracteres.');
    if (nova !== confirma) return setErroSenha('Os PINs novos não conferem.');
    try {
      await trocarSenha(atual, nova);
      setAtual(''); setNova(''); setConfirma('');
      toast('PIN alterado.');
    } catch (e) {
      setErroSenha((e as Error).message);
    }
  }

  async function pacote() {
    try {
      if (arm && (await exportarPacote(arm))) toast('Pacote gerado.');
    } catch (e) {
      toast((e as Error).message, 'erro');
    }
  }

  async function carregarJson(f: File) {
    try {
      const d = JSON.parse(await f.text()) as Db;
      if (!Array.isArray(d.publicadores) || !Array.isArray(d.grupos)) throw new Error('Arquivo não parece um backup deste sistema.');
      setRestaurar(d);
    } catch (e) {
      toast((e as Error).message, 'erro');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">Configurações</h1>

      <Secao titulo="Congregação">
        <Campo rotulo="Nome da congregação">
          <input className="input" value={db.congregacao.nome} onChange={(e) => { const v = e.target.value; atualizar((d) => { d.congregacao.nome = v; }); }} />
        </Campo>
      </Secao>

      <Secao titulo="Arquivo de dados" descricao="Os dados ficam criptografados neste arquivo. Deixe-o numa pasta do OneDrive ou Google Drive para ter backup na nuvem.">
        <p className="mb-3 break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs dark:bg-slate-800">{arm?.descricao}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={trocarArquivo}><FolderOpen size={16} /> Abrir outro arquivo</button>
          {arm?.tipo === 'tauri' && (
            <button className="btn-outline" onClick={pacote}>
              <Package size={16} /> Exportar pacote para enviar
            </button>
          )}
        </div>
        {arm?.tipo === 'tauri' ? (
          <p className="mt-2 text-xs text-slate-500">
            O pacote (.zip) contém o programa e o arquivo de dados. Quem receber só precisa extrair, abrir e digitar o PIN.
            Cópias de segurança automáticas ficam na pasta "backups" ao lado do arquivo.
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Para outra pessoa usar: envie o link deste aplicativo e o arquivo <code>.pub</code> (ou compartilhe a pasta do
            OneDrive). Ela abre o link no Chrome ou Edge, clica em <b>Instalar</b>, escolhe o arquivo e digita o PIN. O
            histórico de versões do OneDrive serve de backup.
          </p>
        )}
      </Secao>

      <Secao titulo="Segurança">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="PIN atual"><input className="input" type="password" value={atual} onChange={(e) => setAtual(e.target.value)} /></Campo>
          <Campo rotulo="Novo PIN ou senha"><input className="input" type="password" value={nova} onChange={(e) => setNova(e.target.value)} /></Campo>
          <Campo rotulo="Repita"><input className="input" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} /></Campo>
        </div>
        {erroSenha && <p className="mt-2 text-sm text-rose-600">{erroSenha}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-xs text-slate-500">
            Um PIN de 4 dígitos protege bem contra acesso casual, mas é fraco se alguém tiver o arquivo e tentar todas as combinações. Uma senha de 6+ caracteres é mais segura.
          </p>
          <button className="btn-primary" disabled={!atual || !nova} onClick={mudarSenha}><KeyRound size={16} /> Alterar</button>
        </div>
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Campo rotulo="Bloquear automaticamente após inatividade">
            <select className="input w-auto" value={bloqueio} onChange={(e) => {
              const v = Number(e.target.value);
              setBloqueio(v);
              try { localStorage.setItem(CHAVE_BLOQUEIO, String(v)); } catch { /* ignore */ }
            }}>
              {[5, 10, 15, 30, 60, 0].map((m) => <option key={m} value={m}>{m ? `${m} minutos` : 'Nunca'}</option>)}
            </select>
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Exportar / restaurar (JSON aberto)" descricao="Gera um JSON NÃO criptografado com todos os dados. Guarde-o com cuidado.">
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => salvarArquivoGerado(`publicadores-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2), 'application/json')}>
            <Download size={16} /> Exportar JSON
          </button>
          <button className="btn-outline" onClick={() => inputJson.current?.click()}><Upload size={16} /> Restaurar de JSON</button>
          <input ref={inputJson} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) carregarJson(f); e.target.value = ''; }} />
        </div>
      </Secao>

      <Secao titulo="Sobre">
        <p className="text-sm text-slate-500">
          Versão <span className="font-mono text-slate-700 dark:text-slate-300">{textoVersao}</span>
        </p>
      </Secao>

      <Confirmar
        aberto={!!restaurar}
        perigo
        titulo="Restaurar dados"
        textoBotao="Substituir tudo"
        mensagem={<>Isto substitui <b>todos</b> os dados atuais por {restaurar?.publicadores.length} publicadores e {restaurar?.grupos.length} grupos do arquivo. Continuar?</>}
        onFechar={() => setRestaurar(null)}
        onConfirmar={() => { if (restaurar) { substituirDb(restaurar); toast('Dados restaurados.'); } }}
      />
    </div>
  );
}
