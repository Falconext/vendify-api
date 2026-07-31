import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/**
 * Traduce errores conocidos de Prisma a mensajes amables + status HTTP.
 * Evita que el usuario vea cosas como
 * "Invalid `prisma.producto.create()` invocation: Unique constraint failed...".
 */
function mapearErrorPrisma(
  exception: unknown,
): { status: number; message: string } | null {
  const err = exception as any;
  if (
    !err ||
    typeof err !== 'object' ||
    err.name !== 'PrismaClientKnownRequestError'
  ) {
    return null;
  }
  const target = err?.meta?.target;
  const campos: string[] = Array.isArray(target)
    ? target.map((t: unknown) => String(t))
    : typeof target === 'string'
      ? [target]
      : [];
  switch (err.code) {
    case 'P2002': {
      const set = new Set(campos.map((c) => c.toLowerCase()));
      if (set.has('codigo')) {
        return {
          status: HttpStatus.CONFLICT,
          message: 'Ya existe un producto con ese código.',
        };
      }
      if (set.has('codigobarras')) {
        return {
          status: HttpStatus.CONFLICT,
          message: 'Ya existe un producto con ese código de barras.',
        };
      }
      const detalle = campos.length ? ` (${campos.join(', ')})` : '';
      return {
        status: HttpStatus.CONFLICT,
        message: `Ya existe un registro con esos datos${detalle}.`,
      };
    }
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'El registro solicitado no existe o ya fue eliminado.',
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        message:
          'No se puede completar la operación porque el registro está relacionado con otros datos.',
      };
    default:
      return null;
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const errorPrisma = mapearErrorPrisma(exception);

    const status = errorPrisma
      ? errorPrisma.status
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = errorPrisma
      ? errorPrisma.message
      : exception instanceof HttpException
        ? ((exception.getResponse() as any)?.message ?? exception.message)
        : 'Internal server error';

    response.status(status).json({
      code: 0,
      message,
      error: (exception as any)?.name ?? 'Error',
    });
  }
}
