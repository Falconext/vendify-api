type EnvioEmpresa = {
  costoEnvioFijo?: unknown;
  envioGratisDesdeSoles?: unknown;
  envioACoordinar?: boolean | null;
};

/**
 * Lo que se le cobra por envío a un pedido de la tienda. Si el negocio coordina
 * el envío aparte no se cobra aquí, aunque tenga un costo fijo guardado.
 */
export const costoEnvioDelPedido = (
  empresa: EnvioEmpresa,
  tipoEntrega: string,
  subtotal: number,
): number => {
  if (tipoEntrega !== 'ENVIO' || empresa.envioACoordinar) return 0;
  const umbral = Number(empresa.envioGratisDesdeSoles || 0);
  return umbral > 0 && subtotal >= umbral
    ? 0
    : Number(empresa.costoEnvioFijo || 0);
};

/**
 * Datos de envío que ve la tienda pública. Sin costo ni umbral, las plantillas
 * dejan de anunciar por su cuenta el costo o el "te falta para envío gratis".
 */
export const envioPublico = <T extends EnvioEmpresa>(empresa: T): T =>
  empresa.envioACoordinar
    ? ({ ...empresa, costoEnvioFijo: 0, envioGratisDesdeSoles: 0 } as T)
    : empresa;
