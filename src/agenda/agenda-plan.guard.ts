import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  planTieneFeature,
  SELECT_PLAN_FEATURES,
} from '../common/utils/plan-features';
import { MENSAJE_PLAN_SIN_AGENDA } from './agenda.tipos';

/**
 * La Agenda es una característica del plan (`tieneAgenda`, Sistema → Planes).
 * Se relee en cada petición: si el plan cambia, aplica sin volver a iniciar sesión.
 */
@Injectable()
export class AgendaPlanGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { empresaId?: unknown } }>();
    const empresaId = Number(user?.empresaId);
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      throw new ForbiddenException(MENSAJE_PLAN_SIN_AGENDA);
    }
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { plan: { select: SELECT_PLAN_FEATURES } },
    });
    if (!planTieneFeature(empresa?.plan, 'tieneAgenda')) {
      throw new ForbiddenException(MENSAJE_PLAN_SIN_AGENDA);
    }
    return true;
  }
}
