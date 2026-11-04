/**
 * QA de la Agenda contra una BD en memoria que entiende los `where` que usa el
 * módulo (igualdad, gte/lte/not/in, OR/AND y relaciones anidadas). Así se
 * prueban los filtros reales de visibilidad y de empresa, no un mock que
 * devuelve lo que uno quiere.
 */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AgendaRecordatoriosService } from './agenda-recordatorios.service';
import { AgendaPlanGuard } from './agenda-plan.guard';
import { AgendaController } from './agenda.controller';
import { MENSAJE_PLAN_SIN_AGENDA, type AgendaActor } from './agenda.tipos';

type Fila = Record<string, any>;

const igual = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : a === b;
const num = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number));

function cumple(fila: Fila, where: Fila | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Fila[]).some((w) => cumple(fila, w));
    if (k === 'AND') return (v as Fila[]).every((w) => cumple(fila, w));
    const val = fila[k];
    if (v === null) return val === null || val === undefined;
    if (v instanceof Date || typeof v !== 'object') return igual(val, v);
    const ops = v as Fila;
    const esOperador = ['gte', 'lte', 'not', 'in'].some((o) => o in ops);
    if (!esOperador)
      return val && typeof val === 'object' ? cumple(val, ops) : false;
    if (
      'gte' in ops &&
      (val === null || val === undefined || num(val) < num(ops.gte))
    )
      return false;
    if (
      'lte' in ops &&
      (val === null || val === undefined || num(val) > num(ops.lte))
    )
      return false;
    if (
      'not' in ops &&
      (ops.not === null
        ? val === null || val === undefined
        : igual(val, ops.not))
    )
      return false;
    if ('in' in ops && !(ops.in as unknown[]).some((x) => igual(val, x)))
      return false;
    return true;
  });
}

