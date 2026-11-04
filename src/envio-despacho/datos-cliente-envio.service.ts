import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ShalomService } from '../shalom/shalom.service';
import { OlvaService } from '../olva/olva.service';
import { agenciasOlva, agenciasShalom } from '../tienda/envio-agencia';
import { EnvioDespachoService } from './envio-despacho.service';
import {
  couriersParaCliente,
  datosDelClienteParaDespacho,
  enlaceDatosClienteVigente,
  nuevoTokenDatosCliente,
  resumenDatosCliente,
  type DatosClienteEntrada,
} from './datos-cliente-envio';

const DESPACHO_PUBLICO = {
  id: true,
  comprobanteId: true,
  estado: true,
  transportista: true,
  codigoGuia: true,
  nroOrden: true,
  shalomGuiaCreadaEn: true,
  olvaGuiaCreadaEn: true,
  tipoEnvio: true,
  nombreDestinatario: true,
  dniDestinatario: true,
  celularDest: true,
  agenciaDestino: true,
  direccionDestino: true,
  distrito: true,
  observaciones: true,
  shalomAgenciaDestinoId: true,
  olvaAgenciaDestinoCodigo: true,
  datosClienteEn: true,
  historial: true,
  comprobante: {
    select: {
      empresaId: true,
      serie: true,
      correlativo: true,
      clienteId: true,
      cliente: { select: { nombre: true, nroDoc: true, telefono: true } },
      detalles: { select: { cantidad: true, descripcion: true } },
      empresa: {
        select: { razonSocial: true, nombreComercial: true, couriersTienda: true },
      },
    },
  },
} as const;

/** Ver `datos-cliente-envio.ts`. */
@Injectable()
export class DatosEnvioClienteService {
  private readonly logger = new Logger(DatosEnvioClienteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly despacho: EnvioDespachoService,
    @Optional() private readonly notificaciones?: NotificacionesService,
    @Optional() private readonly shalom?: ShalomService,
    @Optional() private readonly olva?: OlvaService,
  ) {}

  /**
   * El enlace para mandarle al cliente.
   *
   * Si la venta todavía no tenía despacho, lo crea: el caso típico es vender
   * por WhatsApp, emitir la nota y pedir los datos en el mismo momento. Es
   * idempotente, igual que el del repartidor: un token nuevo dejaría muerto
   * el enlace que el cliente ya tiene en su chat.
   */
  async enlace(comprobanteId: number, empresaId: number, usuarioId?: number) {
    const comprobante = await this.prisma.comprobante.findFirst({
      where: { id: comprobanteId, empresaId },
      select: {
        id: true,
        serie: true,
        correlativo: true,
        cliente: { select: { nombre: true, telefono: true } },
      },
    });
    if (!comprobante) throw new NotFoundException('Comprobante no encontrado.');

    let envio = await this.prisma.envioDespacho.findUnique({
      where: { comprobanteId },
      select: { ...DESPACHO_PUBLICO, datosClienteToken: true },
    });
    if (!envio) {
      await this.despacho.create(
        comprobanteId,
        empresaId,
        { tipoEnvio: 'AGENCIA' } as never,
        usuarioId,
      );
      envio = await this.prisma.envioDespacho.findUnique({
        where: { comprobanteId },
        select: { ...DESPACHO_PUBLICO, datosClienteToken: true },
      });
    }
    if (!enlaceDatosClienteVigente(envio)) {
      throw new BadRequestException(
        'Este envío ya tiene guía o ya salió: los datos se corrigen desde el despacho.',
      );
    }
    const token =
      envio!.datosClienteToken ??
      (
        await this.prisma.envioDespacho.update({
          where: { id: envio!.id },
          data: { datosClienteToken: nuevoTokenDatosCliente() },
          select: { datosClienteToken: true },
        })
      ).datosClienteToken!;

    return {
      token,
      pedido: `${comprobante.serie}-${String(comprobante.correlativo).padStart(8, '0')}`,
      cliente: comprobante.cliente?.nombre ?? null,
      telefono: envio!.celularDest || comprobante.cliente?.telefono || null,
    };
  }

  private async porToken(token: string) {
    if (!token?.trim()) return null;
    const d = await this.prisma.envioDespacho.findUnique({
      where: { datosClienteToken: token },
      select: DESPACHO_PUBLICO,
    });
    return enlaceDatosClienteVigente(d) ? d : null;
  }

