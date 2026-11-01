export type Sexo = 'M' | 'F';
export type Esperanca = 'outras_ovelhas' | 'ungido';
export type Privilegio =
  | 'anciao'
  | 'servo_ministerial'
  | 'pioneiro_regular'
  | 'pioneiro_especial'
  | 'missionario';

export const PRIVILEGIOS: { id: Privilegio; label: string; curto: string }[] = [
  { id: 'anciao', label: 'Ancião', curto: 'A' },
  { id: 'servo_ministerial', label: 'Servo ministerial', curto: 'SM' },
  { id: 'pioneiro_regular', label: 'Pioneiro regular', curto: 'PR' },
  { id: 'pioneiro_especial', label: 'Pioneiro especial', curto: 'PE' },
  { id: 'missionario', label: 'Missionário em campo', curto: 'MC' },
];

/** Relatório de um mês, chave "AAAA-MM". */
export interface RelatorioMes {
  participou: boolean;
  estudos: number | null;
  auxiliar: boolean;
  horas: number | null;
  obs: string;
}

export interface Publicador {
  id: string;
  nome: string;
  nascimento: string; // AAAA-MM-DD ou ''
  batismo: string;
  /** Publicador não batizado quando falso. */
  batizado: boolean;
  sexo: Sexo;
  esperanca: Esperanca;
  privilegios: Privilegio[];
  grupoId: string | null;
  telefone: string;
  endereco: string;
  anotacoes: string;
  /** Marcado como inativo manualmente. Volta a ativo ao relatar participação num relatório importado. */
  inativo: boolean;
  /** Pioneiro auxiliar todo mês até avisar que parou. */
  auxiliarPermanente: boolean;
  /** Meses ("AAAA-MM") em que foi designado pioneiro auxiliar, mesmo antes de relatar. */
  auxiliarMeses: string[];
  /** Mudou-se, faleceu etc. Não aparece nas listas padrão. */
  arquivado: boolean;
  relatorios: Record<string, RelatorioMes>;
}

export interface Grupo {
  id: string;
  nome: string;
  superintendenteId: string | null;
  ajudanteId: string | null;
}

export interface Importacao {
  mes: string;
  arquivo: string;
  data: string;
  registros: number;
}

export interface Db {
  versao: 1;
  congregacao: { nome: string };
  grupos: Grupo[];
  publicadores: Publicador[];
  importacoes: Importacao[];
}

export function dbVazio(nomeCongregacao = ''): Db {
  return { versao: 1, congregacao: { nome: nomeCongregacao }, grupos: [], publicadores: [], importacoes: [] };
}

/** Designado pioneiro auxiliar no mês (permanente ou só naquele mês). Não olha o relatório. */
export function auxiliarNoMes(p: Publicador, mes: string): boolean {
  return p.auxiliarPermanente || p.auxiliarMeses.includes(mes);
}

export function novoId(): string {
  return crypto.randomUUID();
}

export function novoPublicador(parcial: Partial<Publicador> = {}): Publicador {
  return {
    id: novoId(),
    nome: '',
    nascimento: '',
    batismo: '',
    batizado: true,
    sexo: 'M',
    esperanca: 'outras_ovelhas',
    privilegios: [],
    grupoId: null,
    telefone: '',
    endereco: '',
    anotacoes: '',
    inativo: false,
    auxiliarPermanente: false,
    auxiliarMeses: [],
    arquivado: false,
    relatorios: {},
    ...parcial,
  };
}
