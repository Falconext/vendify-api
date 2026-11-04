import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DIA_MS,
  esOcurrenciaDe,
  estaVencido,
  expandirOcurrencias,
  finDiaLima,
  finOcurrencia,
  inicioDiaLima,
  type Ocurrencia,
} from './agenda.fechas';
import { filtroVisible, puedeCompletar, puedeEditar } from './agenda.permisos';
import {
  RANGO_MAXIMO_DIAS,
  type AgendaActor,
  type AgendaEventoDatos,
  type AgendaEventoRegistro,
  type AgendaOcurrencia,
  type AgendaResumen,
  type AgendaTipo,
  type AgendaUsuarioMin,
} from './agenda.tipos';
import {
  validarCompletar,
  validarEvento,
  validarFiltrosListado,
} from './agenda.validacion';

const SELECT_EVENTO = {
  id: true,
  empresaId: true,
  creadorId: true,
  responsableId: true,
  titulo: true,
  descripcion: true,
  lugar: true,
  tipo: true,
  prioridad: true,
  visibilidad: true,
  inicio: true,
  fin: true,
  todoElDia: true,
  repeticion: true,
  repetirHasta: true,
  recordatorioMin: true,
  creador: { select: { id: true, nombre: true } },
  responsable: { select: { id: true, nombre: true } },
} as const;

/** Tope de eventos base por consulta (cada uno puede expandirse en varias ocurrencias). */
const MAX_EVENTOS_CONSULTA = 2_000;
const MAX_PROXIMOS = 8;
const DIAS_PROXIMOS = 7;

const NO_ENCONTRADO = 'El evento no existe o no tienes acceso a él.';

