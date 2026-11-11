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
  /** Créditos de horas (só pioneiro regular). Ausente em relatórios antigos. */
  creditos?: number | null;
  obs: string;
}

export interface Publicador {
  id: string;
  nome: string;
  nascimento: string; // AAAA-MM-DD ou ''
  batismo: string;
  /** Publicador não batizado quando falso. */
  batizado: boolean;
  /** Quando começou como pioneiro regular, AAAA-MM-DD ou ''. */
  inicioPioneiro: string;
  /** Ano em que cursou (ou foi convidado para) a Escola de Pioneiros; null se nunca. */
  escolaPioneiros: number | null;
  /** Convidado, mas não conseguiu cursar ou perdeu mais da metade das aulas: volta a ser convidado no ano seguinte. */
  escolaNaoConcluida: boolean;
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
  /** Ponto no mapa. `endereco` é o texto que foi localizado: se o endereço mudar, precisa localizar de novo. */
  local: Localizacao | null;
  /** Mudou-se, faleceu etc. Não aparece nas listas padrão. */
  arquivado: boolean;
  relatorios: Record<string, RelatorioMes>;
}

export interface Localizacao {
  lat: number;
  lng: number;
  endereco: string;
  /** Ajustado à mão no mapa. */
  manual?: boolean;
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

/** Assistência de um tipo de reunião num mês: quantas houve e o total de presentes (formulário S-88). */
export interface AssistenciaReuniao {
  reunioes: number | null;
  total: number | null;
}

/** Reunião do meio de semana e do fim de semana. */
export type TipoReuniao = 'meio' | 'fim';

export type AssistenciaMes = Partial<Record<TipoReuniao, AssistenciaReuniao>>;

export interface Db {
  versao: 1;
  congregacao: { nome: string; /** Cidade/UF usada para completar os endereços ao localizar no mapa. */ cidade: string };
  grupos: Grupo[];
  publicadores: Publicador[];
  importacoes: Importacao[];
  /** Assistência às reuniões por mês, chave "AAAA-MM". */
  assistencia: Record<string, AssistenciaMes>;
}

export function dbVazio(nomeCongregacao = ''): Db {
  return { versao: 1, congregacao: { nome: nomeCongregacao, cidade: '' }, grupos: [], publicadores: [], importacoes: [], assistencia: {} };
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
    inicioPioneiro: '',
    escolaPioneiros: null,
    escolaNaoConcluida: false,
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
    local: null,
    arquivado: false,
    relatorios: {},
    ...parcial,
  };
}
