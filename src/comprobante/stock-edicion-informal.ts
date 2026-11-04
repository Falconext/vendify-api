/**
 * Qué cantidades cuentan para el stock al editar un informal (pedido LINNA MODA
 * 2026-11-03).
 *
 * La edición mueve solo la diferencia (nueva − anterior), y eso supone que lo
 * anterior ya salió del almacén. No siempre es así: una Nota de Pedido se crea
 * sin descontar salvo que se marque "Descontar del stock ahora", y una OT del
 * endpoint `crearOT` tampoco descuenta. Tratarlas como descontadas tenía dos
 * efectos:
 * - marcar la casilla al editar no hacía nada (diferencia 0);
 * - subir una cantidad de 1 a 2 descontaba 1 que el pedido nunca había tomado,
 *   y bajarla devolvía al stock algo que nunca salió.
 *
 * Si el comprobante descontó se mide en el kardex (alguna SALIDA suya), igual
 * que al convertir una NP/OT, en vez de deducirlo del tipo de documento.
 */
export function stockEnEdicion(params: {
  tipoDoc: string;
  /** El comprobante tiene alguna SALIDA en el kardex. */
  yaDescontoStock: boolean;
  /** La casilla "Descontar del stock ahora" (solo Nota de Pedido). */
  descontarStock?: boolean;
}): { contarAnterior: boolean; contarNueva: boolean } {
  const { tipoDoc, yaDescontoStock, descontarStock } = params;
  // NV, TICKET, RH, CP siempre descuentan al emitirse; lo que ya descontó
  // sigue la regla de la diferencia (la casilla no lo devuelve al stock).
  if (yaDescontoStock || (tipoDoc !== 'NP' && tipoDoc !== 'OT')) {
    return { contarAnterior: true, contarNueva: true };
  }
  // Nunca descontó: lo anterior no cuenta. Una NP descuenta ahora todo lo
  // nuevo si se marcó la casilla; si no, sigue sin tocar el stock.
  return { contarAnterior: false, contarNueva: tipoDoc === 'NP' && descontarStock === true };
}