  /**
   * Lo que ve el cliente al abrir el enlace.
   *
   * Lo mínimo para reconocer su pedido (número y qué lleva) y lo que ya se
   * sabe de él, para que no lo escriba de nuevo. Nada de montos: el enlace
   * puede reenviarse.
   */
  async verPorToken(token: string) {
    const d = await this.porToken(token);
    if (!d) return null;
    const c = d.comprobante;
    const couriers = couriersParaCliente(d.transportista, c.empresa.couriersTienda);
    const docCliente = String(c.cliente?.nroDoc ?? '').replace(/\D/g, '');
    const modo =
      d.tipoEnvio === 'DOMICILIO'
        ? 'DOMICILIO'
        : d.olvaAgenciaDestinoCodigo || d.transportista === 'OLVA'
          ? 'OLVA'
          : couriers[0];
    return {
      negocio: c.empresa.nombreComercial || c.empresa.razonSocial,
      pedido: `${c.serie}-${String(c.correlativo).padStart(8, '0')}`,
      items: c.detalles.map((x) => ({
        cantidad: Number(x.cantidad),
        descripcion: x.descripcion,
      })),
      couriers,
      completadoEn: d.datosClienteEn,
      datos: {
        nombre: d.nombreDestinatario || c.cliente?.nombre || '',
        documento:
          d.dniDestinatario || ([8, 9, 11].includes(docCliente.length) ? docCliente : ''),
        celular: String(d.celularDest || c.cliente?.telefono || '').replace(/\D/g, '').slice(-9),
        modo,
        // La agencia solo se precarga si es de la lista (tiene id): un texto
        // libre no se puede volver a elegir en el buscador.
        agenciaId:
          d.tipoEnvio === 'AGENCIA'
            ? d.shalomAgenciaDestinoId || d.olvaAgenciaDestinoCodigo || ''
            : '',
        agenciaNombre:
          d.tipoEnvio === 'AGENCIA' && (d.shalomAgenciaDestinoId || d.olvaAgenciaDestinoCodigo)
            ? d.agenciaDestino || ''
            : '',
        direccion: d.tipoEnvio === 'DOMICILIO' ? d.direccionDestino || '' : '',
        distrito: d.tipoEnvio === 'DOMICILIO' ? d.distrito || '' : '',
        referencia: d.tipoEnvio === 'DOMICILIO' ? d.observaciones || '' : '',
      },
    };
  }

  /** Agencias del courier, solo si el enlace las ofrece. */
  async agenciasPorToken(token: string, courier: string) {
    const d = await this.porToken(token);
    if (!d) return null;
    const c = String(courier ?? '').toUpperCase();
    const couriers = couriersParaCliente(
      d.transportista,
      d.comprobante.empresa.couriersTienda,
    );
    if (!(couriers as string[]).includes(c)) {
      throw new BadRequestException('Este envío no sale por esa agencia.');
    }
    if (c === 'SHALOM') {
      const r = await this.shalom?.getAgencias();
      return agenciasShalom(r?.data ?? []);
    }
    const r = await this.olva?.getAgencias();
    return agenciasOlva(r?.data ?? []);
  }

  /**
   * Guarda lo que llenó el cliente en el despacho.
   *
   * Va directo a la tabla y no por `EnvioDespachoService.update`: ese camino
   * es el del panel (cobros, adelantos, avisos de estado) y acá solo cambia
   * el destino. Queda una línea en el historial para saber que lo escribió
   * el cliente y no alguien de la oficina.
   */
  async guardarPorToken(token: string, entrada: DatosClienteEntrada) {
    const d = await this.porToken(token);
    if (!d) return null;
    const couriers = couriersParaCliente(
      d.transportista,
      d.comprobante.empresa.couriersTienda,
    );
    const datos = datosDelClienteParaDespacho(entrada, {
      couriers,
      transportistaActual: d.transportista,
    });
    const resumen = resumenDatosCliente(datos as never);
    const corrige = !!d.datosClienteEn;
    const historial = [
      ...(Array.isArray(d.historial) ? (d.historial as any[]) : []),
      {
        estado: d.estado,
        fecha: new Date().toISOString(),
        nota: `${corrige ? 'El cliente corrigió' : 'El cliente completó'} sus datos de envío por el enlace: ${resumen}`,
        usuarioNombre: 'Cliente (enlace)',
      },
    ];
    await this.prisma.envioDespacho.update({
      where: { id: d.id },
      data: { ...datos, historial, datosClienteEn: new Date() },
    });

    // El próximo despacho del mismo cliente ya sale con su celular.
    const c = d.comprobante;
    if (c.clienteId && !String(c.cliente?.telefono ?? '').trim()) {
      await this.prisma.cliente
        .update({ where: { id: c.clienteId }, data: { telefono: datos.celularDest } })
        .catch(() => undefined);
    }

    const pedido = `${c.serie}-${String(c.correlativo).padStart(8, '0')}`;
    await this.notificaciones
      ?.notificarAdminsEmpresa({
        empresaId: c.empresaId,
        tipo: 'INFO',
        titulo: corrige
          ? `${pedido}: el cliente corrigió sus datos de envío`
          : `${pedido}: el cliente llenó sus datos de envío`,
        mensaje: `${resumen}. Ya puedes generar la guía o imprimir el rótulo.`,
        metaData: { comprobanteId: d.comprobanteId, origen: 'DATOS_ENVIO_CLIENTE' },
      })
      .catch((e) =>
        this.logger.warn(`No se pudo avisar de los datos de envío de ${pedido}: ${e?.message}`),
      );
    this.logger.log(`Despacho ${d.comprobanteId}: datos de envío llenados por el cliente.`);
    return { ok: true, resumen };
  }
}
