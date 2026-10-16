import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ListaPrecioService } from './lista-precio.service';
import {
  ReprecioMasivoService,
  type FiltroReprecio,
  type OperacionDto,
} from './reprecio-masivo.service';
import { CreateListaPrecioDto } from './dto/create-lista-precio.dto';
import { UpdateListaPrecioDto } from './dto/update-lista-precio.dto';

// Gestión de listas de precio: solo el ADMIN_EMPRESA configura precios/asignaciones.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lista-precio')
export class ListaPrecioController {
  constructor(
    private readonly service: ListaPrecioService,
    private readonly reprecio: ReprecioMasivoService,
  ) {}

  // ── Reprecio masivo: subir/bajar el precio de muchos productos de una vez ──
  // Solo el ADMIN_EMPRESA: mueve cientos de precios de golpe.

  @Post('reprecio-masivo/previsualizar')
  @HttpCode(200)
  @Roles('ADMIN_EMPRESA')
  previsualizarReprecio(
    @Body() body: { filtro: FiltroReprecio; operacion: OperacionDto },
    @Request() req,
  ) {
    return this.reprecio.previsualizar(
      req.user.empresaId,
      body.filtro || {},
      body.operacion,
    );
  }

  @Post('reprecio-masivo/aplicar')
  @Roles('ADMIN_EMPRESA')
  aplicarReprecio(
    @Body() body: { filtro: FiltroReprecio; operacion: OperacionDto },
    @Request() req,
  ) {
    return this.reprecio.aplicar(
      req.user.empresaId,
      req.user.id,
      body.filtro || {},
      body.operacion,
    );
  }

  @Get('reprecio-masivo/lotes')
  @Roles('ADMIN_EMPRESA')
  lotesReprecio(@Request() req, @Query('limit') limit?: string) {
    return this.reprecio.lotes(req.user.empresaId, limit ? Number(limit) : 10);
  }

  @Post('reprecio-masivo/revertir/:id')
  @Roles('ADMIN_EMPRESA')
  revertirReprecio(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.reprecio.revertir(req.user.empresaId, id);
  }

  @Post()
  @Roles('ADMIN_EMPRESA')
  create(@Body() dto: CreateListaPrecioDto, @Request() req) {
    return this.service.create(dto, req.user.empresaId);
  }

  @Get()
  @Roles('ADMIN_EMPRESA')
  findAll(@Request() req) {
    return this.service.findAll(req.user.empresaId);
  }

  @Get(':id')
  @Roles('ADMIN_EMPRESA')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.findOne(id, req.user.empresaId);
  }

  @Put(':id')
  @Roles('ADMIN_EMPRESA')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateListaPrecioDto,
    @Request() req,
  ) {
    return this.service.update(id, dto, req.user.empresaId);
  }

  @Delete(':id')
  @Roles('ADMIN_EMPRESA')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.remove(id, req.user.empresaId);
  }

  // Precios de un producto en todas las listas (panel de la ficha de producto).
  @Get('producto/:productoId')
  @Roles('ADMIN_EMPRESA')
  itemsDeProducto(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Request() req,
  ) {
    return this.service.itemsDeProducto(productoId, req.user.empresaId);
  }

  @Put('producto/:productoId')
  @Roles('ADMIN_EMPRESA')
  upsertItemsDeProducto(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Body()
    body: {
      entradas: Array<{
        listaPrecioId: number;
        presentacionCodigo?: string;
        precioUnitario: number;
        precioOferta?: number | null;
      }>;
    },
    @Request() req,
  ) {
    return this.service.upsertItemsDeProducto(
      productoId,
      req.user.empresaId,
      body.entradas || [],
    );
  }
}
