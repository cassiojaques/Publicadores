import { useEffect, useState } from 'react';
import { formatarData, interpretarData } from '../domain/serviceYear';

/**
 * Campo de data em texto (dd/mm/aaaa) que aceita colar em vários formatos
 * — 15/03/1990, 1990-03-15, 15.03.90, "15 de março de 1990" — e guarda "AAAA-MM-DD".
 */
export function CampoData({
  valor,
  onChange,
  disabled,
  rotulo,
}: {
  valor: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  rotulo: string;
}) {
  const [texto, setTexto] = useState(formatarData(valor));
  const [invalido, setInvalido] = useState(false);

  // Sincroniza quando o valor muda por fora (abrir outro publicador, marcar "não batizado").
  useEffect(() => {
    if (interpretarData(texto) !== valor) {
      setTexto(formatarData(valor));
      setInvalido(false);
    }
  }, [valor]);

  function mudar(novo: string, digitando: boolean) {
    // Ao digitar só números, insere as barras: 15031990 → 15/03/1990.
    if (digitando && /^\d+$/.test(novo.replace(/\//g, '')) && novo.length > texto.length) {
      const d = novo.replace(/\D/g, '').slice(0, 8);
      novo = [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
    }
    setTexto(novo);
    if (!novo.trim()) {
      setInvalido(false);
      onChange('');
      return;
    }
    const iso = interpretarData(novo);
    setInvalido(!iso);
    if (iso) onChange(iso);
  }

  return (
    <input
      className={`input ${invalido ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : ''}`}
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      aria-label={rotulo}
      aria-invalid={invalido}
      disabled={disabled}
      value={texto}
      onChange={(e) => mudar(e.target.value, (e.nativeEvent as InputEvent).inputType !== 'insertFromPaste')}
      onBlur={() => {
        const iso = interpretarData(texto);
        if (iso) setTexto(formatarData(iso));
      }}
    />
  );
}
