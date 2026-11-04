/**
 * El enlace con el que el cliente llena él mismo sus datos de envío.
 *
 * El problema que resuelve: en los envíos a provincia los datos de la
 * etiqueta (nombre, DNI, celular, agencia) se piden por WhatsApp y llegan en
 * tres o cuatro mensajes sueltos, con el DNI mal tipeado o la agencia como
 * "la de Shalom de Arequipa". Alguien los copia a mano al despacho y, si se
 * equivoca, el paquete se queda en la agencia porque el nombre no coincide
 * con el DNI.
 *
 * Con el enlace el cliente elige su agencia de la lista real de Shalom u
 * Olva y escribe su DNI una sola vez: lo que llega al despacho es lo mismo
 * que pide el courier para generar la guía.
 *
 * Mismas reglas que el enlace del repartidor (`acceso-repartidor.ts`): el
 * token es la única credencial y abre UN despacho. Pero se cierra antes: en
 * cuanto el paquete sale o se genera la guía, cambiar el destino ya no sirve
 * de nada y solo confundiría.
 */
import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  COURIERS_TIENDA,
  NOMBRE_COURIER,
  couriersValidos,
  type CourierTienda,
} from '../tienda/envio-agencia';

/** 32 bytes de aleatorio real, en base64url porque viaja en un WhatsApp. */
export function nuevoTokenDatosCliente(): string {
  return randomBytes(32).toString('base64url');
}

export interface DespachoParaDatosCliente {
  estado: string;
  transportista?: string | null;
  codigoGuia?: string | null;
  nroOrden?: string | null;
  shalomGuiaCreadaEn?: Date | null;
  olvaGuiaCreadaEn?: Date | null;
}

/**
 * ¿El cliente todavía puede llenar o corregir sus datos?
 *
 * Solo mientras el pedido se está preparando y no hay guía: con la guía
 * hecha, el destino ya está en el sistema del courier y cambiarlo acá
 * dejaría la etiqueta y el despacho diciendo cosas distintas.
 */
export function enlaceDatosClienteVigente(
  d: DespachoParaDatosCliente | null | undefined,
): boolean {
  if (!d) return false;
  // Confirmado = rótulo impreso, todavía en el local: el cliente aún puede corregir.
  if (d.estado !== 'PREPARANDO' && d.estado !== 'CONFIRMADO') return false;
  if (d.shalomGuiaCreadaEn || d.olvaGuiaCreadaEn) return false;
  if (d.codigoGuia?.trim() || d.nroOrden?.trim()) return false;
  return true;
}

/**
 * Qué agencias se le ofrecen al cliente.
 *
 * Si el negocio ya eligió courier en el despacho, solo ese: ofrecer Olva a
 * quien despacha por Shalom sería prometer un envío que no va a hacer. Si
 * no eligió, las que encendió para su tienda, y si tampoco, las dos.
 */
export function couriersParaCliente(
  transportista: string | null | undefined,
  couriersTienda: unknown,
): CourierTienda[] {
  const t = String(transportista ?? '').toUpperCase();
  if (t.startsWith('SHALOM')) return ['SHALOM'];
  if (t === 'OLVA') return ['OLVA'];
  const tienda = couriersValidos(couriersTienda);
  return tienda.length ? tienda : [...COURIERS_TIENDA];
}

export type ModoEntrega = 'DOMICILIO' | CourierTienda;

/** Lo que manda la página pública. Todo llega como texto suelto. */
export interface DatosClienteEntrada {
  nombre?: unknown;
  documento?: unknown;
  celular?: unknown;
  modo?: unknown;
  agenciaId?: unknown;
  agenciaNombre?: unknown;
  direccion?: unknown;
  distrito?: unknown;
  referencia?: unknown;
}

const texto = (v: unknown, max: number) =>
  String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Valida lo que escribió el cliente y lo traduce a campos del despacho.
 *
 * Es la única puerta: el endpoint es público, así que nada de lo que llega
 * se guarda sin pasar por acá.
 */