interface FiltrosBusqueda {
  desde: Date;
  hasta: Date;
  tipos?: AgendaTipo[] | null;
  soloMios?: boolean;
}

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Lectura ────────────────────────────────────────────────────────────

  async listar(
    actor: AgendaActor,
    query: Record<string, unknown>,
  ): Promise<AgendaOcurrencia[]> {
    const filtros = validarFiltrosListado(query);
    return this.buscarOcurrencias(actor, filtros, new Date());
  }

  async resumen(actor: AgendaActor): Promise<AgendaResumen> {
    const ahora = new Date();
    const hoyIni = inicioDiaLima(ahora);
    const hoyFin = finDiaLima(ahora);
    const mananaIni = new Date(hoyIni.getTime() + DIA_MS);
    const proximosFin = new Date(
      hoyIni.getTime() + (DIAS_PROXIMOS + 1) * DIA_MS - 1,
    );
    // Los vencidos se cuentan en la misma ventana máxima que el calendario.
    const vencidosDesde = new Date(
      ahora.getTime() - RANGO_MAXIMO_DIAS * DIA_MS,
    );

    const todas = await this.buscarOcurrencias(
      actor,
      { desde: vencidosDesde, hasta: proximosFin },
      ahora,
    );

    const hoy: AgendaOcurrencia[] = [];
    const proximos: AgendaOcurrencia[] = [];
    let vencidos = 0;
    for (const o of todas) {
      const inicio = new Date(o.inicio).getTime();
      const fin = finEfectivoDe(o);
      if (o.vencido && o.puedeCompletar) vencidos++;
      if (inicio <= hoyFin.getTime() && fin >= hoyIni.getTime()) hoy.push(o);
      else if (inicio >= mananaIni.getTime() && proximos.length < MAX_PROXIMOS)
        proximos.push(o);
    }
    return { hoy, proximos, vencidos };
  }

  async usuarios(actor: AgendaActor): Promise<AgendaUsuarioMin[]> {
    return this.prisma.usuario.findMany({
      where: {
        empresaId: actor.empresaId,
        estado: 'ACTIVO',
        rol: { in: ['ADMIN_EMPRESA', 'USUARIO_EMPRESA'] },
      },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
  }

  // ─── Escritura ──────────────────────────────────────────────────────────

  async crear(actor: AgendaActor, cuerpo: unknown): Promise<AgendaOcurrencia> {
    const datos = validarEvento(cuerpo);
    await this.validarResponsable(actor, datos.responsableId);
    const ev = await this.prisma.agendaEvento.create({
      data: { ...datos, empresaId: actor.empresaId, creadorId: actor.id },
      select: SELECT_EVENTO,
    });
    return this.ocurrenciaBase(actor, ev as AgendaEventoRegistro);
  }

  async actualizar(
    actor: AgendaActor,
    eventoId: number,
    cuerpo: unknown,
  ): Promise<AgendaOcurrencia> {
    const actual = await this.cargarVisible(actor, eventoId);
    if (!puedeEditar(actual, actor)) {
      throw new ForbiddenException(
        'Solo quien creó el evento o un administrador puede editarlo.',
      );
    }
    const datos = validarEvento(cuerpo, actual);
    if (
      datos.responsableId !== null &&
      datos.responsableId !== actual.responsableId
    ) {
      await this.validarResponsable(actor, datos.responsableId);
    }

    const ev = await this.prisma.$transaction(async (tx) => {
      await this.reubicarCompletados(tx, actual, datos);
      return tx.agendaEvento.update({
        where: { id: actual.id },
        data: datos,
        select: SELECT_EVENTO,
      });
    });
    return this.ocurrenciaBase(actor, ev as AgendaEventoRegistro);
  }

  async eliminar(actor: AgendaActor, eventoId: number): Promise<{ ok: true }> {
    const actual = await this.cargarVisible(actor, eventoId);
    if (!puedeEditar(actual, actor)) {
      throw new ForbiddenException(
        'Solo quien creó el evento o un administrador puede eliminarlo.',
      );
    }
    await this.prisma.agendaEvento.delete({ where: { id: actual.id } });
    return { ok: true };
  }

  async completar(
    actor: AgendaActor,
    eventoId: number,
    cuerpo: unknown,
  ): Promise<AgendaOcurrencia> {
    const { ocurrencia, completado } = validarCompletar(cuerpo);
    const ev = await this.cargarVisible(actor, eventoId);
    if (!puedeCompletar(ev, actor)) {
      throw new ForbiddenException('No puedes marcar este evento como hecho.');
    }

    let inicio: Date;
    if (ev.repeticion === 'NINGUNA') {
      inicio = ev.inicio;
    } else {
      if (!ocurrencia) {
        throw new BadRequestException(
          'Indica qué ocurrencia del evento repetido marcas como hecha.',
        );
      }
      if (!esOcurrenciaDe(ev, ocurrencia)) {
        throw new BadRequestException(
          'Esa fecha no corresponde a una repetición del evento.',
        );
      }
      inicio = ocurrencia;
    }

    if (completado) {
      await this.prisma.agendaOcurrenciaCompletada.upsert({
        where: { eventoId_ocurrencia: { eventoId: ev.id, ocurrencia: inicio } },
        update: {},
        create: {
          eventoId: ev.id,
          ocurrencia: inicio,
          completadoPorId: actor.id,
        },
      });
    } else {
      await this.prisma.agendaOcurrenciaCompletada.deleteMany({
        where: { eventoId: ev.id, ocurrencia: inicio },
      });
    }

    const occ: Ocurrencia = { inicio, fin: finOcurrencia(ev, inicio) };
    return aOcurrencia(ev, occ, completado, actor, new Date());
  }

  // ─── Internos ───────────────────────────────────────────────────────────

  /** El evento de la empresa del token que el actor puede ver; si no, 404. */
  private async cargarVisible(
    actor: AgendaActor,
    eventoId: number,
  ): Promise<AgendaEventoRegistro> {
    if (!Number.isInteger(eventoId) || eventoId <= 0)
      throw new NotFoundException(NO_ENCONTRADO);
    const ev = await this.prisma.agendaEvento.findFirst({
      where: {
        id: eventoId,
        empresaId: actor.empresaId,
        ...filtroVisible(actor),
      },
      select: SELECT_EVENTO,
    });
    if (!ev) throw new NotFoundException(NO_ENCONTRADO);
    return ev as AgendaEventoRegistro;
  }

  private async validarResponsable(
    actor: AgendaActor,
    responsableId: number | null,
  ): Promise<void> {
    if (responsableId === null) return;
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        id: responsableId,
        empresaId: actor.empresaId,
        estado: 'ACTIVO',
        rol: { in: ['ADMIN_EMPRESA', 'USUARIO_EMPRESA'] },
      },
      select: { id: true },
    });
    if (!usuario) {
      throw new BadRequestException(
        'El responsable debe ser un usuario activo de tu empresa.',
      );
    }
  }

  /**
   * Si cambia el horario o la repetición, las marcas de "hecho" se mueven con
   * el evento (se corre cada una lo mismo que el inicio) y se descartan las que
   * ya no caen en una ocurrencia de la serie nueva.
   */
  private async reubicarCompletados(
    tx: Pick<PrismaService, 'agendaOcurrenciaCompletada'>,
    antes: AgendaEventoRegistro,
    despues: AgendaEventoDatos,
  ): Promise<void> {
    const delta = despues.inicio.getTime() - antes.inicio.getTime();
    const mismaSerie =
      delta === 0 &&
      antes.repeticion === despues.repeticion &&
      (antes.repetirHasta?.getTime() ?? null) ===
        (despues.repetirHasta?.getTime() ?? null);
    if (mismaSerie) return;

    const marcas = await tx.agendaOcurrenciaCompletada.findMany({
      where: { eventoId: antes.id },
      select: { ocurrencia: true, completadoPorId: true, completadoEn: true },
    });
    if (!marcas.length) return;

    const vistas = new Set<number>();
    const nuevas = marcas
      .map((m) => ({
        ...m,
        ocurrencia: new Date(m.ocurrencia.getTime() + delta),
      }))
      .filter((m) => {
        const t = m.ocurrencia.getTime();
        if (vistas.has(t) || !esOcurrenciaDe(despues, m.ocurrencia))
          return false;
        vistas.add(t);
        return true;
      });

    // Borrar y recrear: correr en sitio choca con el unique (evento, ocurrencia).
    await tx.agendaOcurrenciaCompletada.deleteMany({
      where: { eventoId: antes.id },
    });
    if (nuevas.length) {
      await tx.agendaOcurrenciaCompletada.createMany({
        data: nuevas.map((m) => ({ eventoId: antes.id, ...m })),
        skipDuplicates: true,
      });
    }
  }

  /** Primera ocurrencia del evento (la respuesta de crear y editar). */
  private async ocurrenciaBase(
    actor: AgendaActor,
    ev: AgendaEventoRegistro,
  ): Promise<AgendaOcurrencia> {
    const marca = await this.prisma.agendaOcurrenciaCompletada.findUnique({
      where: {
        eventoId_ocurrencia: { eventoId: ev.id, ocurrencia: ev.inicio },
      },
      select: { id: true },
    });
    return aOcurrencia(
      ev,
      { inicio: ev.inicio, fin: ev.fin },
      Boolean(marca),
      actor,
      new Date(),
    );
  }

  /** Eventos visibles del actor expandidos a ocurrencias dentro del rango. */
  private async buscarOcurrencias(
    actor: AgendaActor,
    filtros: FiltrosBusqueda,
    ahora: Date,
  ): Promise<AgendaOcurrencia[]> {
    const { desde, hasta } = filtros;
    // Margen de un día: un evento de "todo el día" ocupa hasta las 23:59 de Lima.
    const margen = new Date(desde.getTime() - DIA_MS);

    const eventos = (await this.prisma.agendaEvento.findMany({
      where: {
        empresaId: actor.empresaId,
        inicio: { lte: hasta },
        ...(filtros.tipos?.length ? { tipo: { in: filtros.tipos } } : {}),
        AND: [
          filtroVisible(actor),
          ...(filtros.soloMios
            ? [{ OR: [{ creadorId: actor.id }, { responsableId: actor.id }] }]
            : []),
          {
            OR: [
              {
                repeticion: 'NINGUNA' as const,
                OR: [{ inicio: { gte: margen } }, { fin: { gte: margen } }],
              },
              {
                repeticion: { not: 'NINGUNA' as const },
                OR: [{ repetirHasta: null }, { repetirHasta: { gte: margen } }],
              },
            ],
          },
        ],
      },
      select: SELECT_EVENTO,
      orderBy: { inicio: 'asc' },
      take: MAX_EVENTOS_CONSULTA,
    })) as AgendaEventoRegistro[];

    const expandidas: Array<{ ev: AgendaEventoRegistro; occ: Ocurrencia }> = [];
    for (const ev of eventos) {
      for (const occ of expandirOcurrencias(ev, desde, hasta))
        expandidas.push({ ev, occ });
    }
    if (!expandidas.length) return [];

    let minimo = Infinity;
    let maximo = -Infinity;
    for (const { occ } of expandidas) {
      minimo = Math.min(minimo, occ.inicio.getTime());
      maximo = Math.max(maximo, occ.inicio.getTime());
    }
    const marcas = await this.prisma.agendaOcurrenciaCompletada.findMany({
      where: {
        eventoId: { in: [...new Set(expandidas.map((x) => x.ev.id))] },
        ocurrencia: { gte: new Date(minimo), lte: new Date(maximo) },
      },
      select: { eventoId: true, ocurrencia: true },
    });
    const hechas = new Set(
      marcas.map((m) => claveOcurrencia(m.eventoId, m.ocurrencia)),
    );

    return expandidas
      .map(({ ev, occ }) =>
        aOcurrencia(
          ev,
          occ,
          hechas.has(claveOcurrencia(ev.id, occ.inicio)),
          actor,
          ahora,
        ),
      )
      .sort(
        (a, b) =>
          a.inicio.localeCompare(b.inicio) || a.titulo.localeCompare(b.titulo),
      );
  }
}

