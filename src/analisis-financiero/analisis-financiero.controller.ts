import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequiresModule } from '../common/decorators/module.decorator';
import { RequiresPermission } from '../common/decorators/permission.decorator';
import { User } from '../common/decorators/user.decorator';
import { AnalisisFinancieroService } from './analisis-financiero.service';
import { QueryPeriodoDto } from './dto/query-periodo.dto';
import { CrearGastoDto } from './dto/crear-gasto.dto';
import { ActualizarGastoDto } from './dto/actualizar-gasto.dto';

/**
 * Rentabilidad, utilidad, gastos y análisis de ventas: pantallas de Finanzas
 * (módulo "Mi negocio"). Se exige lo mismo que el menú —plan y permiso del
 * usuario—; antes bastaba con estar logueado para ver costos y márgenes.
 * El tablero de couriers es de Ventas y lleva su propia regla abajo.
 */
@Controller('analisis-financiero')
@UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionsGuard)
@RequiresModule('mi-negocio', 'reportes', 'finanzas')
@RequiresPermission('mi-negocio', 'reportes', 'finanzas')
export class AnalisisFinancieroController {
  constructor(private readonly service: AnalisisFinancieroService) {}

  /**
   * Sede por la que se filtra el análisis.
   *
   * · ADMIN_EMPRESA / ADMIN_SISTEMA: elige con el selector. Sin valor (o 0) =
   *   todas las sedes, que es el comportamiento histórico.
   * · USUARIO_EMPRESA: SIEMPRE su sede, la del JWT. El `?sedeId=` de la URL se
   *   ignora, así que no puede pedir el análisis de otra sede a mano.
   *
   * Mismo criterio que ya aplica Flujo de Caja (finanzas.controller.ts).
   */
  private resolverSedeId(user: any, sedeIdQuery?: string): number | null {
    const isAdmin =
      user?.rol === 'ADMIN_EMPRESA' || user?.rol === 'ADMIN_SISTEMA';
    if (!isAdmin) return user?.sedeId ?? null;
    const n = Number(sedeIdQuery);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * GET /analisis-financiero/pnl?mes=&anio=&fechaInicio=&fechaFin=
   * Mes (mes/anio), un día (fechaInicio = fechaFin) o un rango. Si vienen
   * fechas, mandan sobre mes/anio.
   */
  @Get('pnl')
  getPnl(
    @User() user: any,
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    return this.service.getPnl(user.empresaId, {
      mes: mes ? Number(mes) : undefined,
      anio: anio ? Number(anio) : undefined,
      fechaInicio,
      fechaFin,
      sedeId: this.resolverSedeId(user, sedeIdQuery),
    });
  }

  /**
   * GET /analisis-financiero/utilidad-diaria/exportar — Excel día por día del
   * mismo período y sede que /pnl. Lleva costos: no sale para quien los tiene
   * ocultos.
   */
  @Get('utilidad-diaria/exportar')
  async exportarUtilidadDiaria(
    @User() user: any,
    @Res() res: Response,
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    if (user?.rol === 'USUARIO_EMPRESA' && user?.ocultarPrecioCosto) {
      throw new ForbiddenException('No tienes permiso para ver costos.');
    }
    const { buffer, nombre } = await this.service.exportarUtilidadDiaria(
      user.empresaId,
      {
        mes: mes ? Number(mes) : undefined,
        anio: anio ? Number(anio) : undefined,
        fechaInicio,
        fechaFin,
        sedeId: this.resolverSedeId(user, sedeIdQuery),
      },
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename=${nombre}`);
    res.status(200).send(buffer);
  }

  /** GET /analisis-financiero/resumen-anual?anio=2026 — ganancia mes a mes y total del año. */
  @Get('resumen-anual')
  getResumenAnual(
    @User() user: any,
    @Query('anio') anioQuery?: string,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    const anio = Number(anioQuery);
    return this.service.getResumenAnual(
      user.empresaId,
      Number.isInteger(anio) && anio >= 2000 && anio <= 2100 ? anio : new Date().getFullYear(),
      this.resolverSedeId(user, sedeIdQuery),
    );
  }

  /**
   * GET /analisis-financiero/evolucion?meses=6
   * meses defaults to 6 if not provided.
   */
  @Get('evolucion')
  getEvolucion(
    @User() user: any,
    @Query('meses') mesesQuery?: string,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    const meses = mesesQuery
      ? Math.min(Math.max(parseInt(mesesQuery, 10) || 6, 1), 24)
      : 6;
    return this.service.getEvolucion(
      user.empresaId,
      meses,
      this.resolverSedeId(user, sedeIdQuery),
    );
  }

  /** GET /analisis-financiero/gastos?mes=&anio= */
  @Get('gastos')
  listarGastos(
    @User() user: any,
    @Query() query: QueryPeriodoDto,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    return this.service.listarGastos(
      user.empresaId,
      query.mes,
      query.anio,
      this.resolverSedeId(user, sedeIdQuery),
    );
  }

  /** GET /analisis-financiero/gastos/historial */
  @Get('gastos/historial')
  historialGastos(
    @User() user: any,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
  ) {
    return this.service.historialGastos(user.empresaId, fechaInicio, fechaFin);
  }

  /** POST /analisis-financiero/gastos */
  @Post('gastos')
  crearGasto(@User() user: any, @Body() dto: CrearGastoDto) {
    return this.service.crearGasto(user.empresaId, dto);
  }

  /** PATCH /analisis-financiero/gastos/:id */
  @Patch('gastos/:id')
  actualizarGasto(
    @User() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarGastoDto,
  ) {
    return this.service.actualizarGasto(user.empresaId, id, dto);
  }

  /** GET /analisis-financiero/categorias?mes=&anio=&fechaInicio=&fechaFin= */
  @Get('categorias')
  getRentabilidadCategorias(
    @User() user: any,
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    return this.service.getRentabilidadCategorias(
      user.empresaId,
      mes ? Number(mes) : undefined,
      anio ? Number(anio) : undefined,
      this.resolverSedeId(user, sedeIdQuery),
      fechaInicio,
      fechaFin,
    );
  }

  /** GET /analisis-financiero/metodos-pago?mes=&anio=&fechaInicio=&fechaFin= */
  @Get('metodos-pago')
  getMetodosPago(
    @User() user: any,
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    return this.service.getMetodosPago(
      user.empresaId,
      mes ? Number(mes) : undefined,
      anio ? Number(anio) : undefined,
      fechaInicio,
      fechaFin,
      this.resolverSedeId(user, sedeIdQuery),
    );
  }

  /** GET /analisis-financiero/productos?mes=&anio=&fechaInicio=&fechaFin= */
  @Get('productos')
  getProductosVendidos(
    @User() user: any,
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    return this.service.getProductosVendidos(
      user.empresaId,
      mes ? Number(mes) : undefined,
      anio ? Number(anio) : undefined,
      fechaInicio,
      fechaFin,
      this.resolverSedeId(user, sedeIdQuery),
    );
  }

  /** GET /analisis-financiero/clientes?mes=&anio=&fechaInicio=&fechaFin= — ciudades, clientes, fidelidad y envíos */
  @Get('clientes')
  getAnalisisClientes(
    @User() user: any,
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    return this.service.getAnalisisClientes(
      user.empresaId,
      mes ? Number(mes) : undefined,
      anio ? Number(anio) : undefined,
      fechaInicio,
      fechaFin,
      this.resolverSedeId(user, sedeIdQuery),
    );
  }

  /** GET /analisis-financiero/couriers?mes=&anio=&fechaInicio=&fechaFin= — tablero Shalom / Olva / propios */
  // Es de Ventas, no de Finanzas: el plan no se restringe (como antes) y basta
  // con que el usuario venda o vea finanzas.
  @Get('couriers')
  @RequiresModule()
  @RequiresPermission('ventas', 'mi-negocio', 'reportes', 'finanzas')
  getAnalisisCouriers(
    @User() user: any,
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('sedeId') sedeIdQuery?: string,
  ) {
    return this.service.getAnalisisCouriers(
      user.empresaId,
      mes ? Number(mes) : undefined,
      anio ? Number(anio) : undefined,
      fechaInicio,
      fechaFin,
      this.resolverSedeId(user, sedeIdQuery),
    );
  }

  /** DELETE /analisis-financiero/gastos/:id */
  @Delete('gastos/:id')
  eliminarGasto(@User() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarGasto(user.empresaId, id);
  }
}
