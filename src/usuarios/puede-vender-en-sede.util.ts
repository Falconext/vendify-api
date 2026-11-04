import { ForbiddenException } from '@nestjs/common';

/**
 * Sedes donde el usuario entra pero no vende: al vendedor se le asignan varias
 * (para ver stock, cotizar o trasladar) y solo emite ventas en algunas. La marca
 * vive en `UsuarioSede.puedeVender` y `JwtStrategy` la relee en cada request.
 *
 * Cotizaciones, notas de pedido y órdenes de trabajo no son venta. Lo demás
 * (Boleta, Factura, Nota de venta, Ticket...) se rechaza. El admin no se restringe.
 */
export const TIPOS_QUE_NO_SON_VENTA = new Set(['COT', 'NP', 'OT']);

export function verificarPuedeVenderEnSede(
  user: { rol?: string; sedeId?: number | null; sedesSinVenta?: number[] },
  tipoDoc?: string,
  /** Sede del body: solo cuenta si el token no trae sede, igual que al emitir. */
  sedeIdBody?: number | null,
) {
  if (user?.rol !== 'USUARIO_EMPRESA') return;
  if (tipoDoc && TIPOS_QUE_NO_SON_VENTA.has(String(tipoDoc))) return;
  const sinVenta = user.sedesSinVenta ?? [];
  const sedeId = user.sedeId ?? sedeIdBody;
  // Sin sede elegida (token de selección) no se sabe dónde caería la venta.
  if (sinVenta.length > 0 && (sedeId == null || sinVenta.includes(Number(sedeId)))) {
    throw new ForbiddenException(
      'No puedes vender en esta sede. Cambia a una sede donde tengas venta habilitada o pídele a tu administrador que te la habilite en Usuarios.',
    );
  }
}
