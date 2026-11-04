/**
 * Validación del cuerpo de crear/editar evento. Es pura (sin BD) para poder
 * probar cada regla; lo que depende de la BD (que el responsable sea de la
 * empresa) lo valida el servicio.
 *
 * Solo se leen las claves del contrato: cualquier otra se ignora.
 */
import { BadRequestException } from '@nestjs/common';
import {
  AGENDA_PRIORIDADES,
  AGENDA_RECORDATORIOS,
  AGENDA_REPETICIONES,
  AGENDA_TIPOS,
  AGENDA_VISIBILIDADES,
  RANGO_MAXIMO_DIAS,
  type AgendaEventoDatos,
  type AgendaRecordatorioMin,
  type AgendaRepeticion,
  type AgendaTipo,
} from './agenda.tipos';
import { DIA_MS, inicioDiaLima } from './agenda.fechas';

const MAX_TITULO = 120;
const MAX_DESCRIPCION = 2000;
const MAX_LUGAR = 300;
const ANIO_MIN = 2000;
const ANIO_MAX = 2100;

/** Lo más que puede durar cada ocurrencia de un evento que se repite. */
const DURACION_MAX_POR_REPETICION: Record<AgendaRepeticion, number> = {
  NINGUNA: Infinity,
  DIARIA: DIA_MS,
  SEMANAL: 7 * DIA_MS,
  MENSUAL: 28 * DIA_MS,
};

function error(mensaje: string): never {
  throw new BadRequestException(mensaje);
}

const tiene = (o: Record<string, unknown>, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

function texto(valor: unknown, campo: string, max: number): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string') error(`${campo} debe ser texto.`);
  const limpio = valor.trim();
  if (limpio.length > max)
    error(`${campo} no puede pasar de ${max} caracteres.`);
  return limpio || null;
}

function opcion<T extends string>(
  valor: unknown,
  opciones: readonly T[],
  mensaje: string,
): T {
  if (typeof valor !== 'string' || !opciones.includes(valor as T))
    error(mensaje);
  return valor as T;
}

/** Fecha ISO 8601 válida y razonable. */
export function parseFechaIso(valor: unknown, mensaje: string): Date {
  if (typeof valor !== 'string' || !valor.trim()) error(mensaje);
  // Solo fechas con forma ISO: "2026-11-02" o "2026-11-02T10:00:00Z".
  if (
    !/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(valor.trim())
  )
    error(mensaje);
  // Una fecha sin hora ("2026-11-02") es ese día en Lima, no la medianoche UTC
  // (que en Lima todavía es el día anterior).
  const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(valor.trim());
  const fecha = new Date(
    soloDia ? `${valor.trim()}T05:00:00.000Z` : valor.trim(),
  );
  if (Number.isNaN(fecha.getTime())) error(mensaje);
  const anio = fecha.getUTCFullYear();
  if (anio < ANIO_MIN || anio > ANIO_MAX) error(mensaje);
  return fecha;
}

function fechaOpcional(valor: unknown, mensaje: string): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  return parseFechaIso(valor, mensaje);
}

function booleano(valor: unknown, mensaje: string): boolean {
  if (typeof valor !== 'boolean') error(mensaje);
  return valor;
}

function idUsuario(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'string' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
    error('El responsable no es válido.');
  }
  return n;
}

function recordatorio(valor: unknown): AgendaRecordatorioMin | null {
  if (valor === null || valor === undefined) return null;
  if (!AGENDA_RECORDATORIOS.includes(valor as AgendaRecordatorioMin)) {
    error('El recordatorio debe ser 15 minutos, 1 hora o 1 día antes.');
  }
  return valor as AgendaRecordatorioMin;
}

/**
 * Valida y normaliza. Con `base` (editar) solo se pisan las claves que vengan
 * en el cuerpo y luego se validan las reglas cruzadas sobre el resultado.
 */
