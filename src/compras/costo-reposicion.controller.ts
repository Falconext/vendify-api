import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CostoReposicionService } from './costo-reposicion.service';
import { AplicarPreciosDto, ConfigCostoReposicionDto } from './dto/costo-reposicion.dto';

// Va antes de ComprasController en el módulo: si no, `GET compras/:id` toma "dolar-margenes".
@Controller('compras/dolar-margenes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CostoReposicionController {
  constructor(private readonly service: CostoReposicionService) {}

  @Get()
  listar(@Request() req) {
    return this.service.listar(req.user.empresaId);
  }

  @Get('producto/:id')
  deProducto(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.deProducto(req.user.empresaId, id);
  }

  @Put('config')
  @Roles('ADMIN_EMPRESA')
  guardarConfig(@Request() req, @Body() body: ConfigCostoReposicionDto) {
    return this.service.guardarConfig(req.user.empresaId, body);
  }

  @Post('aplicar-precios')
  @Roles('ADMIN_EMPRESA')
  aplicarPrecios(@Request() req, @Body() body: AplicarPreciosDto) {
    return this.service.aplicarPrecios(req.user.empresaId, body.items);
  }
}
