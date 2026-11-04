/**
 * Datos del conductor que SUNAT exige en una guía con vehículo propio.
 *
 * El sistema solo pedía DNI y placa en transporte privado, así que una guía sin
 * licencia se guardaba y se enviaba, y SUNAT la rechazaba con el código 2572:
 * "no existe informacion del Numero de licencia del conductor" (FORKLIFT HNS,
 * guía T001-25, 03-11). Se valida al guardar y otra vez antes de enviar, para
 * que el error salga en el sistema y no en SUNAT.
 *
 * Vive aparte del servicio para poder probarse sin Prisma.
 */

export interface GuiaConConductor {
  tipoGuia?: string | null;
  modoTransporte?: string | null;
  vehiculoM1oL?: boolean | null;
  conductorNumDoc?: string | null;
  conductorNombre?: string | null;
  conductorApellidos?: string | null;
  conductorLicencia?: string | null;
  vehiculoPlaca?: string | null;
}

/** Licencia de conducir peruana: letra + DNI (Q43808239), 9 o 10 caracteres. */
export const LICENCIA_VALIDA = /^[A-Z0-9]{9,10}$/;

const limpio = (v?: string | null) => String(v ?? '').trim();

/**
 * Mensaje con lo que falta del conductor y el vehículo, o null si está
 * completo o la guía no lo necesita (transporte público, o vehículo M1/L,
 * que SUNAT exonera). La GRE-T tiene sus propias reglas en el servicio.
 */
export function faltaDatoDelConductor(guia: GuiaConConductor): string | null {
  if (guia.tipoGuia === 'TRANSPORTISTA') return null;
  if (guia.modoTransporte !== '02' || guia.vehiculoM1oL) return null;

  const faltan: string[] = [];
  if (!limpio(guia.vehiculoPlaca)) faltan.push('placa del vehículo');
  if (!limpio(guia.conductorNumDoc)) faltan.push('DNI del conductor');
  if (!limpio(guia.conductorNombre)) faltan.push('nombres del conductor');
  if (!limpio(guia.conductorApellidos)) faltan.push('apellidos del conductor');
  if (!limpio(guia.conductorLicencia)) faltan.push('N° de licencia del conductor');
  if (faltan.length) {
    return `Para transporte privado SUNAT exige: ${faltan.join(', ')}.`;
  }

  const licencia = limpio(guia.conductorLicencia).toUpperCase();
  if (!LICENCIA_VALIDA.test(licencia)) {
    return 'La licencia del conductor debe tener 9 o 10 letras y números (por ejemplo Q43808239), sin guiones ni espacios.';
  }
  return null;
}
