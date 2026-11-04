import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificacionesService,
  type AgendaNotifMeta,
} from '../notificaciones/notificaciones.service';
import {
  planTieneFeature,
  SELECT_PLAN_FEATURES,
} from '../common/utils/plan-features';
import {
  DIA_MS,
  HORA_MS,
  MIN_MS,
  expandirOcurrencias,
  fechaCortaLima,
  horaLima,
  inicioDiaLima,
} from './agenda.fechas';
import type { AgendaRepeticion, AgendaTipo } from './agenda.tipos';

/** Si el inicio ya pasó hace más de esto, el aviso no sirve: no se manda. */
const VENTANA_TARDE_MS = HORA_MS;
/** El recordatorio más anticipado que se ofrece (1 día). */
const ANTICIPACION_MAX_MS = 1440 * MIN_MS;

const ETIQUETA_TIPO: Record<AgendaTipo, string> = {
  REUNION: 'Reunión',
  TAREA: 'Tarea',
  PAGO: 'Pago',
  RECORDATORIO: 'Recordatorio',
};

interface EventoAviso {
  id: number;
  empresaId: number;
  creadorId: number;
  responsableId: number | null;
  titulo: string;
  lugar: string | null;
  tipo: AgendaTipo;
  inicio: Date;
  fin: Date | null;
  todoElDia: boolean;
  repeticion: AgendaRepeticion;
  repetirHasta: Date | null;
  recordatorioMin: number | null;
}

/** "hoy a las 15:30", "mañana (todo el día)", "el 05/11 a las 09:00". */
export function cuandoTexto(
  inicio: Date,
  todoElDia: boolean,
  ahora: Date,
): string {
  const dias = Math.round(
    (inicioDiaLima(inicio).getTime() - inicioDiaLima(ahora).getTime()) / DIA_MS,
  );
  const dia =
    dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `el ${fechaCortaLima(inicio)}`;
  return todoElDia
    ? `${dia} (todo el día)`
    : `${dia} a las ${horaLima(inicio)}`;
}

export function mensajeRecordatorio(
  ev: Pick<EventoAviso, 'tipo' | 'lugar' | 'todoElDia'>,
  inicio: Date,
  ahora: Date,
): string {
  const lugar = ev.lugar ? ` · ${ev.lugar}` : '';
  return `${ETIQUETA_TIPO[ev.tipo]} ${cuandoTexto(inicio, ev.todoElDia, ahora)}${lugar}`;
}

/** Ruta del panel web a la Agenda (la app también la reconoce por `/agenda`). */
export const RUTA_AGENDA = '/administrador/mi-negocio/agenda';

/** Lo que permite a la campana (web y app) saber que es de la Agenda y abrirla. */
export function metaRecordatorio(
  eventoId: number,
  inicio: Date,
): AgendaNotifMeta {
  return {
    origen: 'AGENDA',
    agendaEventoId: eventoId,
    ocurrencia: inicio.toISOString(),
    url: RUTA_AGENDA,
  };
}

/**
 * Cada minuto avisa por la campana del panel (notificación + gateway) las
 * ocurrencias cuyo momento de aviso (inicio − recordatorio) ya llegó.
 *
 * Una sola vez por ocurrencia: el unique (eventoId, ocurrencia) de
 * `AgendaRecordatorioEnviado` lo garantiza aunque corran varias instancias o se
 * reintente. Se reserva primero y se avisa después: si dos instancias compiten,
 * solo una gana el insert.
 *
 * No hay push a la app: el backend todavía no registra tokens de dispositivo.
 */
@Injectable()
export class AgendaRecordatoriosService {
  private readonly logger = new Logger(AgendaRecordatoriosService.name);
  private corriendo = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Cron('* * * * *', { name: 'agenda-recordatorios' })
  async ejecutar(): Promise<void> {
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      await this.procesar(new Date());
    } catch (err) {
      this.logger.warn(`Recordatorios de agenda: ${(err as Error)?.message}`);
    } finally {
      this.corriendo = false;
    }
  }

  /** Devuelve cuántos avisos salieron. Público para el QA. */
  async procesar(ahora: Date): Promise<number> {
    const desde = new Date(ahora.getTime() - VENTANA_TARDE_MS);
    const hasta = new Date(ahora.getTime() + ANTICIPACION_MAX_MS);

    const eventos = (await this.prisma.agendaEvento.findMany({
      where: {
        recordatorioMin: { not: null },
        inicio: { lte: hasta },
        empresa: { estado: 'ACTIVO' },
        OR: [
          { repeticion: 'NINGUNA', inicio: { gte: desde } },
          {
            repeticion: { not: 'NINGUNA' },
            OR: [
              { repetirHasta: null },
              { repetirHasta: { gte: new Date(desde.getTime() - DIA_MS) } },
            ],
          },
        ],
      },
      select: {
        id: true,
        empresaId: true,
        creadorId: true,
        responsableId: true,
        titulo: true,
        lugar: true,
        tipo: true,
        inicio: true,
        fin: true,
        todoElDia: true,
        repeticion: true,
        repetirHasta: true,
        recordatorioMin: true,
      },
      take: 5_000,
    })) as EventoAviso[];

    const planPorEmpresa = new Map<number, boolean>();
    let enviados = 0;

    for (const ev of eventos) {
      const minutos = ev.recordatorioMin;
      if (!minutos) continue;

      const pendientes = expandirOcurrencias(ev, desde, hasta).filter((o) => {
        const t = o.inicio.getTime();
        return t >= desde.getTime() && t - minutos * MIN_MS <= ahora.getTime();
      });
      if (!pendientes.length) continue;

      if (!planPorEmpresa.has(ev.empresaId)) {
        planPorEmpresa.set(
          ev.empresaId,
          await this.empresaTieneAgenda(ev.empresaId),
        );
      }
      if (!planPorEmpresa.get(ev.empresaId)) continue;

      for (const occ of pendientes) {
        if (await this.avisar(ev, occ.inicio, ahora)) enviados++;
      }
    }
    return enviados;
  }

  private async empresaTieneAgenda(empresaId: number): Promise<boolean> {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { plan: { select: SELECT_PLAN_FEATURES } },
    });
    return planTieneFeature(empresa?.plan, 'tieneAgenda');
  }

  private async avisar(
    ev: EventoAviso,
    inicio: Date,
    ahora: Date,
  ): Promise<boolean> {
    const hecha = await this.prisma.agendaOcurrenciaCompletada.findUnique({
      where: { eventoId_ocurrencia: { eventoId: ev.id, ocurrencia: inicio } },
      select: { id: true },
    });
    if (hecha) return false;

    const usuarioId = ev.responsableId ?? ev.creadorId;
    try {
      await this.prisma.agendaRecordatorioEnviado.create({
        data: { eventoId: ev.id, ocurrencia: inicio, usuarioId },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') return false; // ya avisado
      throw err;
    }

    await this.notificaciones.crearNotificacion({
      usuarioId,
      empresaId: ev.empresaId,
      tipo: 'INFO',
      titulo: `Agenda: ${ev.titulo}`,
      mensaje: mensajeRecordatorio(ev, inicio, ahora),
      metaData: metaRecordatorio(ev.id, inicio),
    });
    return true;
  }
}
