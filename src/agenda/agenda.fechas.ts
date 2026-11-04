/**
 * Fechas de la Agenda: todo se razona en hora de Lima (UTC−5 fijo, Perú no
 * tiene horario de verano) y se guarda/devuelve en UTC.
 *
 * Las repeticiones no se materializan en la BD: aquí se expanden al vuelo.
 */
import type { AgendaRepeticion } from './agenda.tipos';

export const MIN_MS = 60_000;
export const HORA_MS = 60 * MIN_MS;
export const DIA_MS = 24 * HORA_MS;
const OFFSET_LIMA_MS = 5 * HORA_MS;
/** Tope de ocurrencias por evento en una consulta (defensa ante datos raros). */
const MAX_ITERACIONES = 2_000;

interface PartesLima {
  anio: number;
  mes: number; // 0-11
  dia: number;
  /** Milisegundos desde la medianoche de Lima. */
  msDelDia: number;
}

export function partesLima(instante: Date): PartesLima {
  const l = new Date(instante.getTime() - OFFSET_LIMA_MS);
  const medianoche = Date.UTC(
    l.getUTCFullYear(),
    l.getUTCMonth(),
    l.getUTCDate(),
  );
  return {
    anio: l.getUTCFullYear(),
    mes: l.getUTCMonth(),
    dia: l.getUTCDate(),
    msDelDia: l.getTime() - medianoche,
  };
}

/** 00:00:00.000 de Lima del día de `instante`, en UTC. */
export function inicioDiaLima(instante: Date): Date {
  const p = partesLima(instante);
  return new Date(Date.UTC(p.anio, p.mes, p.dia) + OFFSET_LIMA_MS);
}

/** 23:59:59.999 de Lima del día de `instante`, en UTC. */
export function finDiaLima(instante: Date): Date {
  return new Date(inicioDiaLima(instante).getTime() + DIA_MS - 1);
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
}

/** Lo mínimo de un evento que hace falta para expandirlo. */
export interface EventoExpandible {
  inicio: Date;
  fin: Date | null;
  todoElDia: boolean;
  repeticion: AgendaRepeticion;
  repetirHasta: Date | null;
}

export interface Ocurrencia {
  inicio: Date;
  fin: Date | null;
}

/**
 * Inicio de la ocurrencia número `k` (0 = el propio evento).
 * Mensual en día 31 (o 29/30) cae al último día de los meses más cortos.
 */
export function inicioOcurrencia(ev: EventoExpandible, k: number): Date {
  const base = ev.inicio.getTime();
  switch (ev.repeticion) {
    case 'DIARIA':
      return new Date(base + k * DIA_MS);
    case 'SEMANAL':
      return new Date(base + k * 7 * DIA_MS);
    case 'MENSUAL': {
      const p = partesLima(ev.inicio);
      const total = p.mes + k;
      const anio = p.anio + Math.floor(total / 12);
      const mes = ((total % 12) + 12) % 12;
      const dia = Math.min(p.dia, diasDelMes(anio, mes));
      return new Date(Date.UTC(anio, mes, dia) + p.msDelDia + OFFSET_LIMA_MS);
    }
    default:
      return new Date(base);
  }
}

/** Fin de una ocurrencia: conserva la duración del evento base. */
export function finOcurrencia(
  ev: EventoExpandible,
  inicioOcc: Date,
): Date | null {
  if (!ev.fin) return null;
  return new Date(
    inicioOcc.getTime() + (ev.fin.getTime() - ev.inicio.getTime()),
  );
}

/**
 * Hasta cuándo "ocupa" una ocurrencia: su fin, o su inicio si no tiene fin; en
 * un evento de todo el día, el final de ese día (Lima).
 */
export function finEfectivo(occ: Ocurrencia, todoElDia: boolean): Date {
  const ref = occ.fin ?? occ.inicio;
  return todoElDia ? finDiaLima(ref) : ref;
}

/** Último instante en que puede empezar una ocurrencia (`repetirHasta` es inclusivo por día). */
export function limiteSerie(ev: EventoExpandible): Date | null {
  return ev.repetirHasta ? finDiaLima(ev.repetirHasta) : null;
}

/**
 * Ocurrencias del evento que se cruzan con [desde, hasta] (ambos inclusive),
 * ordenadas por inicio.
 */
export function expandirOcurrencias(
  ev: EventoExpandible,
  desde: Date,
  hasta: Date,
): Ocurrencia[] {
  const resultado: Ocurrencia[] = [];
  const d = desde.getTime();
  const h = hasta.getTime();
  const primera: Ocurrencia = { inicio: ev.inicio, fin: ev.fin };
  // Lo que dura cada ocurrencia, contando la extensión al fin del día.
  const span =
    finEfectivo(primera, ev.todoElDia).getTime() - ev.inicio.getTime();

  if (ev.repeticion === 'NINGUNA') {
    if (ev.inicio.getTime() <= h && ev.inicio.getTime() + span >= d)
      resultado.push(primera);
    return resultado;
  }

  // Salta directo cerca de `desde` en vez de recorrer la serie desde su origen.
  let k = 0;
  const atras = d - span - ev.inicio.getTime();
  if (atras > 0) {
    if (ev.repeticion === 'DIARIA') k = Math.floor(atras / DIA_MS);
    else if (ev.repeticion === 'SEMANAL') k = Math.floor(atras / (7 * DIA_MS));
    else {
      const pi = partesLima(ev.inicio);
      const pd = partesLima(new Date(d - span));
      k = Math.max(0, (pd.anio - pi.anio) * 12 + (pd.mes - pi.mes) - 1);
    }
  }

  const limite = limiteSerie(ev)?.getTime() ?? Infinity;
  for (let i = 0; i < MAX_ITERACIONES; i++, k++) {
    const inicio = inicioOcurrencia(ev, k);
    const t = inicio.getTime();
    if (t > h || t > limite) break;
    const occ: Ocurrencia = { inicio, fin: finOcurrencia(ev, inicio) };
    if (finEfectivo(occ, ev.todoElDia).getTime() >= d) resultado.push(occ);
  }
  return resultado;
}

/** `true` si `instante` es exactamente el inicio de una ocurrencia del evento. */
export function esOcurrenciaDe(ev: EventoExpandible, instante: Date): boolean {
  if (ev.repeticion === 'NINGUNA')
    return ev.inicio.getTime() === instante.getTime();
  return expandirOcurrencias(ev, instante, instante).some(
    (o) => o.inicio.getTime() === instante.getTime(),
  );
}

/** Vencido = no hecho y su fin efectivo ya pasó. */
export function estaVencido(
  occ: Ocurrencia,
  todoElDia: boolean,
  completado: boolean,
  ahora: Date,
): boolean {
  return !completado && finEfectivo(occ, todoElDia).getTime() < ahora.getTime();
}

/** "HH:mm" en hora de Lima. */
export function horaLima(instante: Date): string {
  const ms = partesLima(instante).msDelDia;
  const h = Math.floor(ms / HORA_MS);
  const m = Math.floor((ms % HORA_MS) / MIN_MS);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "dd/mm" en hora de Lima. */
export function fechaCortaLima(instante: Date): string {
  const p = partesLima(instante);
  return `${String(p.dia).padStart(2, '0')}/${String(p.mes + 1).padStart(2, '0')}`;
}
