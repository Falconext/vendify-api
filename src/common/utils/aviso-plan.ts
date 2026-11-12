import {
  DIAS_PRORROGA_PLAN,
  finProrrogaPlan,
  formatFechaLima,
  getDiasRestantesLima,
} from './fecha-lima';

/** Desde cuántos días antes del vencimiento se avisa al cliente. */
export const DIAS_AVISO_PLAN = 7;

export interface AvisoPlan {
  tipo: 'INFO' | 'WARNING' | 'CRITICAL';
  mensaje: string;
}

/**
 * Aviso al cliente sobre el vencimiento de su plan, o null si no toca avisar
 * (faltan más de 7 días, o ya pasó la prórroga y no puede entrar).
 */
export function avisoVencimientoPlan(
  fechaExpiracion: Date,
  ahora: Date = new Date(),
): AvisoPlan | null {
  const dias = getDiasRestantesLima(fechaExpiracion, ahora);
  if (dias > DIAS_AVISO_PLAN || dias < -DIAS_PRORROGA_PLAN) return null;

  const vence = formatFechaLima(fechaExpiracion);
  const fin = formatFechaLima(finProrrogaPlan(fechaExpiracion));
  const renovar = 'Comunícate con tu asesor para renovarlo.';

  if (dias < 0) {
    return {
      tipo: 'CRITICAL',
      mensaje: `Tu plan venció el ${vence}. Hoy es tu último día de prórroga: a las 11:59 p.m. se bloqueará el acceso al sistema. ${renovar}`,
    };
  }
  if (dias === 0) {
    return {
      tipo: 'CRITICAL',
      mensaje: `Tu plan vence hoy. Tienes prórroga hasta mañana ${fin} a las 11:59 p.m.; después ya no podrás entrar al sistema. ${renovar}`,
    };
  }
  if (dias === 1) {
    return {
      tipo: 'CRITICAL',
      mensaje: `Tu plan vence mañana (${vence}). ${renovar}`,
    };
  }
  return {
    tipo: dias <= 3 ? 'WARNING' : 'INFO',
    mensaje: `Te faltan ${dias} días para que venza tu plan (${vence}). ${renovar}`,
  };
}
