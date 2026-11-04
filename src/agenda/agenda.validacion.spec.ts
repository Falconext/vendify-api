import { BadRequestException } from '@nestjs/common';
import {
  validarCompletar,
  validarEvento,
  validarFiltrosListado,
} from './agenda.validacion';

const minimo = {
  titulo: 'Reunión con proveedor',
  tipo: 'REUNION',
  inicio: '2026-11-02T15:00:00.000Z',
};

const falla = (fn: () => unknown, mensaje: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    expect((e as BadRequestException).message).toMatch(mensaje);
    return;
  }
  throw new Error('Se esperaba un 400');
};

describe('Agenda · validación de evento', () => {
  it('aplica los valores por defecto del contrato', () => {
    const r = validarEvento(minimo);
    expect(r).toMatchObject({
      prioridad: 'MEDIA',
      visibilidad: 'PERSONAL',
      repeticion: 'NINGUNA',
      todoElDia: false,
      responsableId: null,
      recordatorioMin: null,
      fin: null,
      descripcion: null,
      lugar: null,
    });
    expect(r.inicio.toISOString()).toBe('2026-11-02T15:00:00.000Z');
  });

  it('ignora claves fuera del contrato', () => {
    const r = validarEvento({
      ...minimo,
      empresaId: 99,
      creadorId: 7,
    }) as unknown as Record<string, unknown>;
    expect(r.empresaId).toBeUndefined();
    expect(r.creadorId).toBeUndefined();
  });

  it('título obligatorio y de hasta 120 caracteres', () => {
    falla(
      () => validarEvento({ ...minimo, titulo: '   ' }),
      /título es obligatorio/,
    );
    falla(() => validarEvento({ ...minimo, titulo: 'x'.repeat(121) }), /120/);
    expect(validarEvento({ ...minimo, titulo: '  Pago luz  ' }).titulo).toBe(
      'Pago luz',
    );
  });

  it('descripción ≤ 2000 y lugar ≤ 300', () => {
    falla(
      () => validarEvento({ ...minimo, descripcion: 'x'.repeat(2001) }),
      /2000/,
    );
    falla(() => validarEvento({ ...minimo, lugar: 'x'.repeat(301) }), /300/);
  });

  it('tipo, prioridad y visibilidad deben ser del catálogo', () => {
    falla(() => validarEvento({ ...minimo, tipo: 'CITA' }), /tipo/);
    falla(
      () => validarEvento({ ...minimo, prioridad: 'URGENTE' }),
      /prioridad/,
    );
    falla(
      () => validarEvento({ ...minimo, visibilidad: 'PUBLICO' }),
      /visibilidad/,
    );
  });

  it('fechas inválidas o absurdas', () => {
    falla(
      () => validarEvento({ ...minimo, inicio: 'mañana' }),
      /inicio no es válida/,
    );
    falla(
      () => validarEvento({ ...minimo, inicio: '1890-01-01T00:00:00Z' }),
      /inicio no es válida/,
    );
    falla(
      () => validarEvento({ ...minimo, inicio: 1730000000000 }),
      /inicio no es válida/,
    );
  });

  it('el fin debe ser posterior al inicio', () => {
    falla(
      () => validarEvento({ ...minimo, fin: minimo.inicio }),
      /posterior al inicio/,
    );
    falla(
      () => validarEvento({ ...minimo, fin: '2026-11-02T14:00:00Z' }),
      /posterior al inicio/,
    );
    expect(
      validarEvento({ ...minimo, fin: '2026-11-02T16:00:00Z' }).fin,
    ).not.toBeNull();
  });

  it('recordatorio solo 15, 60 o 1440', () => {
    falla(
      () => validarEvento({ ...minimo, recordatorioMin: 30 }),
      /15 minutos, 1 hora o 1 día/,
    );
    falla(
      () => validarEvento({ ...minimo, recordatorioMin: '60' }),
      /15 minutos/,
    );
    expect(
      validarEvento({ ...minimo, recordatorioMin: 1440 }).recordatorioMin,
    ).toBe(1440);
  });

  it('todo el día debe ser booleano (no "false" como texto)', () => {
    falla(
      () => validarEvento({ ...minimo, todoElDia: 'false' }),
      /Todo el día/,
    );
  });

  it('responsable: entero positivo', () => {
    falla(() => validarEvento({ ...minimo, responsableId: -3 }), /responsable/);
    falla(
      () => validarEvento({ ...minimo, responsableId: 1.5 }),
      /responsable/,
    );
    expect(validarEvento({ ...minimo, responsableId: 8 }).responsableId).toBe(
      8,
    );
  });

  it('"hasta" no puede ser anterior al inicio y se limpia sin repetición', () => {
    falla(
      () =>
        validarEvento({
          ...minimo,
          repeticion: 'DIARIA',
          repetirHasta: '2026-11-01T05:00:00Z',
        }),
      /anterior al inicio/,
    );
    // mismo día de Lima: válido
    expect(
      validarEvento({
        ...minimo,
        repeticion: 'DIARIA',
        repetirHasta: '2026-11-02',
      }).repetirHasta,
    ).not.toBeNull();
    expect(
      validarEvento({ ...minimo, repetirHasta: '2026-12-01' }).repetirHasta,
    ).toBeNull();
  });

  it('un evento diario no puede durar más de un día', () => {
    falla(
      () =>
        validarEvento({
          ...minimo,
          repeticion: 'DIARIA',
          fin: '2026-11-04T15:00:00Z',
        }),
      /intervalo de su repetición/,
    );
  });

  it('editar: solo pisa lo que llega y revalida las reglas cruzadas', () => {
    const actual = validarEvento({
      ...minimo,
      fin: '2026-11-02T16:00:00Z',
      prioridad: 'ALTA',
    });
    const r = validarEvento({ titulo: 'Nuevo' }, actual);
    expect(r).toMatchObject({
      titulo: 'Nuevo',
      prioridad: 'ALTA',
      tipo: 'REUNION',
    });
    falla(
      () => validarEvento({ inicio: '2026-11-02T17:00:00Z' }, actual),
      /posterior al inicio/,
    );
    expect(validarEvento({ fin: null }, actual).fin).toBeNull();
  });

  it('cuerpo vacío o no objeto', () => {
    falla(() => validarEvento(null), /no son válidos/);
    falla(() => validarEvento([]), /no son válidos/);
  });
});

