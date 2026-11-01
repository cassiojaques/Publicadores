import { useState, type FormEvent } from 'react';
import { FilePlus2, FolderOpen, Loader2, Lock, Users } from 'lucide-react';
import { useStore } from '../store/store';
import { escolherArquivoExistente, escolherNovoArquivo, ehTauri, temFsAccess } from '../storage/storage';
import { SenhaIncorretaError } from '../crypto/crypto';

export function senhaValida(s: string) {
  return /^\d{4}$/.test(s) || s.length >= 6;
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-sky-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/40">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400">
          <Users size={28} />
          <span className="text-xl font-semibold text-slate-800 dark:text-slate-100">Publicadores</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Desbloquear() {
  const { arm, desbloquear, trocarArquivo } = useStore();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [falhas, setFalhas] = useState(0);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!senha || carregando) return;
    setCarregando(true);
    setErro('');
    try {
      // Atraso progressivo após várias tentativas erradas.
      if (falhas >= 3) await new Promise((r) => setTimeout(r, Math.min(falhas - 2, 10) * 1000));
      await desbloquear(senha);
    } catch (err) {
      setFalhas((f) => f + 1);
      setErro(err instanceof SenhaIncorretaError ? 'PIN incorreto.' : (err as Error).message);
      setSenha('');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Moldura>
      <form onSubmit={enviar} className="card p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span className="rounded-full bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Lock size={22} />
          </span>
          <h1 className="text-lg font-semibold">Digite o PIN</h1>
          <p className="max-w-full truncate text-xs text-slate-500" title={arm?.descricao}>
            {arm?.descricao}
          </p>
        </div>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          className="input text-center text-2xl tracking-[0.5em]"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="••••"
          aria-label="PIN"
        />
        {erro && <p className="mt-2 text-center text-sm text-rose-600">{erro}</p>}
        <button className="btn-primary mt-4 w-full" disabled={!senha || carregando}>
          {carregando ? <Loader2 className="animate-spin" size={16} /> : 'Entrar'}
        </button>
        <button type="button" className="btn-ghost mt-2 w-full text-xs" onClick={trocarArquivo}>
          Usar outro arquivo de dados
        </button>
      </form>
    </Moldura>
  );
}

export function EscolherArquivo() {
  const { definirArmazenamento, criar } = useStore();
  const [modo, setModo] = useState<'inicio' | 'criar'>('inicio');
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function abrir() {
    setErro('');
    try {
      const arm = await escolherArquivoExistente();
      if (arm) definirArmazenamento(arm);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function enviarCriar(e: FormEvent) {
    e.preventDefault();
    if (!senhaValida(senha)) return setErro('Use um PIN de 4 dígitos ou uma senha com 6+ caracteres.');
    if (senha !== confirma) return setErro('Os PINs não conferem.');
    setErro('');
    setCarregando(true);
    try {
      const arm = await escolherNovoArquivo();
      if (arm) await criar(arm, senha, nome.trim());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  if (modo === 'criar')
    return (
      <Moldura>
        <form onSubmit={enviarCriar} className="card space-y-4 p-6">
          <h1 className="text-lg font-semibold">Novo arquivo de dados</h1>
          <label className="block">
            <span className="label">Nome da congregação</span>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">PIN (4 dígitos)</span>
              <input
                className="input tracking-widest"
                type="password"
                inputMode="numeric"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Repita o PIN</span>
              <input
                className="input tracking-widest"
                type="password"
                inputMode="numeric"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Os dados ficam criptografados com este PIN. Sem ele não é possível recuperá-los. Você também pode usar uma
            senha mais longa (6+ caracteres) para mais segurança.
          </p>
          {!ehTauri() && !temFsAccess() && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              Este navegador não permite gravar arquivos; os dados ficarão salvos apenas neste navegador.
            </p>
          )}
          {erro && <p className="text-sm text-rose-600">{erro}</p>}
          <div className="flex justify-between gap-2">
            <button type="button" className="btn-ghost" onClick={() => setModo('inicio')}>
              Voltar
            </button>
            <button className="btn-primary" disabled={carregando}>
              {carregando && <Loader2 className="animate-spin" size={16} />}
              Escolher pasta e criar
            </button>
          </div>
        </form>
      </Moldura>
    );

  return (
    <Moldura>
      <div className="card space-y-3 p-6">
        <h1 className="text-center text-lg font-semibold">Bem-vindo</h1>
        <p className="text-center text-sm text-slate-500">
          Nenhum arquivo de dados foi encontrado. Crie um novo ou abra um arquivo <code>.pub</code> existente (por
          exemplo, numa pasta do OneDrive ou Google Drive).
        </p>
        <button className="btn-primary w-full" onClick={() => setModo('criar')}>
          <FilePlus2 size={16} /> Criar novo arquivo
        </button>
        <button className="btn-outline w-full" onClick={abrir}>
          <FolderOpen size={16} /> Abrir arquivo existente
        </button>
        {erro && <p className="text-sm text-rose-600">{erro}</p>}
      </div>
    </Moldura>
  );
}
