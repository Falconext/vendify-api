import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';
import { OlvaAgencia, OlvaApiService } from './olva-api.service';
import { armarEnvioOlva, celularOlva, tallaOlvaParaPeso } from './armar-envio';
import {
  derivarEstadoOlva,
  extraerGuiaOlva,
  OlvaDerivado,
  planPermiteCrearGuiasOlva,
  planPermiteOlva,
  separarGuiaOlva,
} from './olva.util';
import {
  ConfigOlvaDto,
  CotizarOlvaDto,
  CrearGuiaOlvaDto,
} from './dto/olva.dto';

export type { OlvaAgencia } from './olva-api.service';

/**
 * Servicio Olva de falconext-mype. Mismo reparto de responsabilidades que
 * Shalom: agencias, rastreo y cotización se resuelven con la API key global
 * (`OLVA_API_KEY`) y están disponibles en los planes Negocio y Corporativo;
 * CREAR guías consume el cupo de la cuenta y queda solo en Corporativo.
 *
 * A diferencia de Shalom Pro no hay "instancia" que conectar: el proveedor
 * (api.olva-api.lat) autentica todo con la misma API key. Lo único que cada
 * empresa configura es su agencia de origen.
 */
@Injectable()
export class OlvaService {
  private readonly logger = new Logger(OlvaService.name);
  // El snapshot de tracking persistido se considera fresco 10 min, igual que
  // Shalom: en ese lapso el modal responde al instante sin golpear a Olva.
  private readonly TRACK_CACHE_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: OlvaApiService,
  ) {}

  // ─── Catálogo ──────────────────────────────────────────────────────────────

  async getAgencias(_empresaId?: number) {
    return this.api.getAgencias();
  }

  async agenciasCercanas(lat: number, lng: number, limit = 5) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('Coordenadas inválidas.');
    }
    return {
      success: true,
      data: await this.api.agenciasCercanas(lat, lng, limit),
    };
  }

  async ubigeos() {
    return this.api.ubigeos();
  }

  async categoriasArticulo() {
    return this.api.categoriasArticulo();
  }

  async tamanosEstandar() {
    return this.api.tamanosEstandar();
  }

  async buscarPersona(docType: string, docNumber: string) {
    const tipo = String(docType ?? '').toUpperCase();
    if (tipo !== 'DNI' && tipo !== 'RUC' && tipo !== 'CE') {
      throw new BadRequestException('Tipo de documento no soportado por Olva.');
    }
    return this.api.buscarPersona(tipo, docNumber);
  }

  /** Cotización previa entre dos ubigeos (POST /catalog/calculate). */
  async cotizar(dto: CotizarOlvaDto) {
    return this.api.cotizar({
      ubigeo_code_origin: dto.ubigeoOrigen,
      ubigeo_code_destiny: dto.ubigeoDestino,
      delivery_type: dto.tipoEntrega ?? 'O',
      shipment_type: dto.tipoEnvio ?? 1,
      weight: dto.peso,
      partner_rate: dto.tarifaSocio ?? true,
    });
  }

  // ─── Configuración por empresa ─────────────────────────────────────────────

  /** Estado del módulo Olva para la empresa autenticada. */
  async getConfig(empresaId?: number) {
    if (!empresaId) return this.configDeshabilitada();
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        olvaAgenciaOrigenCodigo: true,
        olvaAgenciaOrigenNombre: true,
        olvaAgenciaOrigenUbigeo: true,
        olvaAutoTrackingActivo: true,
        ubigeo: true,
        plan: { select: { nombre: true, features: { select: { featureKey: true, enabled: true } } } },
      },
    });
    if (!empresa) return this.configDeshabilitada();
    return {
      habilitado: planPermiteOlva(empresa.plan),
      habilitadoPorPlan: planPermiteCrearGuiasOlva(empresa.plan),
      apiConfigurada: this.api.configurado,
      agenciaOrigenCodigo: empresa.olvaAgenciaOrigenCodigo,
      agenciaOrigenNombre: empresa.olvaAgenciaOrigenNombre,
      agenciaOrigenUbigeo: empresa.olvaAgenciaOrigenUbigeo ?? empresa.ubigeo,
      autoTrackingActivo: empresa.olvaAutoTrackingActivo,
    };
  }

  /** Forma neutra para ADMIN_SISTEMA o sesiones sin empresa. */
  private configDeshabilitada() {
    return {
      habilitado: false,
      habilitadoPorPlan: false,
      apiConfigurada: this.api.configurado,
      agenciaOrigenCodigo: null,
      agenciaOrigenNombre: null,
      agenciaOrigenUbigeo: null,
      autoTrackingActivo: false,
    };
  }

  /** Guarda la agencia de origen y el opt-in del rastreo automático. */
  async actualizarConfig(empresaId: number, dto: ConfigOlvaDto) {
    // Si mandan solo el código, completamos nombre y ubigeo desde el catálogo:
    // así la cotización y la guía no dependen de que el frontend los envíe.
    let nombre = dto.agenciaOrigenNombre;
    let ubigeo = dto.agenciaOrigenUbigeo;
    if (dto.agenciaOrigenCodigo && (!nombre || !ubigeo)) {
      const agencias = (await this.api.getAgencias()).data ?? [];
      const agencia = agencias.find(
        (a) => a.codigo === dto.agenciaOrigenCodigo,
      );
      if (agencia) {
        nombre = nombre ?? agencia.label;
        ubigeo = ubigeo ?? agencia.ubigeo;
      }
    }

    await this.prisma.empresa.update({
      where: { id: empresaId },
      data: {
        ...(dto.agenciaOrigenCodigo !== undefined
          ? { olvaAgenciaOrigenCodigo: dto.agenciaOrigenCodigo || null }
          : {}),
        ...(nombre !== undefined
          ? { olvaAgenciaOrigenNombre: nombre || null }
          : {}),
        ...(ubigeo !== undefined
          ? { olvaAgenciaOrigenUbigeo: ubigeo || null }
          : {}),
        ...(dto.autoTrackingActivo !== undefined
          ? { olvaAutoTrackingActivo: dto.autoTrackingActivo }
          : {}),
      },
    });
    return this.getConfig(empresaId);
  }

  // ─── Rastreo con caché ─────────────────────────────────────────────────────

  /** Busca el EnvioDespacho asociado a una guía Olva. */
  private async buscarEnvio(
    trackingNumber: string,
    empresaId?: number,
  ): Promise<{
    id: number;
    olvaEstado: string | null;
    olvaSyncAt: Date | null;
    olvaTrackingJson: any;
  } | null> {
    if (!trackingNumber) return null;
    return this.prisma.envioDespacho
      .findFirst({
        where: {
          // La guía generada se guarda con el año ("2965869-26") y acá llega sin él:
          // sin esto el snapshot no se guardaba y el panel seguía sin estado.
          OR: [
            { nroOrden: String(trackingNumber) },
            { nroOrden: { startsWith: `${trackingNumber}-` } },
          ],
          transportista: 'OLVA',
          ...(empresaId ? { comprobante: { empresaId } } : {}),
        },
        select: {
          id: true,
          olvaEstado: true,
          olvaSyncAt: true,
          olvaTrackingJson: true,
        },
        orderBy: { creadoEn: 'desc' },
      })
      .catch(() => null) as any;
  }

  /** Deriva el estado del snapshot y lo persiste en el EnvioDespacho. */
  private async persistir(
    envioId: number,
    trackData: any,
  ): Promise<OlvaDerivado> {
    const d = derivarEstadoOlva(trackData);
    await this.prisma.envioDespacho
      .update({
        where: { id: envioId },
        data: {
          olvaEstado: d.estado ?? undefined,
          olvaEntregado: d.entregado,
          olvaTrackingJson: trackData ?? undefined,
          olvaSyncAt: new Date(),
        },
      })
      .catch((e) =>
        this.logger.warn(
          `No se pudo persistir tracking Olva del envío ${envioId}: ${e?.message}`,
        ),
      );
    return d;
  }

  /** Rastreo en vivo, sin tocar la caché persistida. */
  async track(trackingNumber: string, year?: string, empresaId?: number) {
    const { numero, year: yearSufijo } = separarGuiaOlva(trackingNumber);
    return this.api.track(numero, {
      year: year ?? yearSufijo,
      fresh: true,
      empresaId,
    });
  }

  /**
   * Rastreo con read-through cache: si hay snapshot persistido fresco (<10 min)
   * lo devuelve al instante; si no, consulta Olva en vivo y lo persiste. Si el
   * upstream falla pero hay snapshot previo (aunque viejo), lo devuelve con
   * `stale: true` en vez de fallar.
   */
  async trackConCache(
    trackingNumber: string,
    year?: string,
    empresaId?: number,
    refresh = false,
  ): Promise<any> {
    const { numero, year: yearSufijo } = separarGuiaOlva(trackingNumber);
    const envio = await this.buscarEnvio(numero, empresaId);

    if (!refresh && envio?.olvaTrackingJson && envio.olvaSyncAt) {
      const edadMs = Date.now() - new Date(envio.olvaSyncAt).getTime();
      if (edadMs < this.TRACK_CACHE_TTL_MS) {
        return {
          ...envio.olvaTrackingJson,
          cached: true,
          syncAt: envio.olvaSyncAt,
        };
      }
    }

    try {
      const fresco = await this.api.track(numero, {
        year: year ?? yearSufijo,
        fresh: refresh,
        empresaId,
      });
      // Una respuesta sin estado ni eventos (guía no encontrada / success:false)
      // no debe pisar un snapshot con datos: se conserva el previo como stale.
      const derivado = derivarEstadoOlva(fresco);
      const eventos = (fresco as any)?.data?.events ?? (fresco as any)?.events;
      const vacio = !derivado.estado && !(Array.isArray(eventos) && eventos.length);
      if (vacio && envio?.olvaTrackingJson) {
        this.logger.warn(
          `Olva no encontró la guía ${numero}; se conserva el snapshot previo del envío ${envio.id}`,
        );
        return {
          ...envio.olvaTrackingJson,
          cached: true,
          stale: true,
          noEncontrado: true,
          syncAt: envio.olvaSyncAt,
        };
      }
      if (envio) await this.persistir(envio.id, fresco);
      return { ...fresco, cached: false, syncAt: new Date() };
    } catch (err) {
      // Fallback: devolver el último snapshot conocido si Olva está caído.
      if (envio?.olvaTrackingJson) {
        this.logger.warn(
          `Olva no respondió; devolviendo snapshot en caché del envío ${envio.id}`,
        );
        return {
          ...envio.olvaTrackingJson,
          cached: true,
          stale: true,
          syncAt: envio.olvaSyncAt,
        };
      }
      throw err;
    }
  }

  // ─── Registro de guías (característica `tieneOlvaGuias` del plan) ─────────

  /** Empresa + plan, validando que el plan habilite crear guías. */
  private async empresaConOlvaPro(empresaId: number) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        id: true,
        ruc: true,
        razonSocial: true,
        nombreComercial: true,
        whatsappTienda: true,
        olvaAgenciaOrigenCodigo: true,
        olvaAgenciaOrigenNombre: true,
        olvaAgenciaOrigenUbigeo: true,
        plan: { select: { nombre: true, features: { select: { featureKey: true, enabled: true } } } },
      },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    if (!planPermiteCrearGuiasOlva(empresa.plan)) {
      throw new ForbiddenException(
        'Tu plan no incluye la creación de guías en Olva. Consulta con tu asesor para habilitarla.',
      );
    }
    if (!this.api.configurado) {
      throw new BadRequestException(
        'La API de Olva no está configurada. Contacta al administrador.',
      );
    }
    return empresa;
  }

  /**
   * Genera la guía en Olva desde el despacho de un comprobante y guarda el
   * número devuelto en `nroOrden` (lo que el rastreo necesita después).
   */
  async crearGuiaDesdeDespacho(
    comprobanteId: number,
    empresaId: number,
    dto: CrearGuiaOlvaDto = {},
  ) {
    const empresa = await this.empresaConOlvaPro(empresaId);

    const envio = await this.prisma.envioDespacho.findFirst({
      where: { comprobanteId, comprobante: { empresaId } },
      include: {
        comprobante: {
          select: {
            id: true,
            serie: true,
            correlativo: true,
            mtoImpVenta: true,
            cliente: {
              select: {
                nombre: true,
                nroDoc: true,
                telefono: true,
                email: true,
              },
            },
            detalles: { select: { descripcion: true, cantidad: true } },
          },
        },
      },
    });
    if (!envio) {
      throw new NotFoundException(
        'Este comprobante no tiene un despacho registrado.',
      );
    }
    if (envio.nroOrden && !dto.forzar) {
      throw new BadRequestException(
        `Este despacho ya tiene la guía ${envio.nroOrden} registrada.`,
      );
    }

    const agencias = (await this.api.getAgencias()).data ?? [];

    // Origen: la agencia configurada por el negocio (o la que llegue en el DTO).
    const origen = this.resolverAgencia(
      agencias,
      dto.origenCodigo ?? empresa.olvaAgenciaOrigenCodigo,
      empresa.olvaAgenciaOrigenNombre,
    );
    if (!origen) {
      throw new BadRequestException(
        'Configura la agencia Olva de origen de tu negocio antes de generar guías.',
      );
    }

    // Olva solo cobra en destino si se retira en agencia: a domicilio exige pago
    // con tarjeta (Niubiz) al registrar, y ese checkout todavía no existe aquí.
    const tipoEnvio = String(
      dto.tipoEnvio ?? envio.tipoEnvio ?? 'AGENCIA',
    ).toUpperCase();
    if (tipoEnvio === 'DOMICILIO') {
      throw new BadRequestException(
        'Por ahora la guía de Olva solo se genera con retiro en agencia. Para domicilio, regístrala en Olva y pega el N° de guía.',
      );
    }

    const cliente = envio.comprobante?.cliente;
    const documento = (
      dto.documento ??
      envio.dniDestinatario ??
      cliente?.nroDoc ??
      ''
    ).trim();
    const nombre = (
      dto.nombre ??
      envio.nombreDestinatario ??
      cliente?.nombre ??
      ''
    ).trim();
    if (!documento || !nombre) {
      throw new BadRequestException(
        'Falta el nombre o el documento del destinatario para generar la guía.',
      );
    }
    if (documento.length !== 8 && documento.length !== 11) {
      throw new BadRequestException(
        'Olva solo acepta DNI o RUC como documento del destinatario.',
      );
    }
    const celular = celularOlva(
      dto.telefono ?? envio.celularDest ?? cliente?.telefono,
    );
    if (celular.length !== 9) {
      throw new BadRequestException(
        'Olva exige el celular del destinatario (9 dígitos) para generar la guía.',
      );
    }

    const agenciaDestino = this.resolverAgencia(
      agencias,
      dto.destinoCodigo ?? envio.olvaAgenciaDestinoCodigo,
      dto.destinoNombre ?? envio.agenciaDestino,
    );
    if (!agenciaDestino) {
      throw new BadRequestException(
        'No se pudo identificar la agencia Olva de destino. Vuelve a elegirla en el despacho.',
      );
    }

    // Olva exige el peso; sin dato usamos 1 kg (el mínimo facturable habitual).
    const pesoKg = Number(dto.pesoKg ?? envio.pesoKg ?? 1) || 1;
    const talla = tallaOlvaParaPeso(pesoKg);
    if (!talla) {
      throw new BadRequestException(
        'Olva registra por API paquetes de hasta 10 kg. Para más peso, regístralo en Olva y pega el N° de guía.',
      );
    }
    const contenido =
      (dto.contenido ?? envio.contenidoPaquete ?? '').trim() ||
      this.describirContenido(envio);

    // Empresa no guarda correo: el aviso de Olva le llega al dueño de la cuenta.
    const dueno = await this.prisma.usuario.findFirst({
      where: { empresaId, rol: 'ADMIN_EMPRESA' },
      orderBy: { id: 'asc' },
      select: { email: true },
    });

    const cuerpo = armarEnvioOlva({
      ruc: empresa.ruc,
      razonSocial: empresa.razonSocial,
      celularRemitente: empresa.whatsappTienda,
      correoRemitente: dueno?.email,
      documentoDestinatario: documento,
      nombreDestinatario: nombre,
      celularDestinatario: celular,
      correoDestinatario: cliente?.email,
      sedeOrigenId: origen.sedeId,
      agenciaOrigen: origen.codigo,
      agenciaDestino: agenciaDestino.codigo,
      talla,
      contenido,
      valorDeclarado: Number(
        dto.valorDeclarado ?? envio.comprobante?.mtoImpVenta ?? 0,
      ),
      clave: envio.claveEnvio,
    });

    // La clave depende del contenido: corregir un dato rechazado debe poder
    // reintentarse, pero el mismo pedido no crea dos guías. `forzar` sí crea otra.
    const huella = createHash('sha1')
      .update(JSON.stringify(cuerpo))
      .digest('hex')
      .slice(0, 16);
    const respuesta = await this.api.crearEnvio(
      cuerpo,
      `despacho-${envio.id}-${huella}${dto.forzar ? `-${Date.now()}` : ''}`,
    );

    const guia = extraerGuiaOlva(respuesta);
    if (!guia.trackingNumber) {
      this.logger.warn(
        `Olva registró el envío del comprobante ${comprobanteId} pero no devolvió N° de guía reconocible`,
      );
    }

    const actualizado = await this.prisma.envioDespacho.update({
      where: { id: envio.id },
      data: {
        ...(guia.trackingNumber
          ? { nroOrden: guia.trackingNumber, codigoGuia: guia.trackingNumber }
          : {}),
        olvaAgenciaDestinoCodigo: agenciaDestino.codigo,
        ...(respuesta?.data?.securityPin
          ? { claveEnvio: String(respuesta.data.securityPin) }
          : {}),
        olvaRespuestaJson: respuesta ?? undefined,
        olvaGuiaCreadaEn: new Date(),
        pesoKg,
      },
      select: {
        id: true,
        nroOrden: true,
        codigoGuia: true,
        claveEnvio: true,
        olvaAgenciaDestinoCodigo: true,
        olvaGuiaCreadaEn: true,
      },
    });

    return { ...actualizado, respuesta };
  }

  // ─── Sincronización para el cron ───────────────────────────────────────────

  /**
   * Refresca el tracking de un envío y persiste el snapshot. Devuelve también la
   * etapa previa para que el scheduler sepa si el paquete realmente avanzó.
   */
  async sincronizarEnvio(
    envioId: number,
    trackingNumber: string,
    empresaId?: number,
  ): Promise<{ estadoPrevio: string | null; derivado: OlvaDerivado }> {
    const previo = await this.prisma.envioDespacho
      .findUnique({ where: { id: envioId }, select: { olvaEstado: true } })
      .catch(() => null);
    const { numero, year } = separarGuiaOlva(trackingNumber);
    const trackData = await this.api.track(numero, {
      year,
      fresh: true,
      empresaId,
    });
    const derivado = await this.persistir(envioId, trackData);
    return { estadoPrevio: previo?.olvaEstado ?? null, derivado };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Descripción del contenido (fallback: los ítems del comprobante). */
  private describirContenido(envio: any): string {
    const detalles: string[] = (envio.comprobante?.detalles ?? []).map(
      (d: any) =>
        `${Math.max(1, Math.round(Number(d.cantidad) || 1))} ${String(d.descripcion ?? '').trim()}`.trim(),
    );
    const texto = detalles.filter(Boolean).join(', ');
    return texto || 'Mercadería';
  }

  /**
   * Resuelve una agencia por código o, si solo hay texto (lo que guarda hoy el
   * despacho: "Nombre - Provincia - Departamento"), por coincidencia normalizada.
   */
  private resolverAgencia(
    agencias: OlvaAgencia[],
    codigo?: string | null,
    texto?: string | null,
  ): OlvaAgencia | null {
    const id = String(codigo ?? '').trim();
    if (id) {
      const porCodigo = agencias.find((a) => a.codigo === id);
      if (porCodigo) return porCodigo;
    }
    const buscado = this.normalizar(texto);
    if (!buscado) return null;
    return (
      agencias.find((a) => this.normalizar(a.label) === buscado) ??
      agencias.find(
        (a) =>
          this.normalizar([a.nombre, a.provincia, a.departamento].join(' ')) ===
          buscado,
      ) ??
      agencias.find((a) => this.normalizar(a.label).includes(buscado)) ??
      null
    );
  }

  private normalizar(v?: string | null): string {
    return String(v ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
}