export function datosDelClienteParaDespacho(
  entrada: DatosClienteEntrada,
  opciones: { couriers: CourierTienda[]; transportistaActual?: string | null },
) {
  const nombre = texto(entrada.nombre, 120);
  if (nombre.length < 3) {
    throw new BadRequestException('Escribe tu nombre completo.');
  }
  const celular = String(entrada.celular ?? '').replace(/\D/g, '').slice(-9);
  if (!/^9\d{8}$/.test(celular)) {
    throw new BadRequestException('Escribe tu celular de 9 dígitos.');
  }
  const documento = String(entrada.documento ?? '').replace(/\D/g, '');
  const modo = String(entrada.modo ?? '').toUpperCase() as ModoEntrega;

  if (modo === 'DOMICILIO') {
    const direccion = texto(entrada.direccion, 300);
    if (direccion.length < 5) {
      throw new BadRequestException('Escribe la dirección de entrega.');
    }
    if (documento && ![8, 9, 11].includes(documento.length)) {
      throw new BadRequestException('Revisa tu DNI: tiene que tener 8 dígitos.');
    }
    const distrito = texto(entrada.distrito, 100);
    const referencia = texto(entrada.referencia, 300);
    return {
      tipoEnvio: 'DOMICILIO',
      nombreDestinatario: nombre,
      celularDest: celular,
      ...(documento ? { dniDestinatario: documento } : {}),
      direccionDestino: direccion,
      // El despacho muestra el destino en `agenciaDestino` también para
      // domicilio (así lo arma el panel).
      agenciaDestino: distrito ? `${direccion} - ${distrito}` : direccion,
      ...(distrito ? { distrito } : {}),
      ...(referencia ? { observaciones: referencia } : {}),
    };
  }

  if (!(opciones.couriers as string[]).includes(modo)) {
    throw new BadRequestException('Elige una de las agencias de la lista.');
  }
  const agenciaNombre = texto(entrada.agenciaNombre, 200);
  if (!agenciaNombre) {
    throw new BadRequestException('Elige la agencia donde recogerás tu pedido.');
  }
  // La agencia entrega solo con documento: sin él, el paquete se queda ahí.
  if (![8, 9, 11].includes(documento.length)) {
    throw new BadRequestException(
      'Escribe tu DNI: la agencia lo pide para entregarte el paquete.',
    );
  }
  const agenciaId = texto(entrada.agenciaId, 40) || null;
  const courier = modo as CourierTienda;
  const actual = String(opciones.transportistaActual ?? '').toUpperCase();
  return {
    // Shalom COD o PRO lo decidió el negocio: no se le cambia.
    transportista:
      courier === 'SHALOM'
        ? actual.startsWith('SHALOM') ? actual : 'SHALOM_PRO'
        : 'OLVA',
    tipoEnvio: 'AGENCIA',
    nombreDestinatario: nombre,
    celularDest: celular,
    dniDestinatario: documento,
    agenciaDestino: agenciaNombre,
    shalomAgenciaDestinoId: courier === 'SHALOM' ? agenciaId : null,
    olvaAgenciaDestinoCodigo: courier === 'OLVA' ? agenciaId : null,
  };
}

/** Cómo se cuenta en el historial y en el aviso al negocio. */
export function resumenDatosCliente(d: {
  tipoEnvio: string;
  nombreDestinatario: string;
  agenciaDestino: string;
  transportista?: string;
}): string {
  const donde =
    d.tipoEnvio === 'AGENCIA'
      ? `${d.transportista === 'OLVA' ? NOMBRE_COURIER.OLVA : NOMBRE_COURIER.SHALOM} - ${d.agenciaDestino}`
      : d.agenciaDestino;
  return `${d.nombreDestinatario} · ${donde}`;
}

