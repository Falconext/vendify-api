import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { verificarAccesoSoloFotos } from '../../usuarios/solo-fotos';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any): any {
    const usuario = super.handleRequest(err, user, info, context, status);
    if (context.getType() === 'http') {
      verificarAccesoSoloFotos(usuario, context.switchToHttp().getRequest());
    }
    return usuario;
  }
}
