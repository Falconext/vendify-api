import {
  esOcurrenciaDe,
  estaVencido,
  expandirOcurrencias,
  finDiaLima,
  inicioDiaLima,
  type EventoExpandible,
} from './agenda.fechas';

const d = (iso: string) => new Date(iso);
const isos = (xs: { inicio: Date }[]) => xs.map((x) => x.inicio.toISOString());

const base = (p: Partial<EventoExpandible>): EventoExpandible => ({
  inicio: d('2026-11-02T14:00:00.000Z'), // lunes 09:00 Lima
  fin: null,
  todoElDia: false,
  repeticion: 'NINGUNA',
  repetirHasta: null,
  ...p,
});

describe('Agenda · días en hora de Lima', () => {
  it('el día de Lima empieza a las 05:00 UTC', () => {
    expect(inicioDiaLima(d('2026-11-03T02:00:00Z')).toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
    expect(finDiaLima(d('2026-11-02T05:00:00Z')).toISOString()).toBe(
      '2026-11-03T04:59:59.999Z',
    );
  });
});

describe('Agenda · expansión de repeticiones', () => {
  it('sin repetición: solo aparece si cae en el rango', () => {
    const ev = base({});
    expect(
      expandirOcurrencias(ev, d('2026-11-01T00:00Z'), d('2026-11-08T00:00Z')),
    ).toHaveLength(1);
    expect(
      expandirOcurrencias(ev, d('2026-11-03T00:00Z'), d('2026-11-08T00:00Z')),
    ).toHaveLength(0);
  });

  it('un evento que empezó antes del rango y sigue en curso aparece', () => {
    const ev = base({ fin: d('2026-11-05T14:00:00Z') });
    expect(
      expandirOcurrencias(ev, d('2026-11-04T00:00Z'), d('2026-11-04T23:00Z')),
    ).toHaveLength(1);
  });

  it('todo el día ocupa hasta las 23:59 de Lima', () => {
    const ev = base({ inicio: d('2026-11-02T05:00:00Z'), todoElDia: true });
    // 03/11 03:00 UTC = 02/11 22:00 Lima → sigue siendo ese día.
    expect(
      expandirOcurrencias(ev, d('2026-11-03T03:00Z'), d('2026-11-03T04:00Z')),
    ).toHaveLength(1);
    expect(
      expandirOcurrencias(ev, d('2026-11-03T05:00Z'), d('2026-11-03T06:00Z')),
    ).toHaveLength(0);
  });

  it('diaria: una por día dentro del rango y conserva la hora', () => {
    const ev = base({ repeticion: 'DIARIA' });
    const r = expandirOcurrencias(
      ev,
      d('2026-11-04T05:00Z'),
      d('2026-11-07T04:59:59Z'),
    );
    expect(isos(r)).toEqual([
      '2026-11-04T14:00:00.000Z',
      '2026-11-05T14:00:00.000Z',
      '2026-11-06T14:00:00.000Z',
    ]);
  });

  it('diaria muy antigua: salta directo al rango (no recorre años)', () => {
    const ev = base({
      inicio: d('2020-01-01T14:00:00Z'),
      repeticion: 'DIARIA',
    });
    const r = expandirOcurrencias(
      ev,
      d('2026-11-02T05:00Z'),
      d('2026-11-03T04:59Z'),
    );
    expect(isos(r)).toEqual(['2026-11-02T14:00:00.000Z']);
  });

  it('semanal: mismo día de la semana', () => {
    const ev = base({ repeticion: 'SEMANAL' });
    const r = expandirOcurrencias(
      ev,
      d('2026-11-01T00:00Z'),
      d('2026-11-30T00:00Z'),
    );
    expect(isos(r)).toEqual([
      '2026-11-02T14:00:00.000Z',
      '2026-11-09T14:00:00.000Z',
      '2026-11-16T14:00:00.000Z',
      '2026-11-23T14:00:00.000Z',
    ]);
  });

  it('mensual el 31 cae al último día de los meses cortos', () => {
    const ev = base({
      inicio: d('2027-01-31T15:00:00Z'),
      repeticion: 'MENSUAL',
    });
    const r = expandirOcurrencias(
      ev,
      d('2027-01-01T00:00Z'),
      d('2027-05-01T00:00Z'),
    );
    expect(isos(r)).toEqual([
      '2027-01-31T15:00:00.000Z',
      '2027-02-28T15:00:00.000Z',
      '2027-03-31T15:00:00.000Z',
      '2027-04-30T15:00:00.000Z',
    ]);
  });

  it('mensual del 31 en año bisiesto cae el 29 de febrero', () => {
    const ev = base({
      inicio: d('2028-01-31T15:00:00Z'),
      repeticion: 'MENSUAL',
    });
    const r = expandirOcurrencias(
      ev,
      d('2028-02-01T00:00Z'),
      d('2028-03-01T00:00Z'),
    );
    expect(isos(r)).toEqual(['2028-02-29T15:00:00.000Z']);
  });

  it('mensual a las 23:00 de Lima no se corre de día por el UTC', () => {
    // 31/01 23:00 Lima = 01/02 04:00 UTC
    const ev = base({
      inicio: d('2027-02-01T04:00:00Z'),
      repeticion: 'MENSUAL',
    });
    const r = expandirOcurrencias(
      ev,
      d('2027-02-15T00:00Z'),
      d('2027-03-15T00:00Z'),
    );
    expect(isos(r)).toEqual(['2027-03-01T04:00:00.000Z']); // 28/02 23:00 Lima
  });

  it('"hasta" es inclusivo por día', () => {
    const ev = base({
      repeticion: 'DIARIA',
      repetirHasta: d('2026-11-04T05:00:00Z'),
    });
    const r = expandirOcurrencias(
      ev,
      d('2026-11-01T00:00Z'),
      d('2026-11-30T00:00Z'),
    );
    expect(isos(r)).toEqual([
      '2026-11-02T14:00:00.000Z',
      '2026-11-03T14:00:00.000Z',
      '2026-11-04T14:00:00.000Z',
    ]);
  });

  it('las ocurrencias conservan la duración del evento', () => {
    const ev = base({ repeticion: 'SEMANAL', fin: d('2026-11-02T15:30:00Z') });
    const [, segunda] = expandirOcurrencias(
      ev,
      d('2026-11-01T00:00Z'),
      d('2026-11-12T00:00Z'),
    );
    expect(segunda.fin?.toISOString()).toBe('2026-11-09T15:30:00.000Z');
  });

  it('nada antes del inicio de la serie', () => {
    const ev = base({ repeticion: 'DIARIA' });
    expect(
      expandirOcurrencias(ev, d('2026-10-01T00:00Z'), d('2026-11-01T00:00Z')),
    ).toHaveLength(0);
  });

  it('esOcurrenciaDe reconoce solo inicios exactos de la serie', () => {
    const ev = base({ repeticion: 'SEMANAL' });
    expect(esOcurrenciaDe(ev, d('2026-11-16T14:00:00Z'))).toBe(true);
    expect(esOcurrenciaDe(ev, d('2026-11-17T14:00:00Z'))).toBe(false);
    expect(esOcurrenciaDe(ev, d('2026-10-26T14:00:00Z'))).toBe(false);
  });
});

describe('Agenda · vencido', () => {
  const ahora = d('2026-11-02T20:00:00Z'); // 15:00 Lima
  it('vence cuando pasó su fin (o su inicio si no tiene fin)', () => {
    expect(
      estaVencido(
        { inicio: d('2026-11-02T14:00Z'), fin: null },
        false,
        false,
        ahora,
      ),
    ).toBe(true);
    expect(
      estaVencido(
        { inicio: d('2026-11-02T14:00Z'), fin: d('2026-11-02T21:00Z') },
        false,
        false,
        ahora,
      ),
    ).toBe(false);
  });
  it('hecho nunca está vencido', () => {
    expect(
      estaVencido(
        { inicio: d('2026-11-02T14:00Z'), fin: null },
        false,
        true,
        ahora,
      ),
    ).toBe(false);
  });
  it('todo el día vence recién al terminar el día de Lima', () => {
    expect(
      estaVencido(
        { inicio: d('2026-11-02T05:00Z'), fin: null },
        true,
        false,
        ahora,
      ),
    ).toBe(false);
    expect(
      estaVencido(
        { inicio: d('2026-11-01T05:00Z'), fin: null },
        true,
        false,
        ahora,
      ),
    ).toBe(true);
  });
});
