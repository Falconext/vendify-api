/**
 * Contrato de la Agenda (Mi negocio → Agenda). Es el mismo que consumen la web
 * y la app: no cambiar nombres ni formas sin cambiarlo en las tres capas.
 */

export const AGENDA_TIPOS = [
  'REUNION',
  'TAREA',
  'PAGO',
  'RECORDATORIO',
] as const;
export const AGENDA_PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA'] as const;
export const AGENDA_VISIBILIDADES = ['PERSONAL', 'EQUIPO'] as const;
export const AGENDA_REPETICIONES = [
  'NINGUNA',
  'DIARIA',
  'SEMANAL',
  'MENSUAL',
] as const;
export const AGENDA_RECORDATORIOS = [15, 60, 1440] as const;

export type AgendaTipo = (typeof AGENDA_TIPOS)[number];
export type AgendaPrioridad = (typeof AGENDA_PRIORIDADES)[number];
export type AgendaVisibilidad = (typeof AGENDA_VISIBILIDADES)[number];
export type AgendaRepeticion = (typeof AGENDA_REPETICIONES)[number];
export type AgendaRecordatorioMin = (typeof AGENDA_RECORDATORIOS)[number];

export interface AgendaUsuarioMin {
  id: number;
  nombre: string;
}

export interface AgendaOcurrencia {
  /** `${eventoId}:${inicioISO}` */
  id: string;
  eventoId: number;
  titulo: string;
  descripcion: string | null;
  lugar: string | null;
  tipo: AgendaTipo;
  prioridad: AgendaPrioridad;
  visibilidad: AgendaVisibilidad;
  inicio: string;
  fin: string | null;
  todoElDia: boolean;
  repeticion: AgendaRepeticion;
  repetirHasta: string | null;
  recordatorioMin: AgendaRecordatorioMin | null;
  completado: boolean;
  vencido: boolean;
  creador: AgendaUsuarioMin;
  responsable: AgendaUsuarioMin | null;
  puedeEditar: boolean;
  puedeCompletar: boolean;
}

export interface AgendaResumen {
  hoy: AgendaOcurrencia[];
  proximos: AgendaOcurrencia[];
  vencidos: number;
}

/** Datos de un evento ya validados y normalizados (lo que se guarda). */
export interface AgendaEventoDatos {
  titulo: string;
  descripcion: string | null;
  lugar: string | null;
  tipo: AgendaTipo;
  prioridad: AgendaPrioridad;
  inicio: Date;
  fin: Date | null;
  todoElDia: boolean;
  visibilidad: AgendaVisibilidad;
  responsableId: number | null;
  repeticion: AgendaRepeticion;
  repetirHasta: Date | null;
  recordatorioMin: AgendaRecordatorioMin | null;
}

/** Evento tal como sale de la BD (con creador y responsable). */
export interface AgendaEventoRegistro extends AgendaEventoDatos {
  id: number;
  empresaId: number;
  creadorId: number;
  creador: AgendaUsuarioMin;
  responsable: AgendaUsuarioMin | null;
}

/** Quien hace la petición. */
export interface AgendaActor {
  id: number;
  rol: string;
  empresaId: number;
}

export const MENSAJE_PLAN_SIN_AGENDA =
  'Tu plan no incluye la Agenda. Consulta con tu proveedor para activarla.';

export const RANGO_MAXIMO_DIAS = 62;
