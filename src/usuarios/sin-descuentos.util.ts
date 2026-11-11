import { ForbiddenException } from '@nestjs/common';

/**
 * Cajero con `bloquearDescuentos`: no rebaja la venta ni la cotización.
 *
 * El POS pliega el descuento por línea (y el global de boleta/factura) dentro
 * de `nuevoValorUnitario` y manda aparte el precio de lista en
 * `precioUnitarioOriginal`; por eso una línea más barata que su precio de
 * lista cuenta como descuento. El global viaja en `descuento` /
 * `montoDescuentoGlobal`, el de cotización en `cotizDescuento` y el de OT en
 * `descuentoOT` / `descuentoPorcOT`.
 *
 * Bajar el precio a mano lo cubre `bloquearEdicionPrecioVenta`, no esto.
 * ADMIN_EMPRESA no se restringe nunca.
 */
const CAMPOS_GLOBALES = [
  'descuento',
  'montoDescuentoGlobal',
  'cotizDescuento',
  'descuentoOT',
  'descuentoPorcOT',
] as const;

export function verificarSinDescuentos(
  user: { rol?: string; bloquearDescuentos?: boolean } | undefined,
  dto: any,
) {
  if (user?.rol !== 'USUARIO_EMPRESA' || !user.bloquearDescuentos) return;
  const global = CAMPOS_GLOBALES.some((c) => Number(dto?.[c] ?? 0) > 0);
  const linea = (Array.isArray(dto?.detalles) ? dto.detalles : []).some(
    (d: any) =>
      Number(d?.descuento ?? 0) > 0 ||
      (d?.precioUnitarioOriginal != null &&
        d?.nuevoValorUnitario != null &&
        Number(d.nuevoValorUnitario) < Number(d.precioUnitarioOriginal) - 0.005),
  );
  if (global || linea) {
    throw new ForbiddenException(
      'No tienes permiso para dar descuentos. Pídele a tu administrador que lo aplique o que te lo habilite en Usuarios.',
    );
  }
}