// ─── Helpers puros ───────────────────────────────────────────────────────

export function claveOcurrencia(eventoId: number, inicio: Date): string {
  return `${eventoId}:${inicio.toISOString()}`;
}

function finEfectivoDe(o: AgendaOcurrencia): number {
  const ref = new Date(o.fin ?? o.inicio);
  return o.todoElDia ? finDiaLima(ref).getTime() : ref.getTime();
}

export function aOcurrencia(
  ev: AgendaEventoRegistro,
  occ: Ocurrencia,
  completado: boolean,
  actor: AgendaActor,
  ahora: Date,
): AgendaOcurrencia {
  return {
    id: claveOcurrencia(ev.id, occ.inicio),
    eventoId: ev.id,
    titulo: ev.titulo,
    descripcion: ev.descripcion,
    lugar: ev.lugar,
    tipo: ev.tipo,
    prioridad: ev.prioridad,
    visibilidad: ev.visibilidad,
    inicio: occ.inicio.toISOString(),
    fin: occ.fin ? occ.fin.toISOString() : null,
    todoElDia: ev.todoElDia,
    repeticion: ev.repeticion,
    repetirHasta: ev.repetirHasta ? ev.repetirHasta.toISOString() : null,
    recordatorioMin: ev.recordatorioMin,
    completado,
    vencido: estaVencido(occ, ev.todoElDia, completado, ahora),
    creador: ev.creador,
    responsable: ev.responsable ?? null,
    puedeEditar: puedeEditar(ev, actor),
    puedeCompletar: puedeCompletar(ev, actor),
  };
}
