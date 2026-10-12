import { Injectable, BadRequestException } from '@nestjs/common';
import {
  SireClient,
  type SireCredenciales,
} from '../common/utils/sire.client';
import { descifrarSecreto } from '../common/utils/secreto.util';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import * as nodemailer from 'nodemailer';
import { factorCompraASoles } from '../common/utils/moneda-compra';

// Map compras tipoDoc text → SUNAT código catálogo 01
const TIPO_DOC_COMPRA_MAP: Record<string, string> = {
  FACTURA: '01',
  BOLETA: '03',
  RECIBO_HONORARIOS: '02',
  LIQUIDACION: '04',
  TICKET: '03',
  NOTA_DEBITO: '08',
  NOTA_CREDITO: '07',
};

@Injectable()
export class SireService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────── Helpers ────────────────

  private formatFecha(date: Date | null | undefined): string {
    if (!date) return '';
    const d = new Date(date.getTime() - 5 * 60 * 60 * 1000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private getPeriodo(mes: number, anio: number): string {
    return `${anio}${String(mes).padStart(2, '0')}00`;
  }

  private inferTipoDocIdentidad(
    nroDoc: string,
    tipoDocCodigo?: string,
  ): string {
    if (tipoDocCodigo) return tipoDocCodigo;
    if (!nroDoc) return '0';
    const clean = nroDoc.replace(/\D/g, '');
    if (clean.length === 11) return '6'; // RUC
    if (clean.length === 8) return '1'; // DNI
    return '0';
  }

  private fmt(val: number | null | undefined): string {
    return (val ?? 0).toFixed(2);
  }

  private getDateRange(mes: number, anio: number) {
    const inicio = new Date(
      `${anio}-${String(mes).padStart(2, '0')}-01T00:00:00.000-05:00`,
    );
    const lastDay = new Date(anio, mes, 0).getDate();
    const fin = new Date(
      `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999-05:00`,
    );
    return { gte: inicio, lte: fin };
  }

  private getNombreArchivo(
    tipo: 'ventas' | 'compras',
    mes: number,
    anio: number,
    ext: string,
  ): string {
    const periodo = `${anio}${String(mes).padStart(2, '0')}`;
    return `SIRE_${tipo === 'ventas' ? 'RVIE' : 'RCE'}_${periodo}.${ext}`;
  }

  // ──────────────── VENTAS (RVIE) ────────────────

  private async fetchVentas(
    empresaId: number,
    mes: number,
    anio: number,
    empresarial: boolean,
    sedeId?: number,
  ) {
    const fechaEmision = this.getDateRange(mes, anio);
    return this.prisma.comprobante.findMany({
      where: {
        empresaId,
        ...(empresarial || !sedeId ? {} : { sedeId }),
        tipoDoc: { in: ['01', '03', '07', '08'] },
        fechaEmision,
        estadoEnvioSunat: { not: 'PENDIENTE' as any },
      },
      orderBy: { fechaEmision: 'asc' },
      select: {
        id: true,
        tipoDoc: true,
        serie: true,
        correlativo: true,
        fechaEmision: true,
        tipoMoneda: true,
        mtoOperGravadas: true,
        mtoIGV: true,
        mtoOperInafectas: true,
        mtoOperExoneradas: true,
        mtoOperExportacion: true,
        mtoDescuentoGlobal: true,
        mtoImpVenta: true,
        tipDocAfectado: true,
        numDocAfectado: true,
        estadoEnvioSunat: true,
        cliente: {
          select: {
            nombre: true,
            nroDoc: true,
            tipoDocumento: { select: { codigo: true } },
          },
        },
      },
    });
  }

  async generarTxtVentas(
    empresaId: number,
    mes: number,
    anio: number,
    simple: boolean,
    empresarial: boolean,
    sedeId?: number,
  ): Promise<Buffer> {
    const comprobantes = await this.fetchVentas(
      empresaId,
      mes,
      anio,
      empresarial,
      sedeId,
    );
    const periodo = this.getPeriodo(mes, anio);
    const lines: string[] = [];

    for (const c of comprobantes) {
      const cuo = String(c.id).padStart(10, '0');
      const fecEmision = this.formatFecha(c.fechaEmision);
      const tipoDocCliente = this.inferTipoDocIdentidad(
        c.cliente?.nroDoc ?? '',
        c.cliente?.tipoDocumento?.codigo,
      );
      const nroDocCliente = c.cliente?.nroDoc ?? '';
      const razonSocial = (c.cliente?.nombre ?? '').replace(/\|/g, ' ');
      const baseGravadas = this.fmt(c.mtoOperGravadas);
      const igv = this.fmt(c.mtoIGV);
      const inafectas = this.fmt(c.mtoOperInafectas);
      const exoneradas = this.fmt(c.mtoOperExoneradas);
      const exportacion = this.fmt(c.mtoOperExportacion);
      // mtoOperGravadas ya viene NETO del descuento global (el descuento se
      // pliega en el precio unitario al emitir); este campo es solo
      // informativo para SUNAT, no se resta de nuevo.
      const dctoBaseImp = this.fmt(c.mtoDescuentoGlobal);
      const total = this.fmt(c.mtoImpVenta);
      const tipoCambio = c.tipoMoneda === 'USD' ? '' : '1.000';
      const tipRef = c.tipDocAfectado ?? '';
      const nroRef = c.numDocAfectado ?? '';
      const estado = (c.estadoEnvioSunat as any) === 'ANULADO' ? '6' : '1';

      if (simple) {
        lines.push(
          [
            periodo,
            cuo,
            '',
            fecEmision,
            '',
            c.tipoDoc,
            c.serie,
            String(c.correlativo),
            tipoDocCliente,
            nroDocCliente,
            razonSocial,
            exportacion,
            baseGravadas,
            dctoBaseImp,
            igv,
            '0.00',
            exoneradas,
            inafectas,
            total,
            estado,
          ].join('|'),
        );
      } else {
        // Formato RVIE 14.1 — 33 campos
        lines.push(
          [
            periodo, // 1  Período
            cuo, // 2  CUO
            '', // 3  Correlativo asiento
            fecEmision, // 4  Fecha emisión
            '', // 5  Fecha vencimiento
            c.tipoDoc, // 6  Tipo CDP
            c.serie, // 7  Serie
            String(c.correlativo), // 8  Número
            tipoDocCliente, // 9  Tipo doc identidad cliente
            nroDocCliente, // 10 Nro doc cliente
            razonSocial, // 11 Razón social
            exportacion, // 12 Exportación
            baseGravadas, // 13 Base imp. gravadas
            dctoBaseImp, // 14 Dcto. base imp.
            igv, // 15 IGV / IPM
            '0.00', // 16 Dcto. IGV
            exoneradas, // 17 Exoneradas
            inafectas, // 18 Inafectas
            '0.00', // 19 ISC
            '0.00', // 20 Base IVAP
            '0.00', // 21 IVAP
            '0.00', // 22 ICBPER
            '0.00', // 23 Otros tributos
            total, // 24 Importe total
            tipoCambio, // 25 Tipo de cambio
            '', // 26 Fecha CDP referencia
            tipRef, // 27 Tipo CDP referencia
            nroRef, // 28 Nro CDP referencia
            '', // 29 ID contrato
            '0', // 30 Indicador pago beneficio
            estado, // 31 Estado
            '', // 32 Código error
            '1', // 33 Indicador medio pago
          ].join('|'),
        );
      }
    }

    // SUNAT exige el TXT en ANSI (Windows-1252/ISO-8859-1), no UTF-8: con
    // UTF-8, cualquier nombre con tilde o Ñ sale corrupto o es rechazado por
    // el validador. 'latin1' cubre correctamente los caracteres del español.
    return Buffer.from(lines.join('\r\n'), 'latin1');
  }

  async generarExcelVentas(
    empresaId: number,
    mes: number,
    anio: number,
    simple: boolean,
    empresarial: boolean,
    sedeId?: number,
  ): Promise<Buffer> {
    const comprobantes = await this.fetchVentas(
      empresaId,
      mes,
      anio,
      empresarial,
      sedeId,
    );
    const periodo = this.getPeriodo(mes, anio);

    const rows = comprobantes.map((c) => {
      const tipoDocCliente = this.inferTipoDocIdentidad(
        c.cliente?.nroDoc ?? '',
        c.cliente?.tipoDocumento?.codigo,
      );
      const estado = (c.estadoEnvioSunat as any) === 'ANULADO' ? '6' : '1';

      if (simple) {
        return {
          PERIODO: periodo,
          CUO: String(c.id).padStart(10, '0'),
          'FECHA EMISIÓN': this.formatFecha(c.fechaEmision),
          'TIPO CDP': c.tipoDoc,
          SERIE: c.serie,
          NÚMERO: c.correlativo,
          'TIPO DOC CLIENTE': tipoDocCliente,
          'NRO DOC CLIENTE': c.cliente?.nroDoc ?? '',
          'RAZÓN SOCIAL': c.cliente?.nombre ?? '',
          'BASE GRAVADA': +(c.mtoOperGravadas ?? 0).toFixed(2),
          IGV: +(c.mtoIGV ?? 0).toFixed(2),
          INAFECTAS: +(c.mtoOperInafectas ?? 0).toFixed(2),
          'IMPORTE TOTAL': +(c.mtoImpVenta ?? 0).toFixed(2),
          ESTADO: estado,
        };
      }

      return {
        PERÍODO: periodo,
        CUO: String(c.id).padStart(10, '0'),
        'CORR. ASIENTO': '',
        'FECHA EMISIÓN': this.formatFecha(c.fechaEmision),
        'FECHA VENCIM.': '',
        'TIPO CDP': c.tipoDoc,
        SERIE: c.serie,
        NÚMERO: c.correlativo,
        'TIPO DOC CLIENTE': tipoDocCliente,
        'NRO DOC CLIENTE': c.cliente?.nroDoc ?? '',
        'RAZÓN SOCIAL': c.cliente?.nombre ?? '',
        EXPORTACIÓN: +(c.mtoOperExportacion ?? 0).toFixed(2),
        'BASE GRAVADA': +(c.mtoOperGravadas ?? 0).toFixed(2),
        'DCTO. BASE IMP.': +(c.mtoDescuentoGlobal ?? 0).toFixed(2),
        IGV: +(c.mtoIGV ?? 0).toFixed(2),
        'DCTO. IGV': 0,
        EXONERADAS: +(c.mtoOperExoneradas ?? 0).toFixed(2),
        INAFECTAS: +(c.mtoOperInafectas ?? 0).toFixed(2),
        ISC: 0,
        'BASE IVAP': 0,
        IVAP: 0,
        ICBPER: 0,
        'OTROS TRIBUTOS': 0,
        'IMPORTE TOTAL': +(c.mtoImpVenta ?? 0).toFixed(2),
        'TIPO CAMBIO': c.tipoMoneda === 'USD' ? '' : 1,
        'FECHA CDP REF.': '',
        'TIPO CDP REF.': c.tipDocAfectado ?? '',
        'NRO CDP REF.': c.numDocAfectado ?? '',
        ESTADO: estado,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] ?? {}).map((k) => ({
      wch: Math.max(k.length, 12),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Libro Ventas');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  }

  // ──────────────── COMPRAS (RCE) ────────────────

  private async fetchCompras(
    empresaId: number,
    mes: number,
    anio: number,
    sedeId?: number,
  ) {
    const fechaEmision = this.getDateRange(mes, anio);
    return this.prisma.compra.findMany({
      where: {
        empresaId,
        ...(sedeId ? { sedeId } : {}),
        fechaEmision,
        // Solo compras vigentes: las anuladas, rechazadas o pendientes de
        // aprobación nunca aplicaron efectos (ni stock ni crédito fiscal).
        estado: 'REGISTRADO' as any,
      },
      orderBy: { fechaEmision: 'asc' },
      include: {
        proveedor: { include: { tipoDocumento: true } },
        // Para separar la base gravada de las adquisiciones no gravadas:
        // líneas de productos exonerados/inafectos van sin IGV.
        detalles: { select: { subtotal: true, igv: true } },
      },
    });
  }

  private r2(n: number): number {
    return Number((n || 0).toFixed(2));
  }

  /**
   * Base gravada vs. no gravada de una compra según sus líneas: las que
   * llevan IGV suman a la base imponible; las de productos exonerados/inafectos
   * (IGV 0) van como adquisiciones no gravadas. Sin detalle (compras antiguas)
   * todo se toma como gravado.
   */
  private desgloseBaseCompra(c: {
    subtotal: any;
    igv: any;
    detalles?: Array<{ subtotal: any; igv: any }>;
  }) {
    const dets = c.detalles ?? [];
    if (!dets.length) {
      return { gravada: Number(c.subtotal ?? 0), noGravada: 0 };
    }
    let gravada = 0;
    let noGravada = 0;
    for (const d of dets) {
      if (Number(d.igv ?? 0) > 0) gravada += Number(d.subtotal ?? 0);
      else noGravada += Number(d.subtotal ?? 0);
    }
    if (noGravada === 0) return { gravada: Number(c.subtotal ?? 0), noGravada: 0 };
    if (gravada === 0) return { gravada: 0, noGravada: Number(c.subtotal ?? 0) };
    return { gravada: this.r2(gravada), noGravada: this.r2(noGravada) };
  }

  async generarTxtCompras(
    empresaId: number,
    mes: number,
    anio: number,
    simple: boolean,
    sedeId?: number,
  ): Promise<Buffer> {
    const compras = await this.fetchCompras(empresaId, mes, anio, sedeId);
    const periodo = this.getPeriodo(mes, anio);
    const lines: string[] = [];

    for (const c of compras) {
      const cuo = String(c.id).padStart(10, '0');
      const fecEmision = this.formatFecha(c.fechaEmision);
      const fecVcto = this.formatFecha(c.fechaVencimiento ?? null);
      const tipoDocSunat = TIPO_DOC_COMPRA_MAP[c.tipoDoc] ?? '01';
      const tipoDocProveedor = this.inferTipoDocIdentidad(
        c.proveedor?.nroDoc ?? '',
        c.proveedor?.tipoDocumento?.codigo,
      );
      const nroDocProveedor = c.proveedor?.nroDoc ?? '';
      const razonSocial = (c.proveedor?.nombre ?? '').replace(/\|/g, ' ');
      // Importes en soles (factura en US$ × TC de la compra); las notas de
      // crédito de compra restan crédito fiscal (negativo). Los exonerados/
      // inafectos van como adquisiciones no gravadas (campo 19).
      const signo = tipoDocSunat === '07' ? -1 : 1;
      const factor = factorCompraASoles(c) * signo;
      const base = this.desgloseBaseCompra(c);
      const igvN = Number(c.igv ?? 0) * factor;
      const totalN = Number(c.total ?? 0) * factor;
      const baseGravada = this.fmt(base.gravada * factor);
      const noGravadas = this.fmt(base.noGravada * factor);
      const igvStr = this.fmt(igvN);
      const totalStr = this.fmt(totalN);
      const tipoCambio =
        (c.moneda ?? 'PEN') === 'USD'
          ? Number(c.tipoCambio ?? 1).toFixed(3)
          : '1.000';

      if (simple) {
        lines.push(
          [
            periodo,
            cuo,
            '',
            fecEmision,
            fecVcto,
            tipoDocSunat,
            c.serie,
            '',
            c.numero,
            tipoDocProveedor,
            nroDocProveedor,
            razonSocial,
            baseGravada,
            igvStr,
            '0.00',
            '0.00',
            '0.00',
            '0.00',
            noGravadas,
            '0.00',
            '0.00',
            '0.00',
            totalStr,
            '1',
          ].join('|'),
        );
      } else {
        // Formato RCE 8.1 — 33 campos
        lines.push(
          [
            periodo, // 1  Período
            cuo, // 2  CUO
            '', // 3  Correlativo asiento
            fecEmision, // 4  Fecha emisión
            fecVcto, // 5  Fecha vencimiento
            tipoDocSunat, // 6  Tipo CDP
            c.serie, // 7  Serie
            '', // 8  Año DUA/DSI
            c.numero, // 9  Número
            tipoDocProveedor, // 10 Tipo doc proveedor
            nroDocProveedor, // 11 Nro doc proveedor
            razonSocial, // 12 Razón social
            baseGravada, // 13 Base adq. gravadas (op. gravadas)
            igvStr, // 14 IGV adq. gravadas (op. gravadas)
            '0.00', // 15 Base adq. gravadas (op. gravadas y no gravadas)
            '0.00', // 16 IGV adq. gravadas (op. gravadas y no gravadas)
            '0.00', // 17 Base adq. gravadas (op. no gravadas)
            '0.00', // 18 IGV adq. gravadas (op. no gravadas)
            noGravadas, // 19 Valor adq. no gravadas (exonerados/inafectos)
            '0.00', // 20 ISC
            '0.00', // 21 ICBPER
            '0.00', // 22 Otros tributos
            totalStr, // 23 Total
            tipoCambio, // 24 Tipo de cambio
            '', // 25 Fecha CDP referencia
            '', // 26 Tipo CDP referencia
            '', // 27 Nro CDP referencia
            '', // 28 Nro constancia detracción
            '', // 29 Fecha constancia detracción
            '', // 30 Indicador anticipo
            '', // 31 Período crédito fiscal
            '1', // 32 Estado
            '', // 33 Código error
          ].join('|'),
        );
      }
    }

    // SUNAT exige el TXT en ANSI (Windows-1252/ISO-8859-1), no UTF-8: con
    // UTF-8, cualquier nombre con tilde o Ñ sale corrupto o es rechazado por
    // el validador. 'latin1' cubre correctamente los caracteres del español.
    return Buffer.from(lines.join('\r\n'), 'latin1');
  }

  async generarExcelCompras(
    empresaId: number,
    mes: number,
    anio: number,
    simple: boolean,
    sedeId?: number,
  ): Promise<Buffer> {
    const compras = await this.fetchCompras(empresaId, mes, anio, sedeId);
    const periodo = this.getPeriodo(mes, anio);

    const rows = compras.map((c) => {
      const tipoDocSunat = TIPO_DOC_COMPRA_MAP[c.tipoDoc] ?? '01';
      const tipoDocProveedor = this.inferTipoDocIdentidad(
        c.proveedor?.nroDoc ?? '',
        c.proveedor?.tipoDocumento?.codigo,
      );
      // Mismo criterio que el TXT: soles, NC en negativo, no gravadas aparte.
      const signo = tipoDocSunat === '07' ? -1 : 1;
      const factor = factorCompraASoles(c) * signo;
      const base = this.desgloseBaseCompra(c);
      const subtotalN = base.gravada * factor;
      const noGravadasN = base.noGravada * factor;
      const igvN = Number(c.igv ?? 0) * factor;
      const totalN = Number(c.total ?? 0) * factor;

      if (simple) {
        return {
          PERIODO: periodo,
          CUO: String(c.id).padStart(10, '0'),
          'FECHA EMISIÓN': this.formatFecha(c.fechaEmision),
          'FECHA VENCIM.': this.formatFecha(c.fechaVencimiento ?? null),
          'TIPO CDP': tipoDocSunat,
          SERIE: c.serie,
          NÚMERO: c.numero,
          'TIPO DOC PROVEEDOR': tipoDocProveedor,
          'NRO DOC PROVEEDOR': c.proveedor?.nroDoc ?? '',
          'RAZÓN SOCIAL PROVEEDOR': c.proveedor?.nombre ?? '',
          'BASE GRAVADA': +subtotalN.toFixed(2),
          IGV: +igvN.toFixed(2),
          'IMPORTE TOTAL': +totalN.toFixed(2),
          ESTADO: '1',
        };
      }

      return {
        PERÍODO: periodo,
        CUO: String(c.id).padStart(10, '0'),
        'CORR. ASIENTO': '',
        'FECHA EMISIÓN': this.formatFecha(c.fechaEmision),
        'FECHA VENCIM.': this.formatFecha(c.fechaVencimiento ?? null),
        'TIPO CDP': tipoDocSunat,
        SERIE: c.serie,
        'AÑO DUA/DSI': '',
        NÚMERO: c.numero,
        'TIPO DOC PROVEEDOR': tipoDocProveedor,
        'NRO DOC PROVEEDOR': c.proveedor?.nroDoc ?? '',
        'RAZÓN SOCIAL': c.proveedor?.nombre ?? '',
        'BASE ADQ. GRAVADAS': +subtotalN.toFixed(2),
        'IGV ADQ. GRAVADAS': +igvN.toFixed(2),
        'BASE ADQ. GRAV. (MX)': 0,
        'IGV ADQ. GRAV. (MX)': 0,
        'BASE ADQ. GRAV. (NG)': 0,
        'IGV ADQ. GRAV. (NG)': 0,
        'ADQ. NO GRAVADAS': +noGravadasN.toFixed(2),
        ISC: 0,
        ICBPER: 0,
        'OTROS TRIBUTOS': 0,
        'IMPORTE TOTAL': +totalN.toFixed(2),
        'TIPO CAMBIO': (c.moneda ?? 'PEN') === 'USD' ? +(c.tipoCambio ?? 1) : 1,
        'FECHA CDP REF.': '',
        'TIPO CDP REF.': '',
        'NRO CDP REF.': '',
        'NRO CONSTANCIA DET.': '',
        'FECHA CONSTANCIA DET.': '',
        'PERÍODO CRÉDITO': '',
        ESTADO: '1',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] ?? {}).map((k) => ({
      wch: Math.max(k.length, 12),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registro Compras');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  }

  // ──────────────── EMAIL ────────────────

  async enviarPorCorreo(params: {
    tipo: 'ventas' | 'compras';
    mes: number;
    anio: number;
    simple: boolean;
    empresarial?: boolean;
    empresaId: number;
    destinatario: string;
    sedeId?: number;
  }): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT ?? '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
      throw new BadRequestException(
        'El servidor de correo no está configurado. Agrega SMTP_HOST, SMTP_USER y SMTP_PASS en el archivo .env',
      );
    }

    const {
      tipo,
      mes,
      anio,
      simple,
      empresarial,
      empresaId,
      destinatario,
      sedeId,
    } = params;

    let txtBuffer: Buffer;
    let xlsxBuffer: Buffer;

    if (tipo === 'ventas') {
      txtBuffer = await this.generarTxtVentas(
        empresaId,
        mes,
        anio,
        simple,
        empresarial ?? false,
        sedeId,
      );
      xlsxBuffer = await this.generarExcelVentas(
        empresaId,
        mes,
        anio,
        simple,
        empresarial ?? false,
        sedeId,
      );
    } else {
      txtBuffer = await this.generarTxtCompras(
        empresaId,
        mes,
        anio,
        simple,
        sedeId,
      );
      xlsxBuffer = await this.generarExcelCompras(
        empresaId,
        mes,
        anio,
        simple,
        sedeId,
      );
    }

    const nombreTxt = this.getNombreArchivo(tipo, mes, anio, 'txt');
    const nombreXlsx = this.getNombreArchivo(tipo, mes, anio, 'xlsx');
    const label =
      tipo === 'ventas'
        ? 'Libro Electrónico de Ventas (RVIE)'
        : 'Registro de Compras (RCE)';
    const periodo = `${String(mes).padStart(2, '0')}/${anio}`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"Vendify SIRE" <${smtpFrom}>`,
      to: destinatario,
      subject: `SIRE - ${label} | Período ${periodo}`,
      html: `
        <p>Estimado(a),</p>
        <p>Adjunto encontrará el <strong>${label}</strong> correspondiente al período <strong>${periodo}</strong>.</p>
        <p>Se adjuntan dos archivos:</p>
        <ul>
          <li><strong>${nombreTxt}</strong> — Formato TXT para importar en el sistema SIRE de SUNAT.</li>
          <li><strong>${nombreXlsx}</strong> — Versión Excel para revisión.</li>
        </ul>
        <p>Generado por <strong>Vendify</strong>.</p>
      `,
      attachments: [
        { filename: nombreTxt, content: txtBuffer, contentType: 'text/plain' },
        {
          filename: nombreXlsx,
          content: xlsxBuffer,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });
  }

  private periodoSire(mes: number, anio: number): string {
    return `${anio}${String(mes).padStart(2, '0')}`;
  }

  /** Fecha en formato AAAA-MM-DD (RVIE campo 29: doc. modificado). */
  private formatFechaIso(date: Date | null | undefined): string {
    if (!date) return '';
    const d = new Date(date.getTime() - 5 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Texto libre entre palotes. La norma prohíbe los caracteres | / \ dentro
   * de los campos de texto (RS 112-2021, reglas generales del archivo).
   */
  private texto(val: string | null | undefined): string {
    return (val ?? '').replace(/[|/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Los comprobantes guardan el documento afectado como "SERIE-NUMERO"
   * (p. ej. "F0A1-316"), pero el SIRE exige serie y número en campos
   * separados. Se parte por el último guion para no romper series que lo
   * contengan.
   */
  private splitSerieNumero(ref: string | null | undefined): [string, string] {
    const val = (ref ?? '').trim();
    if (!val) return ['', ''];
    const i = val.lastIndexOf('-');
    if (i <= 0) return [val, ''];
    return [val.slice(0, i), val.slice(i + 1)];
  }

  async nombreArchivoTxtSire(
    empresaId: number,
    tipo: 'ventas' | 'compras',
    mes: number,
    anio: number,
    conInformacion: boolean,
  ): Promise<string> {
    const { ruc } = await this.fetchGenerador(empresaId);
    const periodo = this.periodoSire(mes, anio);
    const libro = tipo === 'ventas' ? '140400' : '080400';
    const oportunidad = '02'; // reemplaza la propuesta
    const indOperaciones = '1';
    const indContenido = conInformacion ? '1' : '0';
    const indMoneda = '1'; // contabilidad en soles
    return `LE${ruc}${periodo}00${libro}${oportunidad}${indOperaciones}${indContenido}${indMoneda}2.TXT`;
  }

  /**
   * RUC y razón social del generador: campos 1 y 2 de ambos registros.
   * Son obligatorios en el SIRE y no existían en el formato PLE anterior.
   */
  private async fetchGenerador(empresaId: number) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { ruc: true, razonSocial: true },
    });
    if (!empresa?.ruc) {
      throw new BadRequestException(
        'La empresa no tiene RUC configurado: el SIRE lo exige en el campo 1 del archivo.',
      );
    }
    return {
      ruc: empresa.ruc,
      razonSocial: this.texto(empresa.razonSocial),
    };
  }

  // ──────────────── VENTAS (RVIE) ────────────────

  private async fetchFechasDocModificado(
    empresaId: number,
    comprobantes: Array<{
      id: number;
      tipoDoc: string;
      tipDocAfectado?: string | null;
      numDocAfectado?: string | null;
    }>,
    formato: 'iso' | 'ddmmyyyy' = 'iso',
  ): Promise<Map<number, string>> {
    const notas = comprobantes.filter(
      (c) =>
        (c.tipoDoc === '07' || c.tipoDoc === '08') &&
        c.tipDocAfectado &&
        c.numDocAfectado,
    );
    const salida = new Map<number, string>();
    if (!notas.length) return salida;

    const refs = notas.map((n) => {
      const [serie, numero] = this.splitSerieNumero(n.numDocAfectado);
      return { id: n.id, tipoDoc: n.tipDocAfectado as string, serie, numero };
    });

    const originales = await this.prisma.comprobante.findMany({
      where: {
        empresaId,
        OR: refs
          .filter((r) => r.serie && /^\d+$/.test(r.numero))
          .map((r) => ({
            tipoDoc: r.tipoDoc,
            serie: r.serie,
            correlativo: Number(r.numero),
          })),
      },
      select: { tipoDoc: true, serie: true, correlativo: true, fechaEmision: true },
    });

    const porClave = new Map(
      originales.map((o) => [
        `${o.tipoDoc}|${o.serie}|${o.correlativo}`,
        o.fechaEmision,
      ]),
    );
    for (const r of refs) {
      const fecha = porClave.get(`${r.tipoDoc}|${r.serie}|${Number(r.numero)}`);
      if (fecha) {
        salida.set(
          r.id,
          formato === 'iso'
            ? this.formatFechaIso(fecha)
            : this.formatFecha(fecha),
        );
      }
    }
    return salida;
  }

  async obtenerRevisionVentas(
    empresaId: number,
    mes: number,
    anio: number,
    empresarial: boolean,
    sedeId?: number,
  ) {
    const rango = this.getDateRange(mes, anio);
    const [incluidos, excluidos] = await Promise.all([
      this.fetchVentas(empresaId, mes, anio, empresarial, sedeId),
      // Comprobantes del período que NO entran al libro por su estado: son
      // ventas emitidas que quedarían sin declarar.
      this.prisma.comprobante.findMany({
        where: {
          empresaId,
          ...(empresarial || !sedeId ? {} : { sedeId }),
          tipoDoc: { in: ['01', '03', '07', '08'] },
          fechaEmision: rango,
          estadoEnvioSunat: {
            in: ['PENDIENTE', 'RECHAZADO', 'FALLIDO_ENVIO'] as any,
          },
        },
        orderBy: { fechaEmision: 'asc' },
        select: {
          tipoDoc: true,
          serie: true,
          correlativo: true,
          estadoEnvioSunat: true,
          mtoImpVenta: true,
        },
      }),
    ]);

    // ── Huecos de numeración ────────────────────────────────────────────
    // Por cada serie del período se revisa el rango [min, max] y se marcan
    // los correlativos que no existen en la empresa. Un correlativo emitido
    // en otro mes no es hueco, por eso se busca en toda la empresa.
    const porSerie = new Map<string, number[]>();
    for (const c of incluidos) {
      if (!porSerie.has(c.serie)) porSerie.set(c.serie, []);
      porSerie.get(c.serie)!.push(c.correlativo);
    }
    const huecos: Array<{ serie: string; faltantes: number[] }> = [];
    for (const [serie, nums] of porSerie) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      if (max - min > 5000) continue; // rango absurdo: no vale la pena revisar
      const existentes = new Set(
        (
          await this.prisma.comprobante.findMany({
            where: {
              empresaId,
              serie,
              correlativo: { gte: min, lte: max },
            },
            select: { correlativo: true },
          })
        ).map((x) => x.correlativo),
      );
      const faltantes: number[] = [];
      for (let n = min; n <= max; n++) if (!existentes.has(n)) faltantes.push(n);
      if (faltantes.length) huecos.push({ serie, faltantes: faltantes.slice(0, 25) });
    }

    // ── Documentos de identidad inválidos ───────────────────────────────
    const docsInvalidos: Array<{
      comprobante: string;
      cliente: string;
      motivo: string;
    }> = [];
    for (const c of incluidos) {
      const nro = (c.cliente?.nroDoc ?? '').trim();
      const tipo = this.inferTipoDocIdentidad(
        nro,
        c.cliente?.tipoDocumento?.codigo,
      );
      const etiqueta = `${c.serie}-${c.correlativo}`;
      const nombre = c.cliente?.nombre ?? '(sin cliente)';
      // La factura (01) siempre exige RUC del adquirente.
      if (c.tipoDoc === '01' && !/^\d{11}$/.test(nro)) {
        docsInvalidos.push({
          comprobante: etiqueta,
          cliente: nombre,
          motivo: nro
            ? `Factura con RUC inválido: "${nro}"`
            : 'Factura sin RUC del cliente',
        });
      } else if (tipo === '6' && nro && !/^\d{11}$/.test(nro)) {
        docsInvalidos.push({
          comprobante: etiqueta,
          cliente: nombre,
          motivo: `RUC con ${nro.length} dígitos (debe tener 11)`,
        });
      } else if (tipo === '1' && nro && !/^\d{8}$/.test(nro)) {
        docsInvalidos.push({
          comprobante: etiqueta,
          cliente: nombre,
          motivo: `DNI con ${nro.length} dígitos (debe tener 8)`,
        });
      }
    }

    // ── Notas de crédito sin documento afectado localizable ─────────────
    const fechas = await this.fetchFechasDocModificado(
      empresaId,
      incluidos,
      'ddmmyyyy',
    );
    const notasHuerfanas = incluidos
      .filter(
        (c) =>
          (c.tipoDoc === '07' || c.tipoDoc === '08') && !fechas.get(c.id),
      )
      .map((c) => ({
        comprobante: `${c.serie}-${c.correlativo}`,
        referencia: c.numDocAfectado ?? '(vacío)',
      }));

    return {
      excluidos: excluidos.map((c) => ({
        comprobante: `${c.serie}-${c.correlativo}`,
        tipoDoc: c.tipoDoc,
        estado: c.estadoEnvioSunat,
        total: this.r2(Number(c.mtoImpVenta ?? 0)),
      })),
      huecos,
      docsInvalidos: docsInvalidos.slice(0, 25),
      notasHuerfanas,
      detalle: incluidos.map((c) => {
        const signo = c.tipoDoc === '07' ? -1 : 1;
        return {
          tipoDoc: c.tipoDoc,
          comprobante: `${c.serie}-${c.correlativo}`,
          fecha: this.formatFecha(c.fechaEmision),
          docCliente: c.cliente?.nroDoc ?? '',
          cliente: c.cliente?.nombre ?? '',
          base: this.r2(Number(c.mtoOperGravadas ?? 0) * signo),
          igv: this.r2(Number(c.mtoIGV ?? 0) * signo),
          total: this.r2(Number(c.mtoImpVenta ?? 0) * signo),
          anulado: (c.estadoEnvioSunat as any) === 'ANULADO',
        };
      }),
    };
  }

  /**
   * Totales del Libro de Ventas del período. Se calcula con la MISMA consulta
   * (fetchVentas) y los mismos criterios de signo que el TXT/Excel, para que
   * el usuario pueda cuadrar en pantalla antes de exportar a SUNAT.
   */
  async obtenerResumenVentas(
    empresaId: number,
    mes: number,
    anio: number,
    empresarial: boolean,
    sedeId?: number,
  ) {
    const comprobantes = await this.fetchVentas(
      empresaId,
      mes,
      anio,
      empresarial,
      sedeId,
    );

    let gravadas = 0;
    let igv = 0;
    let exoneradas = 0;
    let inafectas = 0;
    let exportacion = 0;
    let total = 0;
    let anulados = 0;
    let notasCredito = 0;
    const porTipoDoc: Record<string, { cantidad: number; total: number }> = {};

    for (const c of comprobantes) {
      // Mismo criterio que el TXT: las notas de crédito (07) restan.
      const signo = c.tipoDoc === '07' ? -1 : 1;
      if (signo === -1) notasCredito++;
      if ((c.estadoEnvioSunat as any) === 'ANULADO') anulados++;

      gravadas += Number(c.mtoOperGravadas ?? 0) * signo;
      igv += Number(c.mtoIGV ?? 0) * signo;
      exoneradas += Number(c.mtoOperExoneradas ?? 0) * signo;
      inafectas += Number(c.mtoOperInafectas ?? 0) * signo;
      exportacion += Number(c.mtoOperExportacion ?? 0) * signo;
      const importe = Number(c.mtoImpVenta ?? 0) * signo;
      total += importe;

      const tipo = c.tipoDoc ?? '';
      if (!porTipoDoc[tipo]) porTipoDoc[tipo] = { cantidad: 0, total: 0 };
      porTipoDoc[tipo].cantidad++;
      porTipoDoc[tipo].total = this.r2(porTipoDoc[tipo].total + importe);
    }

    return {
      periodo: `${anio}${String(mes).padStart(2, '0')}`,
      cantidad: comprobantes.length,
      gravadas: this.r2(gravadas),
      igv: this.r2(igv),
      exoneradas: this.r2(exoneradas),
      inafectas: this.r2(inafectas),
      exportacion: this.r2(exportacion),
      total: this.r2(total),
      anulados,
      notasCredito,
      porTipoDoc,
    };
  }

  /**
   * Totales del Registro de Compras del período, con la misma consulta
   * (fetchCompras) que alimenta el TXT/Excel — solo compras REGISTRADO.
   */
  async obtenerResumenCompras(
    empresaId: number,
    mes: number,
    anio: number,
    sedeId?: number,
  ) {
    const compras = await this.fetchCompras(empresaId, mes, anio, sedeId);

    let base = 0;
    let noGravadas = 0;
    let igv = 0;
    let total = 0;
    const porTipoDoc: Record<string, { cantidad: number; total: number }> = {};

    for (const c of compras) {
      // Mismo criterio que el TXT: soles (US$ × TC de la compra), las notas
      // de crédito (07) restan y los exonerados/inafectos no son base gravada.
      const tipoDocSunat = TIPO_DOC_COMPRA_MAP[c.tipoDoc] ?? '01';
      const signo = tipoDocSunat === '07' ? -1 : 1;
      const factor = factorCompraASoles(c) * signo;
      const desglose = this.desgloseBaseCompra(c);
      base += desglose.gravada * factor;
      noGravadas += desglose.noGravada * factor;
      igv += Number(c.igv ?? 0) * factor;
      const importe = Number(c.total ?? 0) * factor;
      total += importe;

      const tipo = TIPO_DOC_COMPRA_MAP[c.tipoDoc] ?? '01';
      if (!porTipoDoc[tipo]) porTipoDoc[tipo] = { cantidad: 0, total: 0 };
      porTipoDoc[tipo].cantidad++;
      porTipoDoc[tipo].total = this.r2(porTipoDoc[tipo].total + importe);
    }

    return {
      periodo: `${anio}${String(mes).padStart(2, '0')}`,
      cantidad: compras.length,
      base: this.r2(base),
      noGravadas: this.r2(noGravadas),
      igv: this.r2(igv),
      total: this.r2(total),
      porTipoDoc,
    };
  }

  /**
   * IGV resultante del período: débito fiscal (ventas) menos crédito fiscal
   * (compras). Es el número que el empresario realmente quiere ver y que hoy
   * tiene que sacar a mano cruzando los dos libros.
   *
   * Usa los mismos resúmenes que alimentan los archivos, así que lo que se ve
   * acá es exactamente lo que se declararía.
   */
  async obtenerIgvPeriodo(
    empresaId: number,
    mes: number,
    anio: number,
    empresarial: boolean,
    sedeId?: number,
  ) {
    const anterior =
      mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };

    const [ventas, compras, ventasPrev, comprasPrev] = await Promise.all([
      this.obtenerResumenVentas(empresaId, mes, anio, empresarial, sedeId),
      this.obtenerResumenCompras(empresaId, mes, anio, sedeId),
      this.obtenerResumenVentas(
        empresaId,
        anterior.mes,
        anterior.anio,
        empresarial,
        sedeId,
      ),
      this.obtenerResumenCompras(empresaId, anterior.mes, anterior.anio, sedeId),
    ]);

    const resultado = this.r2(ventas.igv - compras.igv);
    const resultadoPrev = this.r2(ventasPrev.igv - comprasPrev.igv);
    // Solo tiene sentido comparar si el mes anterior tuvo movimiento.
    const variacion =
      resultadoPrev !== 0
        ? this.r2(((resultado - resultadoPrev) / Math.abs(resultadoPrev)) * 100)
        : null;

    return {
      periodo: `${anio}${String(mes).padStart(2, '0')}`,
      debito: ventas.igv,
      credito: compras.igv,
      resultado,
      // Negativo = saldo a favor que se arrastra al mes siguiente.
      esSaldoAFavor: resultado < 0,
      comprobantesVentas: ventas.cantidad,
      comprobantesCompras: compras.cantidad,
      periodoAnterior: {
        periodo: `${anterior.anio}${String(anterior.mes).padStart(2, '0')}`,
        resultado: resultadoPrev,
      },
      variacion,
    };
  }

  /**
   * Compara la propuesta que publica SUNAT contra lo que tiene el sistema.
   *
   * La propuesta (anexo 2) trae los mismos campos que el archivo de reemplazo
   * en las primeras 33 posiciones y agrega columnas referenciales despues, asi
   * que se lee por POSICION y se tolera cualquier cantidad de campos >= 26.
   * Tambien se tolera una fila de cabecera y el separador ; por si el archivo
   * viene exportado desde Excel.
   */
  async compararConPropuesta(params: {
    empresaId: number;
    mes: number;
    anio: number;
    contenido: string;
    empresarial: boolean;
    sedeId?: number;
  }) {
    const { empresaId, mes, anio, contenido, empresarial, sedeId } = params;

    const lineas = contenido
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lineas.length) {
      throw new BadRequestException('El archivo está vacío.');
    }

    const sep = lineas[0].includes('|') ? '|' : ';';
    const filas = lineas
      .map((l) => l.split(sep))
      .filter((f) => f.length >= 26)
      // Descarta una posible fila de cabecera: la posición 7 (tipo CP) debe
      // ser numérica en las filas de datos.
      .filter((f) => /^\d{1,2}$/.test((f[6] ?? '').trim()));

    if (!filas.length) {
      throw new BadRequestException(
        'No se reconocieron filas válidas. Se esperaba el archivo de la propuesta de SUNAT ' +
          '(campos separados por "|", con el tipo de comprobante en la posición 7).',
      );
    }

    const num = (v: string | undefined) => {
      const n = Number(String(v ?? '').replace(/,/g, '').trim());
      return Number.isFinite(n) ? this.r2(n) : 0;
    };
    // Serie y numero se normalizan (sin ceros a la izquierda) para que
    // "F0A1"/"0310" y "F0A1"/"310" se reconozcan como el mismo comprobante.
    const clave = (tipo: string, serie: string, numero: string) =>
      `${tipo.trim().padStart(2, '0')}|${serie.trim().toUpperCase()}|${String(
        numero,
      )
        .trim()
        .replace(/^0+/, '')}`;

    const sunat = new Map<
      string,
      { comprobante: string; base: number; igv: number; total: number }
    >();
    for (const f of filas) {
      const tipo = (f[6] ?? '').trim().padStart(2, '0');
      const serie = (f[7] ?? '').trim();
      // La 8 es el año de la DUA y viene vacía en las facturas normales: el
      // número del CP está en la 9. Misma regla por fila que en la sincronización.
      const numero = ((f[9] ?? '').trim() || (f[8] ?? '').trim());
      sunat.set(clave(tipo, serie, numero), {
        comprobante: `${serie}-${numero.replace(/^0+/, '')}`,
        // Mismos índices que la sincronización; ver la nota de allá.
        base: num(f[14]) + num(f[16]) + num(f[18]),
        igv: num(f[15]) + num(f[17]) + num(f[19]),
        total: num(f[24]),
      });
    }

    const propios = await this.fetchVentas(
      empresaId,
      mes,
      anio,
      empresarial,
      sedeId,
    );
    const sistema = new Map<
      string,
      { comprobante: string; base: number; igv: number; total: number }
    >();
    for (const c of propios) {
      const signo = c.tipoDoc === '07' ? -1 : 1;
      sistema.set(clave(c.tipoDoc, c.serie, String(c.correlativo)), {
        comprobante: `${c.serie}-${c.correlativo}`,
        base: this.r2(Number(c.mtoOperGravadas ?? 0) * signo),
        igv: this.r2(Number(c.mtoIGV ?? 0) * signo),
        total: this.r2(Number(c.mtoImpVenta ?? 0) * signo),
      });
    }

    const soloEnSunat: any[] = [];
    const soloEnSistema: any[] = [];
    const diferencias: any[] = [];
    const tolerancia = 0.01;

    for (const [k, v] of sunat) {
      const mio = sistema.get(k);
      if (!mio) {
        soloEnSunat.push({ ...v, tipoDoc: k.split('|')[0] });
        continue;
      }
      if (
        Math.abs(mio.base - v.base) > tolerancia ||
        Math.abs(mio.igv - v.igv) > tolerancia ||
        Math.abs(mio.total - v.total) > tolerancia
      ) {
        diferencias.push({
          comprobante: mio.comprobante,
          tipoDoc: k.split('|')[0],
          sunat: v,
          sistema: mio,
        });
      }
    }
    for (const [k, v] of sistema) {
      if (!sunat.has(k)) {
        soloEnSistema.push({ ...v, tipoDoc: k.split('|')[0] });
      }
    }

    const suma = (m: Map<string, { igv: number; total: number }>) => {
      let igv = 0;
      let total = 0;
      for (const v of m.values()) {
        igv += v.igv;
        total += v.total;
      }
      return { igv: this.r2(igv), total: this.r2(total) };
    };

    return {
      periodo: this.periodoSire(mes, anio),
      totales: {
        sunat: { cantidad: sunat.size, ...suma(sunat) },
        sistema: { cantidad: sistema.size, ...suma(sistema) },
      },
      cuadra:
        !soloEnSunat.length && !soloEnSistema.length && !diferencias.length,
      soloEnSunat: soloEnSunat.slice(0, 100),
      soloEnSistema: soloEnSistema.slice(0, 100),
      diferencias: diferencias.slice(0, 100),
      totalSoloEnSunat: soloEnSunat.length,
      totalSoloEnSistema: soloEnSistema.length,
      totalDiferencias: diferencias.length,
    };
  }

  // ──────────────── EMAIL ────────────────

  async obtenerRevisionCompras(
    empresaId: number,
    mes: number,
    anio: number,
    sedeId?: number,
  ) {
    const fechaEmision = this.getDateRange(mes, anio);
    const compras = await this.prisma.compra.findMany({
      where: {
        empresaId,
        ...(sedeId ? { sedeId } : {}),
        fechaEmision,
        estado: 'REGISTRADO' as any,
      },
      orderBy: [{ fechaEmision: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        tipoDoc: true,
        serie: true,
        numero: true,
        fechaEmision: true,
        moneda: true,
        tipoCambio: true,
        subtotal: true,
        igv: true,
        total: true,
        esGasto: true,
        estadoContador: true,
        motivoContador: true,
        revisadoContadorEn: true,
        proveedor: { select: { nombre: true, nroDoc: true } },
      },
    });

    const items = compras.map((c) => {
      const factor = factorCompraASoles(c as any);
      return {
        id: c.id,
        tipoDoc: c.tipoDoc,
        tipoDocSunat: TIPO_DOC_COMPRA_MAP[c.tipoDoc] ?? '01',
        documento: `${c.serie}-${c.numero}`,
        fechaEmision: c.fechaEmision,
        proveedor: c.proveedor?.nombre ?? '',
        proveedorDoc: c.proveedor?.nroDoc ?? '',
        moneda: c.moneda,
        // Importes en soles, igual que el TXT y el resumen.
        base: this.r2(Number(c.subtotal ?? 0) * factor),
        igv: this.r2(Number(c.igv ?? 0) * factor),
        total: this.r2(Number(c.total ?? 0) * factor),
        esGasto: c.esGasto,
        estadoContador: c.estadoContador,
        motivoContador: c.motivoContador,
        revisadoContadorEn: c.revisadoContadorEn,
      };
    });

    const suma = (f: (i: (typeof items)[number]) => number, estado?: string) =>
      this.r2(
        items
          .filter((i) => !estado || i.estadoContador === estado)
          .reduce((a, i) => a + f(i), 0),
      );

    return {
      periodo: `${anio}${String(mes).padStart(2, '0')}`,
      items,
      resumen: {
        total: items.length,
        pendientes: items.filter((i) => i.estadoContador === 'PENDIENTE').length,
        aprobadas: items.filter((i) => i.estadoContador === 'APROBADA').length,
        denegadas: items.filter((i) => i.estadoContador === 'DENEGADA').length,
        // Crédito fiscal en juego: el que se declara y el que se pierde al denegar.
        igvDeclarable: this.r2(suma((i) => i.igv) - suma((i) => i.igv, 'DENEGADA')),
        igvDenegado: suma((i) => i.igv, 'DENEGADA'),
      },
    };
  }

  /**
   * Aprueba o deniega compras (una o varias). Denegar exige motivo: es lo que
   * el negocio va a leer para entender por qué no se declaró esa factura.
   */
  async revisarCompras(
    empresaId: number,
    usuarioId: number | undefined,
    dto: { ids: number[]; estado: 'PENDIENTE' | 'APROBADA' | 'DENEGADA'; motivo?: string },
  ) {
    const ids = Array.from(new Set((dto.ids || []).map(Number).filter(Boolean)));
    if (!ids.length) {
      throw new BadRequestException('Elige al menos una compra para revisar.');
    }
    const motivo = String(dto.motivo ?? '').trim();
    if (dto.estado === 'DENEGADA' && !motivo) {
      throw new BadRequestException(
        'Indica el motivo del rechazo: el negocio necesita saber por qué no se declara esa compra.',
      );
    }
    // Solo compras de la empresa (el id viaja desde el cliente).
    const propias = await this.prisma.compra.findMany({
      where: { id: { in: ids }, empresaId },
      select: { id: true },
    });
    if (!propias.length) {
      throw new BadRequestException('No se encontraron esas compras.');
    }
    const pendiente = dto.estado === 'PENDIENTE';
    await this.prisma.compra.updateMany({
      where: { id: { in: propias.map((c) => c.id) }, empresaId },
      data: {
        estadoContador: dto.estado as any,
        // Volver a "pendiente" limpia la revisión anterior.
        motivoContador: pendiente ? null : motivo || null,
        revisadoContadorEn: pendiente ? null : new Date(),
        revisadoContadorPor: pendiente ? null : (usuarioId ?? null),
      },
    });
    return { actualizadas: propias.length, estado: dto.estado };
  }


  /**
   * Cruza las COMPRAS del período con la propuesta del RCE que SUNAT publica
   * (Menú SOL → SIRE → RCE → Propuesta → Exportar). Es lo que un contador
   * revisa a mano: qué facturas tiene SUNAT que el negocio nunca registró (ahí
   * se pierde crédito fiscal), cuáles registró el negocio y SUNAT no tiene, y
   * cuáles no cuadran en importes.
   *
   * El archivo del RCE es "campo|campo|..." por posición. Ojo: NO es el mismo
   * layout que el de ventas — entre la serie y el número va el "año de emisión
   * de la DUA", así que el número está una posición más a la derecha. Se valida
   * y, si no calza, se cae a la posición anterior para tolerar variantes.
   */
  async compararComprasConPropuesta(params: {
    empresaId: number;
    mes: number;
    anio: number;
    contenido: string;
    sedeId?: number;
  }) {
    const { empresaId, mes, anio, contenido, sedeId } = params;

    const lineas = contenido
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lineas.length) {
      throw new BadRequestException('El archivo está vacío.');
    }

    const sep = lineas[0].includes('|') ? '|' : ';';
    const filas = lineas
      .map((l) => l.split(sep))
      .filter((f) => f.length >= 20)
      // Descarta la cabecera: en las filas de datos el tipo de CP es numérico.
      .filter((f) => /^\d{1,2}$/.test((f[6] ?? '').trim()));

    if (!filas.length) {
      throw new BadRequestException(
        'No se reconocieron filas válidas. Se esperaba el archivo de la propuesta del RCE ' +
          '(SIRE → Compras → Propuesta → Exportar), con los campos separados por "|".',
      );
    }

    const num = (v: string | undefined) => {
      const n = Number(String(v ?? '').replace(/,/g, '').trim());
      return Number.isFinite(n) ? this.r2(n) : 0;
    };
    const clave = (tipo: string, serie: string, numero: string) =>
      `${tipo.trim().padStart(2, '0')}|${serie.trim().toUpperCase()}|${String(numero)
        .trim()
        .replace(/^0+/, '')}`;

    // El número del CP va en la posición 10 del RCE (la 9 es el año de emisión
    // de la DUA, casi siempre vacío). Se resuelve POR FILA: si la 10 trae algo
    // se usa esa; si viene vacía, el archivo no tiene la columna DUA y el
    // número está en la 9. Mirar solo la primera fila fallaba con archivos
    // mixtos (una importación con DUA entre facturas normales).
    const numeroDeFila = (f: string[]) => {
      const conDua = (f[9] ?? '').trim();
      return conDua || (f[8] ?? '').trim();
    };

    const sunat = new Map<
      string,
      {
        comprobante: string;
        proveedor: string;
        proveedorDoc: string;
        fechaEmision: string;
        base: number;
        igv: number;
        total: number;
      }
    >();
    for (const f of filas) {
      const tipo = (f[6] ?? '').trim().padStart(2, '0');
      const serie = (f[7] ?? '').trim();
      const numero = numeroDeFila(f);
      if (!serie && !numero) continue;
      // La base gravada del RCE viene partida en tres pares (gravada, gravada
      // y no gravada, no gravada); para cuadrar con nuestra compra se suman.
      //
      // Los índices son 0-based sobre las columnas del TXT de la propuesta:
      //   14 BI Gravado DG   15 IGV/IPM DG
      //   16 BI Gravado DGNG 17 IGV/IPM DGNG
      //   18 BI Gravado DNG  19 IGV/IPM DNG
      //   24 Total CP
      // Estaban corridos un campo: lo que se mostraba como IGV eran las bases.
      // Con setiembre 2026 de KREZKA el panel anunciaba S/ 4,728.47 de IGV
      // cuando SUNAT dice 832.19 — el crédito fiscal salía 5.7 veces inflado.
      const base = num(f[14]) + num(f[16]) + num(f[18]);
      const igv = num(f[15]) + num(f[17]) + num(f[19]);
      sunat.set(clave(tipo, serie, numero), {
        comprobante: `${serie}-${numero.replace(/^0+/, '')}`,
        // 11 es el TIPO de documento ("6" = RUC) y 12 el número; el nombre
        // está en la 13. Con el corrimiento salía el RUC donde va el proveedor,
        // y la pantalla listaba números en vez de nombres.
        proveedorDoc: (f[12] ?? '').trim(),
        proveedor: (f[13] ?? '').trim(),
        fechaEmision: (f[4] ?? '').trim(),
        base: this.r2(base),
        igv: this.r2(igv),
        // 23 es "Otros Trib/Cargos" y venía casi siempre en 0.00: por eso TODOS
        // los comprobantes que sí cruzaban salían como "diferencia de importe".
        total: num(f[24]),
      });
    }

    // Las denegadas por el contador no entran al RCE (fetchCompras las excluye),
    // pero SÍ hay que reconocerlas en el cruce: si no, aparecerían como "SUNAT
    // las tiene y tú no" cuando en realidad se excluyeron a propósito.
    const propias = await this.fetchCompras(empresaId, mes, anio, sedeId);
    const denegadas = await this.prisma.compra.findMany({
      where: {
        empresaId,
        ...(sedeId ? { sedeId } : {}),
        fechaEmision: this.getDateRange(mes, anio),
        estado: 'REGISTRADO' as any,
        estadoContador: 'DENEGADA' as any,
      },
      select: {
        id: true,
        tipoDoc: true,
        serie: true,
        numero: true,
        motivoContador: true,
      },
    });
    const denegadasPorClave = new Map(
      denegadas.map((c) => [
        clave(TIPO_DOC_COMPRA_MAP[c.tipoDoc] ?? '01', c.serie, String(c.numero)),
        c,
      ]),
    );
    const sistema = new Map<
      string,
      {
        id: number;
        comprobante: string;
        proveedor: string;
        base: number;
        igv: number;
        total: number;
      }
    >();
    for (const c of propias) {
      const tipoSunat = TIPO_DOC_COMPRA_MAP[c.tipoDoc] ?? '01';
      const signo = tipoSunat === '07' ? -1 : 1;
      const factor = factorCompraASoles(c as any) * signo;
      sistema.set(clave(tipoSunat, c.serie, String(c.numero)), {
        id: c.id,
        comprobante: `${c.serie}-${c.numero}`,
        proveedor: (c as any).proveedor?.nombre ?? '',
        base: this.r2(Number(c.subtotal ?? 0) * factor),
        igv: this.r2(Number(c.igv ?? 0) * factor),
        total: this.r2(Number(c.total ?? 0) * factor),
      });
    }

    const soloEnSunat: any[] = [];
    const soloEnSistema: any[] = [];
    const diferencias: any[] = [];
    const denegadasEnSunat: any[] = [];
    const tolerancia = 0.01;

    for (const [k, v] of sunat) {
      const mio = sistema.get(k);
      if (!mio) {
        const deneg = denegadasPorClave.get(k);
        if (deneg) {
          // SUNAT la tiene y el negocio la registró, pero el contador la excluyó.
          denegadasEnSunat.push({
            ...v,
            tipoDoc: k.split('|')[0],
            compraId: deneg.id,
            motivo: deneg.motivoContador,
          });
          continue;
        }
        soloEnSunat.push({ ...v, tipoDoc: k.split('|')[0] });
        continue;
      }
      if (
        Math.abs(mio.base - v.base) > tolerancia ||
        Math.abs(mio.igv - v.igv) > tolerancia ||
        Math.abs(mio.total - v.total) > tolerancia
      ) {
        diferencias.push({
          comprobante: mio.comprobante,
          tipoDoc: k.split('|')[0],
          compraId: mio.id,
          sunat: v,
          sistema: mio,
        });
      }
    }
    for (const [k, v] of sistema) {
      if (!sunat.has(k)) {
        soloEnSistema.push({ ...v, tipoDoc: k.split('|')[0] });
      }
    }

    const suma = (arr: Array<{ igv: number; total: number }>) => ({
      igv: this.r2(arr.reduce((a, v) => a + v.igv, 0)),
      total: this.r2(arr.reduce((a, v) => a + v.total, 0)),
    });

    return {
      periodo: this.periodoSire(mes, anio),
      totales: {
        sunat: { cantidad: sunat.size, ...suma([...sunat.values()]) },
        sistema: { cantidad: sistema.size, ...suma([...sistema.values()]) },
      },
      cuadra:
        !soloEnSunat.length && !soloEnSistema.length && !diferencias.length,
      // Crédito fiscal que el negocio está dejando de usar por no haber
      // registrado esas compras: el número que justifica todo el cruce.
      igvNoAprovechado: suma(soloEnSunat).igv,
      // Las que SUNAT tiene y el contador excluyó a propósito: ni error ni
      // crédito perdido por descuido, pero hay que verlas.
      denegadas: denegadasEnSunat.slice(0, 200),
      totalDenegadas: denegadasEnSunat.length,
      igvDenegado: suma(denegadasEnSunat).igv,
      soloEnSunat: soloEnSunat.slice(0, 200),
      soloEnSistema: soloEnSistema.slice(0, 200),
      diferencias: diferencias.slice(0, 200),
      totalSoloEnSunat: soloEnSunat.length,
      totalSoloEnSistema: soloEnSistema.length,
      totalDiferencias: diferencias.length,
    };
  }


  // ───────────── Sincronización con la API del SIRE de SUNAT ─────────────
  /**
   * Estado de la configuración del SIRE de una empresa, para que la UI sepa si
   * puede ofrecer el botón de sincronizar (sin exponer secretos).
   */
  async estadoSire(empresaId: number) {
    const e = (await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        ruc: true,
        sireClientId: true,
        sireClientSecret: true,
        sireUsuarioSol: true,
        sireClaveSol: true,
      },
    })) as any;
    const falta: string[] = [];
    if (!e?.sireClientId) falta.push('Client ID');
    if (!e?.sireClientSecret) falta.push('Client Secret');
    if (!e?.sireUsuarioSol) falta.push('Usuario SOL');
    if (!e?.sireClaveSol) falta.push('Clave SOL');
    return {
      configurado: falta.length === 0,
      falta,
      usuarioSol: e?.sireUsuarioSol ?? null,
      clientId: e?.sireClientId ?? null,
    };
  }

  /** Credenciales listas para el cliente, o un error explicando qué falta. */
  private async credencialesSire(empresaId: number): Promise<SireCredenciales> {
    const e = (await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        ruc: true,
        sireClientId: true,
        sireClientSecret: true,
        sireUsuarioSol: true,
        sireClaveSol: true,
      },
    })) as any;
    const clave = descifrarSecreto(e?.sireClaveSol);
    if (!e?.sireClientId || !e?.sireClientSecret || !e?.sireUsuarioSol || !clave) {
      throw new BadRequestException(
        'Faltan las credenciales del SIRE. Complétalas en Perfil → Configuración → SIRE (API de SUNAT).',
      );
    }
    return {
      ruc: String(e.ruc ?? ''),
      clientId: e.sireClientId,
      clientSecret: e.sireClientSecret,
      usuarioSol: e.sireUsuarioSol,
      claveSol: clave,
    };
  }

  /**
   * Prueba de conexión: pide el token al SIRE y reporta el resultado. Sirve
   * para que el usuario sepa si sus credenciales quedaron bien SIN tener que
   * esperar a una sincronización completa.
   */
  /** AAAAMM del mes pasado: el período que con más seguridad ya está cerrado. */
  private periodoAnteriorSire(): string {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const valor = (t: string) => Number(partes.find((p) => p.type === t)?.value);
    let mes = valor('month') - 1;
    let anio = valor('year');
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
    return `${anio}${String(mes).padStart(2, '0')}`;
  }

  async probarConexionSire(empresaId: number) {
    const cred = await this.credencialesSire(empresaId);
    const cliente = new SireClient(cred);
    try {
      const token = await cliente.obtenerToken();
      // El token solo prueba que el usuario y la credencial son válidos. Antes
      // la prueba terminaba acá y pintaba verde, pero el acceso al SIRE puede
      // fallar igual —RUC que no corresponde, servicio no habilitado— y el
      // empresario se enteraba recién al pedir sus compras. Se hace una lectura
      // real para que el verde signifique "esto funciona".
      const periodo = this.periodoAnteriorSire();
      try {
        await cliente.solicitarPropuestaRce(periodo);
      } catch (e: any) {
        return {
          ok: false,
          mensaje: 'Las credenciales son válidas, pero SUNAT no devolvió tus compras.',
          detalle: e?.detalle ?? e?.message ?? null,
        };
      }
      return {
        ok: true,
        mensaje: 'Conexión con el SIRE establecida.',
        tokenLargo: token.length,
      };
    } catch (e: any) {
      return {
        ok: false,
        mensaje: e?.message ?? 'No se pudo conectar con el SIRE.',
        detalle: e?.detalle ?? null,
      };
    }
  }

  /**
   * Trae del SIRE la propuesta de compras del período y la cruza con lo
   * registrado, reusando exactamente el mismo análisis que el cruce manual
   * (`compararComprasConPropuesta`): la API solo reemplaza el "subir archivo".
   *
   * OJO: la descarga depende de rutas de SUNAT que al 2026-09-22 devuelven 401
   * (credenciales recién creadas, aún no habilitadas). El flujo queda escrito y
   * los errores traducidos; al habilitarse puede hacer falta ajustar las rutas
   * (son configurables por variables de entorno en sire.client.ts).
   */
  /**
   * Convierte un fallo del SIRE en una respuesta que el empresario pueda leer.
   *
   * El `SireError` lleva un `detalle` con lo que contestó SUNAT, pero si sube
   * sin traducir Nest lo vuelve un 500 genérico y ese detalle se pierde: en
   * pantalla quedaba "El SIRE de SUNAT respondió con un error." y nada más, que
   * no alcanza ni para saber si reintentar.
   */
  private comoErrorLegible(e: any): never {
    const mensaje = e?.message ?? 'No se pudo consultar el SIRE de SUNAT.';
    const detalle = e?.detalle ? ` ${e.detalle}` : '';
    throw new BadRequestException(`${mensaje}${detalle}`.trim());
  }

  async sincronizarComprasDesdeSire(
    empresaId: number,
    mes: number,
    anio: number,
    sedeId?: number,
  ) {
    try {
      return await this.sincronizarComprasDesdeSireInterno(
        empresaId, mes, anio, sedeId,
      );
    } catch (e: any) {
      if (e?.name === 'SireError') this.comoErrorLegible(e);
      throw e;
    }
  }

  private async sincronizarComprasDesdeSireInterno(
    empresaId: number,
    mes: number,
    anio: number,
    sedeId?: number,
  ) {
    const cred = await this.credencialesSire(empresaId);
    const cliente = new SireClient(cred);
    const periodo = `${anio}${String(mes).padStart(2, '0')}`;

    const solicitud = await cliente.solicitarPropuestaRce(periodo);
    // SUNAT responde con un ticket cuando la exportación es asíncrona, o
    // directamente con el contenido cuando es pequeña.
    const numTicket =
      solicitud?.numTicket ?? solicitud?.numticket ?? solicitud?.ticket ?? null;

    let contenido = '';
    if (!numTicket) {
      contenido = typeof solicitud === 'string' ? solicitud : '';
    } else {
      // SUNAT tarda unos segundos en generar el archivo. Antes se consultaba el
      // ticket una sola vez, al instante, y casi siempre salía "aún no está
      // listo" aunque a los pocos segundos ya lo estuviera. Se espera un poco.
      let reporte: any = null;
      let registro: any = null;
      for (let intento = 1; intento <= 6; intento++) {
        const estado = await cliente.consultarTicket(periodo, String(numTicket));
        registro = estado?.registros?.[0] ?? null;
        reporte = registro?.archivoReporte?.[0] ?? null;
        if (reporte?.nomArchivoReporte || estado?.nomArchivoReporte) break;
        if (intento < 6) await new Promise((s) => setTimeout(s, 5000));
      }
      const archivo = reporte?.nomArchivoReporte ?? null;
      if (!archivo) {
        // Un ticket "Terminado" sin archivo NO es un archivo que todavía se
        // está generando: es que SUNAT no tiene comprobantes para el período.
        // Decir "vuelve a intentar en unos minutos" manda al empresario a
        // reintentar para siempre por algo que nunca va a cambiar solo.
        const detalle = registro?.detalleTicket ?? {};
        const terminado =
          String(registro?.desEstadoProceso ?? '').toLowerCase() === 'terminado';
        const informados = Number(detalle?.cntCPInformados ?? 0);
        if (terminado && !(informados > 0)) {
          return {
            vacio: true,
            numTicket: String(numTicket),
            mensaje:
              'SUNAT no tiene comprobantes para este período. Si esperabas ver compras acá, revisa en el SIRE de SUNAT que la propuesta del período siga disponible: una vez que la registras, deja de estar.',
          };
        }
        return {
          pendiente: true,
          numTicket: String(numTicket),
          mensaje:
            'SUNAT está preparando el archivo. Vuelve a intentar en unos minutos.',
        };
      }
      // Todo sale del ticket. `codProceso` y `numTicket` no son opcionales:
      // sin ellos SUNAT responde 422 "El archivo solicitado no existe".
      contenido = await cliente.descargarArchivo({
        nombreArchivo: String(archivo),
        codTipoArchivo: String(reporte?.codTipoAchivoReporte ?? '00'),
        numTicket: String(numTicket),
        codProceso: String(registro?.codProceso ?? '10'),
        perTributario: String(registro?.perTributario ?? periodo),
      });
    }

    if (!contenido.trim()) {
      throw new BadRequestException(
        'SUNAT no devolvió comprobantes para ese período.',
      );
    }

    const cruce = await this.compararComprasConPropuesta({
      empresaId,
      mes,
      anio,
      contenido,
      sedeId,
    });
    return { ...cruce, origen: 'SUNAT' as const };
  }
}
