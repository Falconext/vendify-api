import { finProrrogaPlan, planBloqueado } from './fecha-lima';
import { avisoVencimientoPlan } from './aviso-plan';

// Hora de Lima (UTC-5) → Date.
const lima = (iso: string) => new Date(`${iso}-05:00`);

describe('prórroga del plan', () => {
  // Así se guarda un plan que vence el 12/11 en Lima (medianoche UTC del 13).
  const vence = new Date('2026-11-13T00:00:00.000Z');

  it('el día que vence puede entrar, también de noche (antes se bloqueaba a las 7 p.m.)', () => {
    expect(planBloqueado(vence, lima('2026-11-12T19:30:00'))).toBe(false);
    expect(planBloqueado(vence, lima('2026-11-12T23:59:00'))).toBe(false);
  });

  it('al día siguiente tiene prórroga hasta las 11:59 p.m.', () => {
    expect(planBloqueado(vence, lima('2026-11-13T08:00:00'))).toBe(false);
    expect(planBloqueado(vence, lima('2026-11-13T23:59:59'))).toBe(false);
  });

  it('pasada la prórroga ya no puede entrar', () => {
    expect(planBloqueado(vence, lima('2026-11-14T00:00:01'))).toBe(true);
    expect(planBloqueado(vence, lima('2026-12-01T10:00:00'))).toBe(true);
  });

  it('fin de prórroga = 23:59:59 de Lima del día siguiente al vencimiento', () => {
    expect(finProrrogaPlan(vence).toISOString()).toBe('2026-11-14T04:59:59.999Z');
  });

  it('sin fecha de vencimiento no bloquea', () => {
    expect(planBloqueado(null)).toBe(false);
  });
});

describe('aviso de vencimiento al cliente', () => {
  const vence = new Date('2026-11-13T00:00:00.000Z'); // 12/11 en Lima
  const aviso = (iso: string) => avisoVencimientoPlan(vence, lima(iso));

  it('avisa los días que faltan desde 7 días antes', () => {
    expect(aviso('2026-11-04T09:00:00')).toBeNull();
    expect(aviso('2026-11-05T09:00:00')).toMatchObject({
      tipo: 'INFO',
      mensaje: expect.stringContaining('Te faltan 7 días para que venza tu plan (12/11/2026)'),
    });
    expect(aviso('2026-11-09T09:00:00')).toMatchObject({
      tipo: 'WARNING',
      mensaje: expect.stringContaining('Te faltan 3 días'),
    });
    expect(aviso('2026-11-11T09:00:00')?.mensaje).toContain('vence mañana (12/11/2026)');
  });

  it('el día que vence avisa la prórroga hasta el día siguiente', () => {
    expect(aviso('2026-11-12T09:00:00')).toMatchObject({
      tipo: 'CRITICAL',
      mensaje: expect.stringContaining('Tienes prórroga hasta mañana 13/11/2026 a las 11:59 p.m.'),
    });
  });

  it('en la prórroga avisa que hoy se bloquea, y después ya no avisa', () => {
    expect(aviso('2026-11-13T09:00:00')?.mensaje).toContain('Hoy es tu último día de prórroga');
    expect(aviso('2026-11-14T09:00:00')).toBeNull();
  });
});