describe('Agenda · filtros del listado', () => {
  it('rango máximo de 62 días', () => {
    falla(
      () =>
        validarFiltrosListado({
          desde: '2026-11-01T00:00:00Z',
          hasta: '2027-01-03T00:00:00Z',
        }),
      /62 días/,
    );
    expect(() =>
      validarFiltrosListado({
        desde: '2026-11-01T00:00:00Z',
        hasta: '2027-01-02T00:00:00Z',
      }),
    ).not.toThrow();
  });

  it('desde/hasta obligatorios y en orden', () => {
    falla(
      () => validarFiltrosListado({ hasta: '2026-11-01T00:00:00Z' }),
      /desde/,
    );
    falla(
      () =>
        validarFiltrosListado({
          desde: '2026-11-05T00:00:00Z',
          hasta: '2026-11-01T00:00:00Z',
        }),
      /anterior/,
    );
  });

  it('tipos en csv y soloMios', () => {
    const f = validarFiltrosListado({
      desde: '2026-11-01T00:00:00Z',
      hasta: '2026-11-08T00:00:00Z',
      tipos: 'reunion, PAGO',
      soloMios: 'true',
    });
    expect(f.tipos).toEqual(['REUNION', 'PAGO']);
    expect(f.soloMios).toBe(true);
    falla(
      () =>
        validarFiltrosListado({
          desde: '2026-11-01T00:00:00Z',
          hasta: '2026-11-08T00:00:00Z',
          tipos: 'CITA',
        }),
      /CITA/,
    );
  });
});

describe('Agenda · completar', () => {
  it('completado debe ser booleano', () => {
    falla(() => validarCompletar({ completado: 'si' }), /completado/);
    expect(validarCompletar({ completado: false }).completado).toBe(false);
  });
});
