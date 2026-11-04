import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User } from '../common/decorators/user.decorator';
import { AgendaPlanGuard } from './agenda-plan.guard';
import { AgendaService } from './agenda.service';
import type {
  AgendaActor,
  AgendaOcurrencia,
  AgendaResumen,
  AgendaUsuarioMin,
} from './agenda.tipos';

/** Un id que no es entero cae como "no existe" (404), igual que uno ajeno. */
const idEvento = (valor: string): number =>
  /^\d{1,9}$/.test(valor) ? Number(valor) : 0;

/**
 * Mi negocio → Agenda. El cuerpo llega como objeto plano (sin DTO de
 * class-validator): lo valida y filtra `agenda.validacion.ts`, que solo lee las
 * claves del contrato y responde los errores en español.
 */
@Controller('agenda')
@UseGuards(JwtAuthGuard, RolesGuard, AgendaPlanGuard)
@Roles('ADMIN_EMPRESA', 'USUARIO_EMPRESA')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  private actor(user: {
    id?: unknown;
    rol?: unknown;
    empresaId?: unknown;
  }): AgendaActor {
    const id = Number(user?.id);
    const empresaId = Number(user?.empresaId);
    if (
      !Number.isInteger(id) ||
      !Number.isInteger(empresaId) ||
      empresaId <= 0
    ) {
      throw new ForbiddenException('Tu sesión no tiene una empresa asignada.');
    }
    return { id, empresaId, rol: typeof user.rol === 'string' ? user.rol : '' };
  }

  @Get('eventos')
  listar(
    @User() user: any,
    @Query() query: Record<string, unknown>,
  ): Promise<AgendaOcurrencia[]> {
    return this.agenda.listar(this.actor(user), query ?? {});
  }

  @Post('eventos')
  crear(
    @User() user: any,
    @Body() body: Record<string, unknown>,
  ): Promise<AgendaOcurrencia> {
    return this.agenda.crear(this.actor(user), body);
  }

  @Patch('eventos/:eventoId')
  actualizar(
    @User() user: any,
    @Param('eventoId') eventoId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<AgendaOcurrencia> {
    return this.agenda.actualizar(this.actor(user), idEvento(eventoId), body);
  }

  @Delete('eventos/:eventoId')
  eliminar(
    @User() user: any,
    @Param('eventoId') eventoId: string,
  ): Promise<{ ok: true }> {
    return this.agenda.eliminar(this.actor(user), idEvento(eventoId));
  }

  @Post('eventos/:eventoId/completar')
  completar(
    @User() user: any,
    @Param('eventoId') eventoId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<AgendaOcurrencia> {
    return this.agenda.completar(this.actor(user), idEvento(eventoId), body);
  }

  @Get('resumen')
  resumen(@User() user: any): Promise<AgendaResumen> {
    return this.agenda.resumen(this.actor(user));
  }

  @Get('usuarios')
  usuarios(@User() user: any): Promise<AgendaUsuarioMin[]> {
    return this.agenda.usuarios(this.actor(user));
  }
}
