import { ForbiddenException } from '@nestjs/common';

/**
 * Reglas para el usuario "delegado": un USUARIO_EMPRESA con permiso 'usuarios'
 * gestiona al resto del equipo, pero no puede usar eso para quedarse con la
 * cuenta del dueño ni para darse más poder del que el admin le dio.
 */

export function esAdmin(rol?: string | null): boolean {
  return rol === 'ADMIN_EMPRESA' || rol === 'ADMIN_SISTEMA';
}

/**
 * Cambiarle el correo o la clave al ADMIN_EMPRESA era tomar la empresa; y
 * desactivarlo, dejarlo afuera. Solo otro admin toca una cuenta de admin.
 */
export function exigirPuedeGestionar(
  editorRol: string | null | undefined,
  objetivoRol: string | null | undefined,
): void {
  if (!esAdmin(editorRol) && esAdmin(objetivoRol)) {
    throw new ForbiddenException(
      'Solo un administrador puede modificar la cuenta de un administrador.',
    );
  }
}

/**
 * El delegado solo reparte permisos que él mismo tiene. Se miran los que el
 * pedido AGREGA respecto de los que el usuario ya tenía, para que editar el
 * nombre de alguien con un permiso que el delegado no tiene siga funcionando.
 */
export function exigirPermisosQueTiene(
  editorRol: string | null | undefined,
  permisosEditor: string[] | undefined,
  pedidos: string[] | undefined,
  previos: string[] = [],
): void {
  if (esAdmin(editorRol) || !Array.isArray(pedidos)) return;
  const propios = Array.isArray(permisosEditor) ? permisosEditor : [];
  if (propios.includes('*')) return;
  const nuevos = pedidos.filter((p) => !previos.includes(p));
  const ajenos = nuevos.filter((p) => !propios.includes(p));
  if (ajenos.length > 0) {
    throw new ForbiddenException(
      `No puedes asignar permisos que tú no tienes: ${ajenos.join(', ')}.`,
    );
  }
}

/**
 * Lo que el admin decidió sobre el propio delegado (sus permisos, sus
 * candados, sus sedes, su comisión) no lo cambia él mismo. Se quitan del
 * pedido en vez de rechazarlo, para que guardar su nombre o su clave desde la
 * lista de usuarios siga funcionando.
 */
export const CAMPOS_QUE_DECIDE_EL_ADMIN = [
  'permisos',
  'subModuloIds',
  'sedeIds',
  'sedeDefaultId',
  'sedesSinVenta',
  'comisionGlobal',
  'comisionGlobalFija',
  'comisionGlobalVenta',
  'bloquearEdicionPrecioVenta',
  'ocultarPrecioCosto',
  'ocultarPedidosEcommerce',
  'convertirEnSupervisor',
  'noPermitirVentaProductosGratuitos',
  'restringirTransferenciasASuSede',
  'bloquearCrearEliminarProductos',
  'bloquearDescuentos',
  'soloImagenesProductos',
  'puedeAnularComprobantes',
] as const;

export function sinCamposDelAdmin<T extends Record<string, any>>(
  editorRol: string | null | undefined,
  editorId: number | undefined,
  objetivoId: number,
  cuerpo: T,
): T {
  if (esAdmin(editorRol) || editorId == null || editorId !== objetivoId) {
    return cuerpo;
  }
  const limpio: Record<string, any> = { ...cuerpo };
  for (const campo of CAMPOS_QUE_DECIDE_EL_ADMIN) delete limpio[campo];
  return limpio as T;
}

export function parsearPermisos(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor as string[];
  if (typeof valor === 'string' && valor.trim()) {
    try {
      const parsed = JSON.parse(valor);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
