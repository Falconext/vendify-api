import { ComprobanteService } from './comprobante.service';

/**
 * Rellenar el hueco que deja un comprobante rechazado por SUNAT.
 *
 * Caso real (IMPORTEMOS JUNTOS, serie B0A1): a la boleta 10 la rechazó SUNAT
 * por datos, el sistema la borró, pero la persona rehizo la venta 32 segundos
 * después y esa se llevó el 11. El 10 quedó vacío para siempre. Pasó 5 veces
 * en 266 boletas.
 *
 * Lo que de verdad hay que proteger es que el relleno NO rompa la cronología:
 * SUNAT exige que dentro de una serie, a número mayor le toque fecha igual o
 * posterior. Un comprobante de hoy con el número de junio es peor que el hueco.
 */
describe('Relleno de huecos en el correlativo', () => {
  const montar = (hueco: { hueco: number; antes: string; despues: string } | null) => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(
        hueco
          ? [
              {
                hueco: hueco.hueco,
                fecha_antes: new Date(hueco.antes),
                fecha_despues: new Date(hueco.despues),
              },
            ]
          : [],
      ),
    };
    const deps = Array(7).fill({}) as [any, any, any, any, any, any, any];
    return new ComprobanteService(prisma as any, ...deps);
  };

  const pedir = (service: any, fecha: string) =>
    service.correlativoDeHueco(14, '03', 'B0A1', new Date(fecha));

  it('el hueco recién abierto se rellena: sus vecinos son del mismo día', async () => {
    // Rechazo a las 23:28 y reintento a las 23:29 del mismo día.
    const s = montar({ hueco: 10, antes: '2026-06-12T23:28:46Z', despues: '2026-06-12T23:29:18Z' });
    await expect(pedir(s, '2026-06-12T23:30:00Z')).resolves.toBe(10);
  });

  it('el hueco viejo se deja quieto', async () => {
    // El 10 es de junio; hoy es octubre. Llenarlo pondría una boleta de octubre
    // entre dos de junio, que es la inversión que marcó la contadora.
    const s = montar({ hueco: 10, antes: '2026-06-12T23:28:46Z', despues: '2026-06-12T23:29:18Z' });
    await expect(pedir(s, '2026-10-13T10:00:00Z')).resolves.toBeNull();
  });

  it('tampoco se rellena con una fecha anterior al número previo', async () => {
    // Emitir con fecha retroactiva no habilita colarse en un hueco posterior.
    const s = montar({ hueco: 10, antes: '2026-06-12T23:28:46Z', despues: '2026-06-14T10:00:00Z' });
    await expect(pedir(s, '2026-06-10T10:00:00Z')).resolves.toBeNull();
  });

  it('una fecha entre los dos vecinos sí entra', async () => {
    const s = montar({ hueco: 10, antes: '2026-06-12T12:00:00Z', despues: '2026-06-15T12:00:00Z' });
    await expect(pedir(s, '2026-06-14T09:00:00Z')).resolves.toBe(10);
  });

  it('una fecha guardada SIN hora no se corre un día al compararla', async () => {
    /**
     * El que se me escapó y encontró la prueba en el navegador.
     *
     * El formulario manda "2026-10-13" y eso queda como medianoche UTC. Al
     * convertirlo a Lima daba 2026-10-12 — un día antes — así que una boleta
     * emitida hoy no calzaba con un hueco cuyo vecino siguiente era de hoy, y
     * el relleno no ocurría nunca en el caso real.
     */
    const s = montar({
      hueco: 52,
      antes: '2026-10-06T05:11:19Z',   // instante real
      despues: '2026-10-13T00:00:00Z', // fecha suelta: significa el 13
    });
    await expect(pedir(s, '2026-10-13T19:30:00Z')).resolves.toBe(52);
  });

  it('sin huecos no devuelve nada y la serie sigue por el final', async () => {
    const s = montar(null);
    await expect(pedir(s, '2026-10-13T10:00:00Z')).resolves.toBeNull();
  });

  it('compara por DÍA, no por hora: el mismo día siempre entra', async () => {
    // Si comparara con la hora exacta, un reintento a las 23:30 quedaría fuera
    // de un hueco cuyo vecino siguiente es de las 23:29 — y es el caso típico.
    const s = montar({ hueco: 10, antes: '2026-06-12T08:00:00Z', despues: '2026-06-12T09:00:00Z' });
    await expect(pedir(s, '2026-06-12T23:59:00Z')).resolves.toBe(10);
  });
});

/**
 * Vendify: con Jamble existe JAMBLE_CORRELATIVO_FLOOR, que marca desde dónde
 * numera este sistema porque los números de abajo se emitieron fuera. Esos no
 * son huecos: están usados en SUNAT y reusarlos duplicaría el comprobante.
 */
describe('Relleno de huecos con piso de Jamble', () => {
  const ORIGINAL = process.env.JAMBLE_CORRELATIVO_FLOOR;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.JAMBLE_CORRELATIVO_FLOOR;
    else process.env.JAMBLE_CORRELATIVO_FLOOR = ORIGINAL;
  });

  const montar = (hueco: number) => {
    const hoy = new Date();
    const prisma = {
      empresa: {
        findUnique: jest.fn().mockResolvedValue({ billingProvider: 'JAMBLE', usaDemo: false }),
      },
      empresaSerie: { findFirst: jest.fn().mockResolvedValue(null) },
      comprobante: { findFirst: jest.fn().mockResolvedValue({ id: 1, correlativo: 80 }) },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ hueco, fecha_antes: hoy, fecha_despues: hoy }]),
    };
    const deps = Array(7).fill({}) as [any, any, any, any, any, any, any];
    return new ComprobanteService(prisma as any, ...deps) as any;
  };

  it('un hueco por debajo del piso no se toma', async () => {
    process.env.JAMBLE_CORRELATIVO_FLOOR = '14:B001:60';
    const s = montar(30);
    const r = await s.obtenerSerieYCorrelativo('03', null, 14, new Date());
    expect(r).toEqual({ serie: 'B001', correlativo: 81 });
  });

  it('un hueco desde el piso en adelante sí se toma', async () => {
    process.env.JAMBLE_CORRELATIVO_FLOOR = '14:B001:60';
    const s = montar(70);
    const r = await s.obtenerSerieYCorrelativo('03', null, 14, new Date());
    expect(r).toEqual({ serie: 'B001', correlativo: 70 });
  });
});
