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
export function getDiasRestantesLima(fecha?: Date | null): number {
  if (!fecha) return 0;
  return Math.round((diaLimaUtc(fecha) - diaLimaUtc(new Date())) / DAY_MS);
}

/** dd/mm/yyyy de la fecha vista en Lima. */
export function formatFechaLima(fecha?: Date | null): string {
  if (!fecha) return '';
  const [yyyy, mm, dd] = fecha
    .toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    .split('-');
  return `${dd}/${mm}/${yyyy}`;
}
