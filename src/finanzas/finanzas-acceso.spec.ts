import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FinanzasController } from './finanzas.controller';
import { AnalisisFinancieroController } from '../analisis-financiero/analisis-financiero.controller';
import { ModuleAccessGuard } from '../common/guards/module-access.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { MODULE_KEY } from '../common/decorators/module.decorator';
import { PERMISSION_KEY } from '../common/decorators/permission.decorator';

/**
 * Finanzas y Análisis financiero exigen lo mismo que el menú: el plan con
 * "Mi negocio" y el usuario con ese permiso. Couriers es de Ventas.
 */
const FINANZAS = ['mi-negocio', 'reportes', 'finanzas'];

const rutas = (ctrl: any) =>
  Object.getOwnPropertyNames(ctrl.prototype).filter(
    (k) =>
      k !== 'constructor' &&
      Reflect.getMetadata('path', ctrl.prototype[k]) !== undefined,
  );

const meta = (reflector: Reflector, key: string, ctrl: any, metodo: string) =>
  reflector.getAllAndOverride(key, [ctrl.prototype[metodo], ctrl]);

describe('Acceso a Finanzas y Análisis financiero', () => {
  const reflector = new Reflector();

  it.each([FinanzasController, AnalisisFinancieroController])(
    '%p pasa por los guards de módulo y de permiso',
    (ctrl) => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, ctrl);
      expect(guards).toEqual(
        expect.arrayContaining([ModuleAccessGuard, PermissionsGuard]),
      );
    },
  );

  it('cada ruta pide el módulo y el permiso que le toca', () => {
    for (const ctrl of [FinanzasController, AnalisisFinancieroController]) {
      const lista = rutas(ctrl);
      expect(lista.length).toBeGreaterThan(5);
      for (const metodo of lista) {
        // Couriers es de Ventas: el plan no se restringe y basta vender.
        const couriers = metodo === 'getAnalisisCouriers';
        expect([metodo, meta(reflector, MODULE_KEY, ctrl, metodo)]).toEqual([
          metodo,
          couriers ? [] : FINANZAS,
        ]);
        expect([metodo, meta(reflector, PERMISSION_KEY, ctrl, metodo)]).toEqual(
          [metodo, couriers ? ['ventas', ...FINANZAS] : FINANZAS],
        );
      }
    }
  });

  describe('guards con usuarios reales', () => {
    const ctx = (user: any, handler: any, clase: any) =>
      ({
        getHandler: () => handler,
        getClass: () => clase,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as any;
    const plan = (...codigos: string[]) => ({
      empresa: {
        plan: {
          modulosAsignados: codigos.map((codigo) => ({ modulo: { codigo } })),
        },
      },
    });
    const pnl = AnalisisFinancieroController.prototype.getPnl;
    const couriers = AnalisisFinancieroController.prototype.getAnalisisCouriers;
    const modulo = new ModuleAccessGuard(reflector, {} as any);
    const permiso = new PermissionsGuard(reflector);

    it('plan sin "Mi negocio" (Emprendedor): 403 en rentabilidad', async () => {
      const admin = { rol: 'ADMIN_EMPRESA', ...plan('ventas', 'dashboard') };
      await expect(
        modulo.canActivate(ctx(admin, pnl, AnalisisFinancieroController)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cajero sin el permiso: 403; con el permiso o "*": pasa', () => {
      const base = { rol: 'USUARIO_EMPRESA', ...plan('mi-negocio', 'ventas') };
      expect(() =>
        permiso.canActivate(
          ctx(
            { ...base, permisos: ['ventas', 'kardex'] },
            pnl,
            AnalisisFinancieroController,
          ),
        ),
      ).toThrow(ForbiddenException);
      expect(
        permiso.canActivate(
          ctx(
            { ...base, permisos: ['mi-negocio'] },
            pnl,
            AnalisisFinancieroController,
          ),
        ),
      ).toBe(true);
      expect(
        permiso.canActivate(
          ctx({ ...base, permisos: ['*'] }, pnl, AnalisisFinancieroController),
        ),
      ).toBe(true);
    });

    it('admin con el plan completo pasa', async () => {
      const admin = { rol: 'ADMIN_EMPRESA', ...plan('mi-negocio', 'ventas') };
      await expect(
        modulo.canActivate(ctx(admin, pnl, AnalisisFinancieroController)),
      ).resolves.toBe(true);
      expect(
        permiso.canActivate(ctx(admin, pnl, AnalisisFinancieroController)),
      ).toBe(true);
    });

    it('couriers sigue abierto para quien vende, sin "Mi negocio"', async () => {
      const cajero = {
        rol: 'USUARIO_EMPRESA',
        permisos: ['ventas'],
        // Plan con códigos viejos (sin "ventas"): couriers no lo mira.
        ...plan('facturacion', 'caja'),
      };
      await expect(
        modulo.canActivate(ctx(cajero, couriers, AnalisisFinancieroController)),
      ).resolves.toBe(true);
      expect(
        permiso.canActivate(
          ctx(cajero, couriers, AnalisisFinancieroController),
        ),
      ).toBe(true);
      // Quien no vende ni ve finanzas, no.
      expect(() =>
        permiso.canActivate(
          ctx(
            { ...cajero, permisos: ['kardex'] },
            couriers,
            AnalisisFinancieroController,
          ),
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
