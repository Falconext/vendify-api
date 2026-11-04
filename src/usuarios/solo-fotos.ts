import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Usuario delegado solo para las fotos de los productos
 * (`Usuario.soloImagenesProductos`).
 *
 * Solo ve la lista de productos sin precios ni costos y gestiona sus imágenes.
 * Se hace cumplir en `JwtAuthGuard`, no controlador por controlador: el backend
 * no valida los permisos por módulo del usuario, así que sin esto con el mismo
 * token podría leer kardex, compras o reportes. ADMIN_EMPRESA no se restringe.
 */
const RUTAS_DE_IMAGEN = [
  /^\/productos\/ia\/generar-imagen$/,
  /^\/productos\/ia\/aprobar-imagen$/,
  /^\/productos\/:id\/imagen$/,
  /^\/productos\/:id\/imagen-extra$/,
  /^\/productos\/:id\/imagen-url$/,
  /^\/productos\/:id\/galeria$/,
  /^\/productos\/:id\/imagenes-extra$/,
  /^\/productos\/:id\/imagen-color$/,
  /^\/productos\/:id\/imagen-color-url$/,
  /^\/productos\/:id\/importar-imagen-url$/,
];

/** Lecturas de productos: sus respuestas pasan por `SoloFotosInterceptor`. */
const LECTURAS_DE_PRODUCTOS = [
  /^\/productos$/,
  /^\/productos\/:id$/,
  /^\/productos\/limite-imagenes$/,
];

/** Lo que el panel necesita para abrir la sesión y pintar la lista. Sin plata. */
const LECTURAS_DEL_PANEL = [
  /^\/usuario\/me$/,
  /^\/categoria(\/|$)/,
  /^\/marca(\/|$)/,
  /^\/sede(s)?(\/|$)/,
];

export function esSoloFotos(user: any): boolean {
  return user?.rol === 'USUARIO_EMPRESA' && Boolean(user?.soloImagenesProductos);
}

export function rutaPermitidaSoloFotos(method: string, rutaCompleta: string): boolean {
  const ruta = rutaCompleta.replace(/^\/api(?=\/|$)/, '');
  // Sesión: me, refresh, logout, elegir sede.
  if (/^\/auth(\/|$)/.test(ruta)) return true;
  if (RUTAS_DE_IMAGEN.some((r) => r.test(ruta))) return true;
  if (method !== 'GET') return false;
  return (
    LECTURAS_DE_PRODUCTOS.some((r) => r.test(ruta)) ||
    LECTURAS_DEL_PANEL.some((r) => r.test(ruta))
  );
}

export function verificarAccesoSoloFotos(user: any, req: any) {
  if (!esSoloFotos(user)) return;
  if (rutaPermitidaSoloFotos(String(req?.method), String(req?.route?.path ?? ''))) return;
  throw new ForbiddenException(
    'Tu usuario solo puede gestionar las fotos de los productos. Pídele a tu administrador que te habilite el resto en Usuarios.',
  );
}

/** Campos de plata: no salen hacia un usuario de solo fotos. */
const CAMPO_DE_PLATA =
  /precio|costo|margen|utilidad|ganancia|rentabilidad|comision|provision|mayorista|oferta|descuento|igv|^valor(?!esAtributos)|^mto|presentaciones|^listas?/i;

/** Copia de la respuesta sin campos de plata, a cualquier profundidad. */
export function quitarCamposDePlata<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map((v) => quitarCamposDePlata(v)) as unknown as T;
  if (!valor || typeof valor !== 'object') return valor;
  // Solo objetos planos: Date y Decimal se quedan como están.
  const proto = Object.getPrototypeOf(valor);
  if (proto !== Object.prototype && proto !== null) return valor;
  const limpio: Record<string, unknown> = {};
  for (const [campo, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!CAMPO_DE_PLATA.test(campo)) limpio[campo] = quitarCamposDePlata(v);
  }
  return limpio as T;
}

@Injectable()
export class SoloFotosInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const { user } = context.switchToHttp().getRequest();
    if (!esSoloFotos(user)) return next.handle();
    return next.handle().pipe(map((data) => quitarCamposDePlata(data)));
  }
}
