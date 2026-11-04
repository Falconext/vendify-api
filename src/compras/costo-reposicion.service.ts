import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TipoCambioService } from '../tipo-cambio/tipo-cambio.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  CONFIG_POR_DEFECTO,
  calcularFila,
  ordenarFilas,
  resumenFilas,
  valorSinIgv,
  type ConfigCostoReposicion,
  type FilaReposicion,
} from './costo-reposicion';

/** metaData.origen del aviso diario: con él se sabe si ya salió hoy. */
export const ORIGEN_AVISO_TC = 'tc-margen-riesgo';

/**
 * Dólar y márgenes: lo que se compró en US$ comparado con lo que costaría
 * reponerlo al TC de hoy, con el precio que deja el margen buscado.
 * El cálculo vive en costo-reposicion.ts.
 */
@Injectable()
export class CostoReposicionService {
  private readonly logger = new Logger(CostoReposicionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tipoCambio: TipoCambioService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async config(empresaId: number): Promise<ConfigCostoReposicion> {
    const e = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { tcAlertaUmbralPct: true, margenObjetivoPct: true, tcColchon: true },
    });
    if (!e) return CONFIG_POR_DEFECTO;
    return {
      umbralPct: Number(e.tcAlertaUmbralPct),
      margenObjetivoPct: Number(e.margenObjetivoPct),
      colchonTc: Number(e.tcColchon),
    };
  }

  async guardarConfig(empresaId: number, dto: Partial<ConfigCostoReposicion>) {
    const data: Record<string, number> = {};
    const num = (v: unknown, min: number, max: number, campo: string) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) {
        throw new BadRequestException(`${campo} debe estar entre ${min} y ${max}.`);
      }
      return n;
    };
    if (dto.umbralPct !== undefined) data.tcAlertaUmbralPct = num(dto.umbralPct, 0.5, 50, 'El aviso');
    if (dto.margenObjetivoPct !== undefined) data.margenObjetivoPct = num(dto.margenObjetivoPct, 1, 90, 'El margen');
    if (dto.colchonTc !== undefined) data.tcColchon = num(dto.colchonTc, 0, 1, 'El colchón');
    await this.prisma.empresa.update({ where: { id: empresaId }, data });
    return this.config(empresaId);
  }

  /** TC venta SUNAT de hoy. */
  async tcHoy(): Promise<{ venta: number; fecha: string }> {
    const tc = await this.tipoCambio.consultar();
    if (!(tc.venta > 1)) throw new BadRequestException('No se pudo obtener el tipo de cambio de hoy.');
    return { venta: tc.venta, fecha: tc.fecha };
  }

  /**
   * La última compra en dólares de cada producto: su costo neto en US$ y el
   * TC con que entró. Solo compras vigentes que entraron al inventario.
   */
  private async ultimasComprasUsd(empresaId: number, productoIds?: number[]) {
    const lineas = await this.prisma.detalleCompra.findMany({
      where: {
        productoId: productoIds ? { in: productoIds } : { not: null },
        cantidad: { gt: 0 },
        compra: {
          empresaId,
          moneda: 'USD',
          estado: 'REGISTRADO',
          esGasto: false,
        },
        producto: { estado: 'ACTIVO' },
      },
      orderBy: [{ compra: { fechaEmision: 'desc' } }, { id: 'desc' }],
      distinct: ['productoId'],
      select: {
        productoId: true,
        precioUnitario: true,
        compra: { select: { tipoCambio: true, fechaEmision: true, serie: true, numero: true } },
        producto: {
          select: {
            id: true,
            codigo: true,
            descripcion: true,
            moneda: true,
            precioUnitario: true,
            tipoAfectacionIGV: true,
            igvPorcentaje: true,
            stock: true,
          },
        },
      },
    });
    return lineas.filter((l) => l.producto && Number(l.compra.tipoCambio) > 1);
  }

  private filas(
    lineas: Awaited<ReturnType<CostoReposicionService['ultimasComprasUsd']>>,
    tcHoy: number,
    config: ConfigCostoReposicion,
  ): FilaReposicion[] {
    return lineas.map((l) =>
      calcularFila(
        {
          ...l.producto!,
          precioUnitario: Number(l.producto!.precioUnitario),
          igvPorcentaje: Number(l.producto!.igvPorcentaje),
          stock: Number(l.producto!.stock),
        },
        {
          costoUsd: Number(l.precioUnitario),
          tipoCambio: Number(l.compra.tipoCambio),
          fecha: l.compra.fechaEmision,
          documento: `${l.compra.serie}-${l.compra.numero}`,
        },
        tcHoy,
        config,
      ),
    );
  }

  async listar(empresaId: number) {
    const [config, tc, lineas] = await Promise.all([
      this.config(empresaId),
      this.tcHoy(),
      this.ultimasComprasUsd(empresaId),
    ]);
    const filas = ordenarFilas(this.filas(lineas, tc.venta, config));
    return { tcHoy: tc.venta, tcFecha: tc.fecha, config, resumen: resumenFilas(filas), filas };
  }

  /** La fila de un producto, para la ficha. null = nunca se compró en dólares. */
  async deProducto(empresaId: number, productoId: number) {
    const lineas = await this.ultimasComprasUsd(empresaId, [productoId]);
    if (!lineas.length) return null;
    const [config, tc] = await Promise.all([this.config(empresaId), this.tcHoy()]);
    return { tcHoy: tc.venta, tcFecha: tc.fecha, config, fila: this.filas(lineas, tc.venta, config)[0] };
  }

  /**
   * Cambia el precio de venta de varios productos de una vez. Devuelve los
   * precios anteriores: mandarlos de vuelta deshace el cambio.
   */
  async aplicarPrecios(empresaId: number, items: { productoId: number; precio: number }[]) {
    if (!Array.isArray(items) || !items.length) {
      throw new BadRequestException('Elige al menos un producto.');
    }
    if (items.length > 2000) throw new BadRequestException('Máximo 2000 productos por vez.');
    for (const it of items) {
      if (!(Number(it.precio) > 0)) throw new BadRequestException('Cada precio debe ser mayor a 0.');
    }
    const ids = [...new Set(items.map((i) => Number(i.productoId)))];
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: ids }, empresaId },
      select: { id: true, precioUnitario: true, tipoAfectacionIGV: true, igvPorcentaje: true },
    });
    if (productos.length !== ids.length) {
      throw new BadRequestException('Algún producto no existe o no es de tu empresa.');
    }
    const porId = new Map(productos.map((p) => [p.id, p]));
    const anteriores: { productoId: number; precio: number }[] = [];
    await this.prisma.$transaction(
      items.map((it) => {
        const p = porId.get(Number(it.productoId))!;
        const precio = Number(Number(it.precio).toFixed(2));
        anteriores.push({ productoId: p.id, precio: Number(p.precioUnitario) });
        return this.prisma.producto.update({
          where: { id: p.id },
          data: {
            precioUnitario: precio,
            valorUnitario: valorSinIgv(precio, p.tipoAfectacionIGV, Number(p.igvPorcentaje)),
          },
        });
      }),
    );
    return { actualizados: items.length, anteriores };
  }

  /**
   * Aviso diario en la campana a las empresas que tienen productos en riesgo:
   * el dólar subió más del umbral y el precio ya no deja el margen buscado.
   * Una vez al día por empresa.
   */
  @Cron('20 8 * * *', { name: 'aviso-tc-margenes', timeZone: 'America/Lima' })
  async avisarRiesgos(): Promise<void> {
    // Un backend de desarrollo contra la base compartida duplicaría el aviso.
    if (process.env.TC_MARGENES_JOBS_ENABLED === 'false') return;
    try {
      const tc = await this.tcHoy();
      const hace = new Date();
      hace.setFullYear(hace.getFullYear() - 1);
      const empresas = await this.prisma.compra.findMany({
        where: { moneda: 'USD', estado: 'REGISTRADO', fechaEmision: { gte: hace } },
        distinct: ['empresaId'],
        select: { empresaId: true },
      });
      for (const { empresaId } of empresas) {
        try {
          await this.avisarEmpresa(empresaId, tc.venta);
        } catch (error) {
          this.logger.warn(`Aviso TC empresa ${empresaId}: ${(error as Error)?.message}`);
        }
      }
    } catch (error) {
      this.logger.error('Error en el aviso de dólar y márgenes:', error as Error);
    }
  }

  async avisarEmpresa(empresaId: number, tcHoy: number) {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const yaAvisado = await this.prisma.notificacion.count({
      where: {
        empresaId,
        creadoEn: { gte: inicioDia },
        metaData: { path: ['origen'], equals: ORIGEN_AVISO_TC },
      },
    });
    if (yaAvisado) return false;
    const config = await this.config(empresaId);
    const enRiesgo = this.filas(await this.ultimasComprasUsd(empresaId), tcHoy, config).filter(
      (f) => f.estado === 'riesgo',
    );
    if (!enRiesgo.length) return false;
    const n = enRiesgo.length;
    const ejemplo = enRiesgo.sort((a, b) => b.variacionTcPct - a.variacionTcPct)[0];
    await this.notificaciones.notificarAdminsEmpresa({
      empresaId,
      tipo: 'WARNING',
      titulo: `El dólar subió: ${n} producto${n === 1 ? '' : 's'} con el margen en riesgo`,
      mensaje:
        `El dólar está en ${tcHoy.toFixed(3)}. ${ejemplo.descripcion} se compró a ${ejemplo.tcCompra.toFixed(3)} ` +
        `y reponerlo hoy cuesta S/ ${ejemplo.costoReposicionSoles.toFixed(2)}: con su precio actual el margen queda en ` +
        `${ejemplo.margenReposicionPct ?? 0}% (buscas ${config.margenObjetivoPct}%). Revisa los precios en Compras → Dólar y márgenes.`,
      metaData: { origen: ORIGEN_AVISO_TC, tcHoy, productos: n, link: '/administrador/compras/dolar-margenes' },
    });
    return true;
  }
}