export function validarEvento(
  cuerpo: unknown,
  base: AgendaEventoDatos | null = null,
): AgendaEventoDatos {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    error('Los datos del evento no son válidos.');
  }
  const c = cuerpo as Record<string, unknown>;
  const usar = (k: string) => base === null || tiene(c, k);

  const tituloRaw = usar('titulo') ? c.titulo : base!.titulo;
  if (typeof tituloRaw !== 'string' || !tituloRaw.trim())
    error('El título es obligatorio.');
  const titulo = texto(tituloRaw, 'El título', MAX_TITULO)!;

  const tipo: AgendaTipo = usar('tipo')
    ? opcion(
        c.tipo,
        AGENDA_TIPOS,
        'Elige el tipo: reunión, tarea, pago o recordatorio.',
      )
    : base!.tipo;

  const inicio = usar('inicio')
    ? parseFechaIso(c.inicio, 'La fecha de inicio no es válida.')
    : base!.inicio;

  const repeticion = tiene(c, 'repeticion')
    ? opcion(c.repeticion, AGENDA_REPETICIONES, 'La repetición no es válida.')
    : (base?.repeticion ?? 'NINGUNA');

  const datos: AgendaEventoDatos = {
    titulo,
    descripcion:
      tiene(c, 'descripcion') || !base
        ? texto(c.descripcion, 'La descripción', MAX_DESCRIPCION)
        : base.descripcion,
    lugar:
      tiene(c, 'lugar') || !base
        ? texto(c.lugar, 'El lugar o enlace', MAX_LUGAR)
        : base.lugar,
    tipo,
    prioridad: tiene(c, 'prioridad')
      ? opcion(
          c.prioridad,
          AGENDA_PRIORIDADES,
          'La prioridad debe ser baja, media o alta.',
        )
      : (base?.prioridad ?? 'MEDIA'),
    inicio,
    fin:
      tiene(c, 'fin') || !base
        ? fechaOpcional(c.fin, 'La fecha de fin no es válida.')
        : base.fin,
    todoElDia: tiene(c, 'todoElDia')
      ? booleano(c.todoElDia, '"Todo el día" debe ser sí o no.')
      : (base?.todoElDia ?? false),
    visibilidad: tiene(c, 'visibilidad')
      ? opcion(
          c.visibilidad,
          AGENDA_VISIBILIDADES,
          'La visibilidad debe ser personal o equipo.',
        )
      : (base?.visibilidad ?? 'PERSONAL'),
    responsableId:
      tiene(c, 'responsableId') || !base
        ? idUsuario(c.responsableId)
        : base.responsableId,
    repeticion,
    repetirHasta:
      tiene(c, 'repetirHasta') || !base
        ? fechaOpcional(
            c.repetirHasta,
            'La fecha "hasta" de la repetición no es válida.',
          )
        : base.repetirHasta,
    recordatorioMin:
      tiene(c, 'recordatorioMin') || !base
        ? recordatorio(c.recordatorioMin)
        : base.recordatorioMin,
  };

  // ── Reglas cruzadas ──────────────────────────────────────────────────────
  if (datos.fin && datos.fin.getTime() <= datos.inicio.getTime()) {
    error('La fecha de fin debe ser posterior al inicio.');
  }
  if (datos.repeticion === 'NINGUNA') {
    datos.repetirHasta = null;
  } else {
    if (
      datos.repetirHasta &&
      inicioDiaLima(datos.repetirHasta).getTime() <
        inicioDiaLima(datos.inicio).getTime()
    ) {
      error(
        'La fecha "hasta" de la repetición no puede ser anterior al inicio.',
      );
    }
    const duracion = datos.fin
      ? datos.fin.getTime() - datos.inicio.getTime()
      : 0;
    if (duracion > DURACION_MAX_POR_REPETICION[datos.repeticion]) {
      error(
        'Un evento que se repite no puede durar más que el intervalo de su repetición.',
      );
    }
  }
  return datos;
}

export interface FiltrosListado {
  desde: Date;
  hasta: Date;
  tipos: AgendaTipo[] | null;
  soloMios: boolean;
}

/** Query de `GET /agenda/eventos`. */
export function validarFiltrosListado(
  q: Record<string, unknown>,
): FiltrosListado {
  const desde = parseFechaIso(q.desde, 'Indica "desde" como fecha ISO válida.');
  const hasta = parseFechaIso(q.hasta, 'Indica "hasta" como fecha ISO válida.');
  if (hasta.getTime() < desde.getTime())
    error('"hasta" no puede ser anterior a "desde".');
  if (hasta.getTime() - desde.getTime() > RANGO_MAXIMO_DIAS * DIA_MS) {
    error(`El rango no puede pasar de ${RANGO_MAXIMO_DIAS} días.`);
  }
  let tipos: AgendaTipo[] | null = null;
  if (typeof q.tipos === 'string' && q.tipos.trim()) {
    tipos = q.tipos
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .map((t) => opcion(t, AGENDA_TIPOS, `El tipo "${t}" no existe.`));
  }
  const soloMios =
    q.soloMios === true || q.soloMios === 'true' || q.soloMios === '1';
  return { desde, hasta, tipos, soloMios };
}

export interface CompletarInput {
  ocurrencia: Date | null;
  completado: boolean;
}

export function validarCompletar(cuerpo: unknown): CompletarInput {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    error('Los datos no son válidos.');
  }
  const c = cuerpo as Record<string, unknown>;
  return {
    completado: booleano(
      c.completado,
      'Indica si el evento quedó hecho (completado: true o false).',
    ),
    ocurrencia: fechaOpcional(
      c.ocurrencia,
      'La ocurrencia no es una fecha válida.',
    ),
  };
}
