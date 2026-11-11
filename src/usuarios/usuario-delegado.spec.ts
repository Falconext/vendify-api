import { ForbiddenException } from '@nestjs/common';
import {
  exigirPermisosQueTiene,
  exigirPuedeGestionar,
  parsearPermisos,
  sinCamposDelAdmin,
} from './usuario-delegado';

describe('usuario delegado', () => {
  describe('exigirPuedeGestionar', () => {
    it('el delegado no toca la cuenta del admin', () => {
      expect(() =>
        exigirPuedeGestionar('USUARIO_EMPRESA', 'ADMIN_EMPRESA'),
      ).toThrow(ForbiddenException);
    });
    it('el delegado sí gestiona a otro empleado', () => {
      expect(() =>
        exigirPuedeGestionar('USUARIO_EMPRESA', 'USUARIO_EMPRESA'),
      ).not.toThrow();
    });
    it('el admin gestiona a cualquiera', () => {
      expect(() =>
        exigirPuedeGestionar('ADMIN_EMPRESA', 'ADMIN_EMPRESA'),
      ).not.toThrow();
    });
  });

  describe('exigirPermisosQueTiene', () => {
    it('rechaza agregar un permiso que el delegado no tiene', () => {
      expect(() =>
        exigirPermisosQueTiene('USUARIO_EMPRESA', ['usuarios', 'ventas'], [
          'ventas',
          'finanzas',
        ]),
      ).toThrow('finanzas');
    });
    it('deja conservar permisos que el usuario ya tenía', () => {
      expect(() =>
        exigirPermisosQueTiene(
          'USUARIO_EMPRESA',
          ['usuarios'],
          ['finanzas', 'ventas'],
          ['finanzas', 'ventas'],
        ),
      ).not.toThrow();
    });
    it('deja repartir los que sí tiene', () => {
      expect(() =>
        exigirPermisosQueTiene('USUARIO_EMPRESA', ['usuarios', 'ventas'], [
          'ventas',
        ]),
      ).not.toThrow();
    });
    it('no aplica al admin ni a un delegado con *', () => {
      expect(() =>
        exigirPermisosQueTiene('ADMIN_EMPRESA', [], ['finanzas']),
      ).not.toThrow();
      expect(() =>
        exigirPermisosQueTiene('USUARIO_EMPRESA', ['*'], ['finanzas']),
      ).not.toThrow();
    });
    it('sin permisos en el pedido no hay nada que revisar', () => {
      expect(() =>
        exigirPermisosQueTiene('USUARIO_EMPRESA', [], undefined),
      ).not.toThrow();
    });
  });

  describe('sinCamposDelAdmin', () => {
    const cuerpo = {
      id: 5,
      nombre: 'Ana',
      password: 'nueva123',
      permisos: ['finanzas'],
      bloquearEdicionPrecioVenta: false,
      comisionGlobal: 50,
      sedeIds: [1, 2],
    };
    it('al editarse a sí mismo solo quedan sus datos', () => {
      expect(sinCamposDelAdmin('USUARIO_EMPRESA', 5, 5, cuerpo)).toEqual({
        id: 5,
        nombre: 'Ana',
        password: 'nueva123',
      });
    });
    it('a otro usuario no le quita nada', () => {
      expect(sinCamposDelAdmin('USUARIO_EMPRESA', 7, 5, cuerpo)).toEqual(
        cuerpo,
      );
    });
    it('el admin editándose no pierde nada', () => {
      expect(sinCamposDelAdmin('ADMIN_EMPRESA', 5, 5, cuerpo)).toEqual(cuerpo);
    });
  });

  it('parsearPermisos lee el JSON guardado', () => {
    expect(parsearPermisos('["a","b"]')).toEqual(['a', 'b']);
    expect(parsearPermisos(null)).toEqual([]);
    expect(parsearPermisos('roto')).toEqual([]);
  });
});
