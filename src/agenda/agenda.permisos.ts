/**
 * Quién ve, edita y completa un evento de la Agenda.
 *
 *  - Ver: creador, responsable o cualquiera de la empresa si es de EQUIPO.
 *  - Editar/eliminar: creador o ADMIN_EMPRESA (siempre que lo vea).
 *  - Completar: creador, responsable o ADMIN_EMPRESA; si es de EQUIPO y no
 *    tiene responsable, cualquiera de la empresa.
 *
 * Todo dentro de la empresa del token: la empresa se filtra en la consulta.
 */
import type { AgendaActor, AgendaVisibilidad } from './agenda.tipos';

interface EventoPermisos {
  creadorId: number;
  responsableId: number | null;
  visibilidad: AgendaVisibilidad;
}

const esAdmin = (actor: AgendaActor) => actor.rol === 'ADMIN_EMPRESA';

export function puedeVer(ev: EventoPermisos, actor: AgendaActor): boolean {
  return (
    ev.creadorId === actor.id ||
    ev.responsableId === actor.id ||
    ev.visibilidad === 'EQUIPO'
  );
}

export function puedeEditar(ev: EventoPermisos, actor: AgendaActor): boolean {
  return puedeVer(ev, actor) && (ev.creadorId === actor.id || esAdmin(actor));
}

export function puedeCompletar(
  ev: EventoPermisos,
  actor: AgendaActor,
): boolean {
  if (!puedeVer(ev, actor)) return false;
  return (
    ev.creadorId === actor.id ||
    ev.responsableId === actor.id ||
    esAdmin(actor) ||
    (ev.visibilidad === 'EQUIPO' && ev.responsableId === null)
  );
}

/** El mismo criterio de `puedeVer`, como filtro de Prisma. */
export function filtroVisible(actor: AgendaActor) {
  return {
    OR: [
      { creadorId: actor.id },
      { responsableId: actor.id },
      { visibilidad: 'EQUIPO' as const },
    ],
  };
}
