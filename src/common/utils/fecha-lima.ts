const DAY_MS = 86_400_000;

/** Día calendario de Lima de una fecha, como timestamp UTC a medianoche. */
function diaLimaUtc(fecha: Date): number {
  const [yyyy, mm, dd] = fecha
    .toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    .split('-')
    .map(Number);
  return Date.UTC(yyyy, mm - 1, dd);
}

/**
 * Días calendario (hora de Lima) que faltan para que venza `fecha`.
 * 0 = vence hoy (sigue vigente hasta fin del día); negativo = ya venció.
 * Única fuente de verdad para todo "vence en X días" de planes/suscripciones:
 * la hora guardada en fechaExpiracion se ignora a propósito, solo cuenta el día.
 */
export function getDiasRestantesLima(
  fecha?: Date | null,
  ahora: Date = new Date(),
): number {
  if (!fecha) return 0;
  return Math.round((diaLimaUtc(fecha) - diaLimaUtc(ahora)) / DAY_MS);
}

/**
 * Prórroga del plan: el día que vence y el día siguiente (hasta las 23:59 de
 * Lima) el cliente todavía puede entrar; desde el segundo día ya no.
 */
export const DIAS_PRORROGA_PLAN = 1;

/** true si el plan venció y ya pasó la prórroga: no se deja entrar. */
export function planBloqueado(
  fechaExpiracion?: Date | null,
  ahora: Date = new Date(),
): boolean {
  if (!fechaExpiracion) return false;
  return getDiasRestantesLima(fechaExpiracion, ahora) < -DIAS_PRORROGA_PLAN;
}

/** Último momento con acceso: 23:59:59 (Lima) del último día de prórroga. */
export function finProrrogaPlan(fechaExpiracion: Date): Date {
  // Lima es UTC-5 todo el año (sin horario de verano): las 23:59:59.999 del
  // día D en Lima son las 04:59:59.999 UTC del día D+1.
  return new Date(
    diaLimaUtc(fechaExpiracion) +
      (DIAS_PRORROGA_PLAN + 1) * DAY_MS +
      5 * 3_600_000 -
      1,
  );
}

/** dd/mm/yyyy de la fecha vista en Lima. */
export function formatFechaLima(fecha?: Date | null): string {
  if (!fecha) return '';
  const [yyyy, mm, dd] = fecha
    .toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    .split('-');
  return `${dd}/${mm}/${yyyy}`;
}
