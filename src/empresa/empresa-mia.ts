import { ForbiddenException } from '@nestjs/common';

/**
 * Lo que una empresa puede cambiar de sí misma por `PUT /empresa/mia`. El cuerpo
 * llega como Partial<> y no pasa por class-validator, así que lo que no esté en
 * estas listas se descarta: plan, vencimiento, marca, RUC o facturación solo se
 * cambian desde sistema.
 */

/** Preferencias del día a día: las usa el POS y la impresión. */
const CAMPOS_PREFERENCIA = [
  'cotizMostrarEmail',
  'cotizMostrarCuentas',
  'cotizMostrarRazonSocial',
  'cotizMostrarDetraccion',
  'cotizFormatoConfig',
  'cotizTerminosDefault',
  'cotizObservacionesDefault',
  'ventaObservacionesDefault',
  'notaVentaFormatoConfig',
  'facturaFormatoConfig',
  'boletaFormatoConfig',
  'posMantenerBusqueda',
  'posComprobanteDefault',
  'mostrarQrSunat',
  'mostrarMarcaSistema',
  'kitsComoUnaLinea',
  'paquetesComoUnaLinea',
  'formatoImpresionDefault',
  'imprimirAutomatico',
  'ticketLogoSize',
  'usaCodigoBarrasManual',
  'usarPrecioLoteFefo',
] as const;

/** Datos del negocio, controles y credenciales: solo el administrador de la empresa. */
const CAMPOS_SOLO_ADMIN = [
  'nombreComercial',
  'direccion',
  'departamento',
  'provincia',
  'distrito',
  'ubigeo',
  'regimenTributario',
  'esAgenteRetencion',
  'paginaWeb',
  'logo',
  'directorTecnico',
  'cuentaDetraccionBN',
  'bancoNombre',
  'numeroCuenta',
  'cci',
  'monedaCuenta',
  'yapeNumero',
  'yapeQrUrl',
  'plinNumero',
  'plinQrUrl',
  'criterioIgvVentas',
  'leyAmazonia',
  'cobranzaCampo',
  'catalogoPorSede',
  'permitirFechaAnteriorEnSerie',
  'permitirVentaSinStock',
  'permitirStockNegativo',
  'requiereAprobacionGastos',
  'requiereAprobacionCompras',
  'requiereCajaParaEmitir',
  'cajaPrellenarMontosCierre',
  'posExigirCpeMedioPago',
  'offlineHabilitado',
  'mayoristaMezclaActivo',
  'mayoristaMezclaCategoriaIds',
  'usuarioPse',
  'contrasenaPse',
  'sunatClientId',
  'sunatClientSecret',
  'sireClientId',
  'sireClientSecret',
  'sireUsuarioSol',
  'sireClaveSol',
  'culqiPublicKey',
  'culqiSecretKey',
  'culqiActivo',
  'niubizMerchantId',
  'niubizUsuario',
  'niubizPassword',
  'niubizActivo',
  'pasarelasUsaDemo',
  'whatsappProvider',
  'whatsappApiToken',
  'whatsappPhoneNumberId',
  'whatsappBusinessId',
  'whatsappActivo',
  'shalomEmail',
  'shalomPassword',
] as const;

const SECRETOS = [
  'providerToken',
  'billingApiToken',
  'billingApiPassword',
  'whatsappApiToken',
  'takiyAppKey',
  'takiyAuthKey',
  'instagramToken',
  'tiktokToken',
  'tiktokRefreshToken',
  'facebookPageToken',
  'shalomPassword',
  'culqiSecretKey',
  'niubizPassword',
  'contrasenaPse',
  'sunatClientSecret',
  'sireClientSecret',
  'sireClaveSol',
  'mpAccessToken',
  'mpRefreshToken',
] as const;

export function camposDeMiEmpresa(
  cuerpo: Record<string, unknown> | null | undefined,
  rol: string,
): Record<string, unknown> {
  const datos = cuerpo ?? {};
  const presente = (campo: string) => datos[campo] !== undefined;

  if (rol !== 'ADMIN_EMPRESA' && CAMPOS_SOLO_ADMIN.some(presente)) {
    throw new ForbiddenException(
      'Solo el administrador de la empresa puede cambiar esta configuración.',
    );
  }

  const permitidos: Record<string, unknown> = {};
  for (const campo of [...CAMPOS_PREFERENCIA, ...CAMPOS_SOLO_ADMIN]) {
    if (presente(campo)) permitidos[campo] = datos[campo];
  }
  return permitidos;
}

/** La empresa como se le entrega al navegador: los secretos salen como booleanos, igual que en auth/me. */
export function empresaSinSecretos<T extends Record<string, any>>(empresa: T) {
  const copia: Record<string, any> = {
    ...empresa,
    whatsappApiTokenConfigured: Boolean(
      empresa.whatsappApiToken ||
        (empresa.whatsappProvider === 'EMPRESA' &&
          empresa.whatsappPhoneNumberId),
    ),
    shalomConfigured: Boolean(empresa.shalomPassword),
  };
  for (const secreto of SECRETOS) delete copia[secreto];
  return copia;
}
