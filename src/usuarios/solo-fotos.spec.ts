import { ForbiddenException } from '@nestjs/common';
import {
  quitarCamposDePlata,
  rutaPermitidaSoloFotos,
  verificarAccesoSoloFotos,
} from './solo-fotos';

const fotografo = { rol: 'USUARIO_EMPRESA', soloImagenesProductos: true };
const req = (method: string, path: string) => ({ method, route: { path } });

describe('Usuario de solo fotos', () => {
  it('sube y cambia fotos, y lee la lista', () => {
    for (const [m, p] of [
      ['POST', '/api/productos/:id/imagen'],
      ['POST', '/api/productos/:id/imagen-url'],
      ['PATCH', '/api/productos/:id/imagenes-extra'],
      ['POST', '/api/productos/:id/galeria'],
      ['GET', '/api/productos'],
      ['GET', '/api/productos/:id'],
      ['GET', '/api/auth/me'],
    ]) {
      expect(rutaPermitidaSoloFotos(m, p)).toBe(true);
    }
  });

  it('no toca precio, alta, baja, estado ni importación', () => {
    for (const [m, p] of [
      ['PUT', '/api/productos/:id'],
      ['POST', '/api/productos'],
      ['DELETE', '/api/productos/:id'],
      ['PATCH', '/api/productos/:id/estado'],
      ['PATCH', '/api/productos/:id/categoria'],
      ['POST', '/api/productos/importar'],
      ['PATCH', '/api/productos/lotes/:id/ajustar-stock'],
    ]) {
      expect(rutaPermitidaSoloFotos(m, p)).toBe(false);
    }
  });

  it('no lee por otras rutas donde hay costos o precios', () => {
    for (const p of [
      '/api/productos/exportar',
      '/api/productos/resumen',
      '/api/productos/:id/lotes',
      '/api/productos/barcode/:codigo',
      '/api/kardex',
      '/api/compras',
      '/api/comprobante',
      '/api/dashboard',
    ]) {
      expect(rutaPermitidaSoloFotos('GET', p)).toBe(false);
    }
  });

  it('no escribe en categorías ni marcas', () => {
    expect(rutaPermitidaSoloFotos('POST', '/api/categoria')).toBe(false);
    expect(rutaPermitidaSoloFotos('DELETE', '/api/marca/:id')).toBe(false);
  });

  it('rechaza con 403 y no afecta a nadie más', () => {
    expect(() => verificarAccesoSoloFotos(fotografo, req('PUT', '/api/productos/:id'))).toThrow(
      ForbiddenException,
    );
    const normal = { rol: 'USUARIO_EMPRESA' };
    const admin = { rol: 'ADMIN_EMPRESA', soloImagenesProductos: true };
    expect(() => verificarAccesoSoloFotos(normal, req('PUT', '/api/productos/:id'))).not.toThrow();
    expect(() => verificarAccesoSoloFotos(admin, req('PUT', '/api/productos/:id'))).not.toThrow();
  });

  it('la respuesta sale sin plata, a cualquier profundidad', () => {
    const fecha = new Date();
    const limpio = quitarCamposDePlata({
      items: [
        {
          id: 1,
          descripcion: 'Polo',
          imagenUrl: 'x.png',
          stock: 3,
          creadoEn: fecha,
          precioUnitario: 10,
          valorUnitario: 8,
          costoPromedio: 5,
          preciosMayorista: [[1, 2]],
          valoresAtributos: { Talla: 'M' },
          variantes: [{ id: 2, precioOferta: 9, costoUnitario: 4, imagenUrl: 'y.png' }],
        },
      ],
    });
    expect(limpio).toEqual({
      items: [
        {
          id: 1,
          descripcion: 'Polo',
          imagenUrl: 'x.png',
          stock: 3,
          creadoEn: fecha,
          valoresAtributos: { Talla: 'M' },
          variantes: [{ id: 2, imagenUrl: 'y.png' }],
        },
      ],
    });
  });
});