function crearBd() {
  const usuarios: Fila[] = [
    {
      id: 1,
      nombre: 'Ana Admin',
      empresaId: 10,
      rol: 'ADMIN_EMPRESA',
      estado: 'ACTIVO',
    },
    {
      id: 2,
      nombre: 'Beto Vendedor',
      empresaId: 10,
      rol: 'USUARIO_EMPRESA',
      estado: 'ACTIVO',
    },
    {
      id: 3,
      nombre: 'Caro Cajera',
      empresaId: 10,
      rol: 'USUARIO_EMPRESA',
      estado: 'ACTIVO',
    },
    {
      id: 4,
      nombre: 'Dani Inactivo',
      empresaId: 10,
      rol: 'USUARIO_EMPRESA',
      estado: 'INACTIVO',
    },
    {
      id: 9,
      nombre: 'Otra Empresa',
      empresaId: 20,
      rol: 'ADMIN_EMPRESA',
      estado: 'ACTIVO',
    },
  ];
  const empresas: Fila[] = [
    {
      id: 10,
      estado: 'ACTIVO',
      plan: {
        nombre: 'Corporativo',
        features: [{ featureKey: 'tieneAgenda', enabled: true }],
      },
    },
    {
      id: 20,
      estado: 'ACTIVO',
      plan: {
        nombre: 'Corporativo',
        features: [{ featureKey: 'tieneAgenda', enabled: true }],
      },
    },
    { id: 30, estado: 'ACTIVO', plan: { nombre: 'Emprendedor', features: [] } },
  ];
  const eventos: Fila[] = [];
  const completadas: Fila[] = [];
  const enviados: Fila[] = [];
  const notificaciones: Fila[] = [];
  let seq = 0;

  const conRelaciones = (e: Fila) => ({
    ...e,
    creador: (({ id, nombre }) => ({ id, nombre }))(
      usuarios.find((u) => u.id === e.creadorId)!,
    ),
    responsable: e.responsableId
      ? (({ id, nombre }) => ({ id, nombre }))(
          usuarios.find((u) => u.id === e.responsableId)!,
        )
      : null,
    empresa: empresas.find((x) => x.id === e.empresaId),
  });
  const unique = (filas: Fila[], data: Fila) => {
    if (
      filas.some(
        (f) =>
          f.eventoId === data.eventoId && igual(f.ocurrencia, data.ocurrencia),
      )
    ) {
      throw Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
    }
  };

  const prisma: any = {
    usuario: {
      findMany: jest.fn(async ({ where }) =>
        usuarios
          .filter((u) => cumple(u, where))
          .map(({ id, nombre }) => ({ id, nombre })),
      ),
      findFirst: jest.fn(
        async ({ where }) => usuarios.find((u) => cumple(u, where)) ?? null,
      ),
    },
    empresa: {
      findUnique: jest.fn(
        async ({ where }) => empresas.find((e) => e.id === where.id) ?? null,
      ),
    },
    agendaEvento: {
      findMany: jest.fn(async ({ where }) =>
        eventos.map(conRelaciones).filter((e) => cumple(e, where)),
      ),
      findFirst: jest.fn(
        async ({ where }) =>
          eventos.map(conRelaciones).find((e) => cumple(e, where)) ?? null,
      ),
      create: jest.fn(async ({ data }) => {
        const fila = { id: ++seq, ...data };
        eventos.push(fila);
        return conRelaciones(fila);
      }),
      update: jest.fn(async ({ where, data }) => {
        const fila = eventos.find((e) => e.id === where.id)!;
        Object.assign(fila, data);
        return conRelaciones(fila);
      }),
      delete: jest.fn(async ({ where }) => {
        const i = eventos.findIndex((e) => e.id === where.id);
        eventos.splice(i, 1);
        for (const arr of [completadas, enviados]) {
          for (let j = arr.length - 1; j >= 0; j--)
            if (arr[j].eventoId === where.id) arr.splice(j, 1);
        }
      }),
    },
    agendaOcurrenciaCompletada: {
      findMany: jest.fn(async ({ where }) =>
        completadas.filter((c) => cumple(c, where)),
      ),
      findUnique: jest.fn(async ({ where }) => {
        const k = where.eventoId_ocurrencia;
        return (
          completadas.find(
            (c) =>
              c.eventoId === k.eventoId && igual(c.ocurrencia, k.ocurrencia),
          ) ?? null
        );
      }),
      upsert: jest.fn(async ({ where, create }) => {
        const k = where.eventoId_ocurrencia;
        const ya = completadas.find(
          (c) => c.eventoId === k.eventoId && igual(c.ocurrencia, k.ocurrencia),
        );
        if (ya) return ya;
        const fila = { id: ++seq, ...create };
        completadas.push(fila);
        return fila;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        for (let j = completadas.length - 1; j >= 0; j--)
          if (cumple(completadas[j], where)) completadas.splice(j, 1);
      }),
      createMany: jest.fn(async ({ data }) => {
        for (const d of data) completadas.push({ id: ++seq, ...d });
      }),
    },
    agendaRecordatorioEnviado: {
      create: jest.fn(async ({ data }) => {
        unique(enviados, data);
        enviados.push({ id: ++seq, ...data });
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(prisma));

  const notificacionesSvc: any = {
    crearNotificacion: jest.fn(async (n: Fila) => {
      notificaciones.push(n);
      return n;
    }),
  };

  return {
    prisma,
    eventos,
    completadas,
    enviados,
    notificaciones,
    notificacionesSvc,
    usuarios,
  };
}

const AHORA = new Date('2026-11-02T15:00:00.000Z'); // lunes 10:00 Lima
const ana: AgendaActor = { id: 1, rol: 'ADMIN_EMPRESA', empresaId: 10 };
const beto: AgendaActor = { id: 2, rol: 'USUARIO_EMPRESA', empresaId: 10 };
const caro: AgendaActor = { id: 3, rol: 'USUARIO_EMPRESA', empresaId: 10 };
const otro: AgendaActor = { id: 9, rol: 'ADMIN_EMPRESA', empresaId: 20 };
const semana = {
  desde: '2026-11-02T05:00:00.000Z',
  hasta: '2026-11-09T04:59:59.999Z',
};

describe('Agenda · servicio', () => {
  let bd: ReturnType<typeof crearBd>;
  let svc: AgendaService;

  beforeEach(() => {
    jest.useFakeTimers({
      now: AHORA,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    bd = crearBd();
    svc = new AgendaService(bd.prisma);
  });
  afterEach(() => jest.useRealTimers());

  const crear = (actor: AgendaActor, extra: Record<string, unknown> = {}) =>
    svc.crear(actor, {
      titulo: 'Evento',
      tipo: 'TAREA',
      inicio: '2026-11-03T14:00:00.000Z',
      ...extra,
    });

  it('crear devuelve la primera ocurrencia con creador y permisos', async () => {
    const o = await crear(beto, { responsableId: 3, recordatorioMin: 60 });
    expect(o).toMatchObject({
      id: `${o.eventoId}:2026-11-03T14:00:00.000Z`,
      creador: { id: 2, nombre: 'Beto Vendedor' },
      responsable: { id: 3, nombre: 'Caro Cajera' },
      completado: false,
      vencido: false,
      puedeEditar: true,
      puedeCompletar: true,
      prioridad: 'MEDIA',
      visibilidad: 'PERSONAL',
    });
    expect(bd.eventos[0]).toMatchObject({ empresaId: 10, creadorId: 2 });
  });

  it('no deja asignar un responsable de otra empresa, inactivo o inexistente', async () => {
    for (const responsableId of [9, 4, 777]) {
      await expect(crear(beto, { responsableId })).rejects.toThrow(
        'El responsable debe ser un usuario activo de tu empresa.',
      );
    }
    expect(bd.eventos).toHaveLength(0);
  });

  it('visibilidad: PERSONAL solo creador y responsable; EQUIPO toda la empresa', async () => {
    await crear(beto, { titulo: 'Personal de Beto' });
    await crear(beto, { titulo: 'Asignado a Caro', responsableId: 3 });
    await crear(beto, { titulo: 'Del equipo', visibilidad: 'EQUIPO' });

    const titulos = async (a: AgendaActor) =>
      (await svc.listar(a, semana)).map((o) => o.titulo).sort();
    expect(await titulos(beto)).toEqual([
      'Asignado a Caro',
      'Del equipo',
      'Personal de Beto',
    ]);
    expect(await titulos(caro)).toEqual(['Asignado a Caro', 'Del equipo']);
    // El admin no ve lo personal ajeno.
    expect(await titulos(ana)).toEqual(['Del equipo']);
  });

  it('soloMios deja fuera lo del equipo que no es mío', async () => {
    await crear(beto, { titulo: 'Del equipo', visibilidad: 'EQUIPO' });
    await crear(caro, { titulo: 'Mío' });
    const r = await svc.listar(caro, { ...semana, soloMios: 'true' });
    expect(r.map((o) => o.titulo)).toEqual(['Mío']);
  });

  it('filtra por tipos y ordena por inicio', async () => {
    await crear(beto, {
      titulo: 'B',
      tipo: 'PAGO',
      inicio: '2026-11-04T14:00:00Z',
    });
    await crear(beto, {
      titulo: 'A',
      tipo: 'REUNION',
      inicio: '2026-11-03T14:00:00Z',
    });
    await crear(beto, {
      titulo: 'C',
      tipo: 'TAREA',
      inicio: '2026-11-02T20:00:00Z',
    });
    const r = await svc.listar(beto, { ...semana, tipos: 'PAGO,REUNION' });
    expect(r.map((o) => o.titulo)).toEqual(['A', 'B']);
  });

  it('aislamiento: otra empresa no ve, no edita, no completa ni borra (404)', async () => {
    const o = await crear(beto, { visibilidad: 'EQUIPO' });
    expect(await svc.listar(otro, semana)).toEqual([]);
    await expect(
      svc.actualizar(otro, o.eventoId, { titulo: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.completar(otro, o.eventoId, { completado: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.eliminar(otro, o.eventoId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(bd.eventos).toHaveLength(1);
  });

  it('un evento PERSONAL ajeno de mi empresa responde 404 (no se filtra que existe)', async () => {
    const o = await crear(beto);
    await expect(
      svc.actualizar(caro, o.eventoId, { titulo: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('editar/eliminar: creador o ADMIN_EMPRESA; el responsable no', async () => {
    const o = await crear(beto, { visibilidad: 'EQUIPO', responsableId: 3 });
    await expect(
      svc.actualizar(caro, o.eventoId, { titulo: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.eliminar(caro, o.eventoId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const r = await svc.actualizar(ana, o.eventoId, {
      titulo: 'Editado por admin',
    });
    expect(r.titulo).toBe('Editado por admin');
    expect(await svc.eliminar(beto, o.eventoId)).toEqual({ ok: true });
    expect(bd.eventos).toHaveLength(0);
  });

  it('completar: responsable sí; otro del equipo no si hay responsable; cualquiera si no hay', async () => {
    const conResp = await crear(beto, {
      visibilidad: 'EQUIPO',
      responsableId: 3,
    });
    const sinResp = await crear(beto, { visibilidad: 'EQUIPO' });
    await expect(
      svc.completar(ana, conResp.eventoId, { completado: true }),
    ).resolves.toMatchObject({ completado: true });
    await expect(
      svc.completar(
        { id: 5, rol: 'USUARIO_EMPRESA', empresaId: 10 },
        conResp.eventoId,
        { completado: true },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.completar(caro, sinResp.eventoId, { completado: true }),
    ).resolves.toMatchObject({
      completado: true,
    });
    const lista = await svc.listar(caro, semana);
    expect(
      lista.find((o) => o.eventoId === sinResp.eventoId)?.puedeCompletar,
    ).toBe(true);
  });

  it('completar por ocurrencia en un evento repetido', async () => {
    const o = await crear(beto, {
      repeticion: 'DIARIA',
      inicio: '2026-11-02T14:00:00Z',
    });
    await expect(
      svc.completar(beto, o.eventoId, { completado: true }),
    ).rejects.toThrow(/qué ocurrencia/);
    await expect(
      svc.completar(beto, o.eventoId, {
        completado: true,
        ocurrencia: '2026-11-04T15:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const r = await svc.completar(beto, o.eventoId, {
      completado: true,
      ocurrencia: '2026-11-04T14:00:00Z',
    });
    expect(r).toMatchObject({
      id: `${o.eventoId}:2026-11-04T14:00:00.000Z`,
      completado: true,
    });

    const lista = await svc.listar(beto, semana);
    expect(lista).toHaveLength(7);
    expect(lista.filter((x) => x.completado).map((x) => x.inicio)).toEqual([
      '2026-11-04T14:00:00.000Z',
    ]);

    await svc.completar(beto, o.eventoId, {
      completado: false,
      ocurrencia: '2026-11-04T14:00:00Z',
    });
    expect(bd.completadas).toHaveLength(0);
  });

  it('vencido: lo de hoy a las 9:00 sin hacer está vencido; hecho ya no', async () => {
    const o = await crear(beto, { inicio: '2026-11-02T14:00:00Z' }); // 09:00 Lima, ahora 10:00
    expect((await svc.listar(beto, semana))[0].vencido).toBe(true);
    await svc.completar(beto, o.eventoId, { completado: true });
    expect((await svc.listar(beto, semana))[0]).toMatchObject({
      vencido: false,
      completado: true,
    });
  });

  it('mover el evento conserva la marca de hecho y descarta las que ya no calzan', async () => {
    const unico = await crear(beto, { inicio: '2026-11-02T14:00:00Z' });
    await svc.completar(beto, unico.eventoId, { completado: true });
    const movido = await svc.actualizar(beto, unico.eventoId, {
      inicio: '2026-11-05T16:00:00Z',
    });
    expect(movido).toMatchObject({
      inicio: '2026-11-05T16:00:00.000Z',
      completado: true,
    });

    const serie = await crear(beto, {
      repeticion: 'DIARIA',
      inicio: '2026-11-02T14:00:00Z',
    });
    await svc.completar(beto, serie.eventoId, {
      completado: true,
      ocurrencia: '2026-11-03T14:00:00Z',
    });
    // Pasa a semanal: la del martes ya no es ocurrencia de la serie nueva.
    await svc.actualizar(beto, serie.eventoId, { repeticion: 'SEMANAL' });
    expect(
      bd.completadas.filter((c) => c.eventoId === serie.eventoId),
    ).toHaveLength(0);
  });

  it('PATCH valida el resultado combinado (fin antes que el nuevo inicio)', async () => {
    const o = await crear(beto, { fin: '2026-11-03T15:00:00Z' });
    await expect(
      svc.actualizar(beto, o.eventoId, { inicio: '2026-11-03T16:00:00Z' }),
    ).rejects.toThrow(/posterior al inicio/);
  });

  it('rango de más de 62 días → 400', async () => {
    await expect(
      svc.listar(beto, {
        desde: '2026-11-01T00:00:00Z',
        hasta: '2027-02-01T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('expande repeticiones dentro del rango (mensual 31 → fin de mes)', async () => {
    await crear(beto, {
      titulo: 'Alquiler',
      tipo: 'PAGO',
      repeticion: 'MENSUAL',
      inicio: '2026-10-31T15:00:00Z',
    });
    const nov = await svc.listar(beto, {
      desde: '2026-11-01T05:00:00Z',
      hasta: '2026-12-01T04:59:59Z',
    });
    expect(nov.map((o) => o.inicio)).toEqual(['2026-11-30T15:00:00.000Z']);
  });

  it('resumen: hoy, próximos 7 días sin hoy (máx 8) y vencidos', async () => {
    await crear(beto, { titulo: 'Hoy 9am', inicio: '2026-11-02T14:00:00Z' }); // vencido
    await crear(beto, { titulo: 'Hoy 6pm', inicio: '2026-11-02T23:00:00Z' });
    await crear(beto, {
      titulo: 'Diario',
      repeticion: 'DIARIA',
      inicio: '2026-11-03T13:00:00Z',
    });
    await crear(beto, { titulo: 'Lejano', inicio: '2026-11-20T14:00:00Z' });
    await crear(beto, { titulo: 'Ayer', inicio: '2026-11-01T14:00:00Z' }); // vencido
    const r = await svc.resumen(beto);
    expect(r.hoy.map((o) => o.titulo)).toEqual(['Hoy 9am', 'Hoy 6pm']);
    expect(r.proximos).toHaveLength(7); // 03/11 al 09/11
    expect(r.proximos.every((o) => o.titulo === 'Diario')).toBe(true);
    expect(r.vencidos).toBe(2);
  });

  it('usuarios: solo activos de mi empresa', async () => {
    const r = await svc.usuarios(beto);
    expect(r.map((u) => u.id)).toEqual([1, 2, 3]);
  });
});

describe('Agenda · recordatorios', () => {
  let bd: ReturnType<typeof crearBd>;
  let svc: AgendaService;
  let rec: AgendaRecordatoriosService;

  beforeEach(() => {
    jest.useFakeTimers({
      now: AHORA,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    bd = crearBd();
    svc = new AgendaService(bd.prisma);
    rec = new AgendaRecordatoriosService(bd.prisma, bd.notificacionesSvc);
  });
  afterEach(() => jest.useRealTimers());

  it('avisa una sola vez al responsable cuando llega el momento', async () => {
    // Empieza 10:30 Lima, aviso 15 min antes = 10:15.
    await svc.crear(beto, {
      titulo: 'Llamar al contador',
      tipo: 'REUNION',
      inicio: '2026-11-02T15:30:00Z',
      recordatorioMin: 15,
      responsableId: 3,
      lugar: 'Zoom',
    });
    expect(await rec.procesar(new Date('2026-11-02T15:10:00Z'))).toBe(0);
    expect(await rec.procesar(new Date('2026-11-02T15:15:00Z'))).toBe(1);
    expect(await rec.procesar(new Date('2026-11-02T15:16:00Z'))).toBe(0);
    expect(bd.notificaciones).toEqual([
      expect.objectContaining({
        usuarioId: 3,
        empresaId: 10,
        titulo: 'Agenda: Llamar al contador',
        mensaje: 'Reunión hoy a las 10:30 · Zoom',
        metaData: {
          origen: 'AGENDA',
          agendaEventoId: bd.eventos[0].id,
          ocurrencia: '2026-11-02T15:30:00.000Z',
          url: '/administrador/mi-negocio/agenda',
        },
      }),
    ]);
  });

  it('sin responsable avisa al creador; dos instancias a la vez → un solo aviso', async () => {
    await svc.crear(beto, {
      titulo: 'Pagar luz',
      tipo: 'PAGO',
      inicio: '2026-11-03T14:00:00Z',
      recordatorioMin: 1440,
    });
    const otra = new AgendaRecordatoriosService(
      bd.prisma,
      bd.notificacionesSvc,
    );
    const t = new Date('2026-11-02T14:30:00Z');
    const [a, b] = await Promise.all([rec.procesar(t), otra.procesar(t)]);
    expect(a + b).toBe(1);
    expect(bd.notificaciones).toHaveLength(1);
    expect(bd.notificaciones[0]).toMatchObject({
      usuarioId: 2,
      mensaje: 'Pago mañana a las 09:00',
    });
  });

  it('no avisa si el inicio pasó hace más de una hora, ni si ya está hecho', async () => {
    await svc.crear(beto, {
      titulo: 'Viejo',
      tipo: 'TAREA',
      inicio: '2026-11-02T13:00:00Z',
      recordatorioMin: 15,
    });
    const hecho = await svc.crear(beto, {
      titulo: 'Hecho',
      tipo: 'TAREA',
      inicio: '2026-11-02T15:20:00Z',
      recordatorioMin: 60,
    });
    await svc.completar(beto, hecho.eventoId, { completado: true });
    expect(await rec.procesar(AHORA)).toBe(0);
  });

  it('en una serie avisa cada ocurrencia por separado', async () => {
    await svc.crear(beto, {
      titulo: 'Stand-up',
      tipo: 'REUNION',
      repeticion: 'DIARIA',
      inicio: '2026-11-02T14:00:00Z',
      recordatorioMin: 15,
    });
    expect(await rec.procesar(new Date('2026-11-02T13:50:00Z'))).toBe(1);
    expect(await rec.procesar(new Date('2026-11-03T13:50:00Z'))).toBe(1);
    expect(bd.enviados.map((e) => e.ocurrencia.toISOString())).toEqual([
      '2026-11-02T14:00:00.000Z',
      '2026-11-03T14:00:00.000Z',
    ]);
  });

  it('si el plan ya no tiene Agenda, no avisa', async () => {
    await svc.crear(beto, {
      titulo: 'X',
      tipo: 'TAREA',
      inicio: '2026-11-02T15:10:00Z',
      recordatorioMin: 15,
    });
    bd.prisma.empresa.findUnique.mockResolvedValueOnce({
      plan: { features: [{ featureKey: 'tieneAgenda', enabled: false }] },
    });
    expect(await rec.procesar(AHORA)).toBe(0);
  });
});

describe('Agenda · gate del plan', () => {
  const ctx = (user: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;

  it('plan sin tieneAgenda → 403 con el mensaje del contrato', async () => {
    const guard = new AgendaPlanGuard(crearBd().prisma);
    await expect(
      guard.canActivate(ctx({ id: 7, empresaId: 30 })),
    ).rejects.toThrow(MENSAJE_PLAN_SIN_AGENDA);
    await expect(
      guard.canActivate(ctx({ id: 7, empresaId: 30 })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sin fila de la característica también es 403 (default apagado)', async () => {
    const bd = crearBd();
    bd.prisma.empresa.findUnique.mockResolvedValueOnce({
      plan: { nombre: 'Negocio', features: [] },
    });
    await expect(
      new AgendaPlanGuard(bd.prisma).canActivate(ctx({ empresaId: 10 })),
    ).rejects.toThrow(MENSAJE_PLAN_SIN_AGENDA);
  });

  it('plan con tieneAgenda pasa', async () => {
    await expect(
      new AgendaPlanGuard(crearBd().prisma).canActivate(ctx({ empresaId: 10 })),
    ).resolves.toBe(true);
  });

  it('el controlador exige roles de empresa y aplica el gate en todas las rutas', () => {
    expect(Reflect.getMetadata('roles', AgendaController)).toEqual([
      'ADMIN_EMPRESA',
      'USUARIO_EMPRESA',
    ]);
    const guards = Reflect.getMetadata(
      '__guards__',
      AgendaController,
    ) as unknown[];
    expect(guards).toContain(AgendaPlanGuard);
  });

  it('un id no numérico responde 404, no 500', async () => {
    const bd = crearBd();
    const ctrl = new AgendaController(new AgendaService(bd.prisma));
    await expect(
      ctrl.eliminar({ id: 2, rol: 'USUARIO_EMPRESA', empresaId: 10 }, 'abc'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
