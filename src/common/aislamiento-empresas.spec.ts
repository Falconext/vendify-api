/**
 * Aislamiento entre empresas sobre los controladores y servicios reales:
 * un usuario de la empresa 9 no puede llegar a datos de la empresa 8.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ComprobanteController } from '../comprobante/comprobante.controller';
import { ComprobanteService } from '../comprobante/comprobante.service';
import { SedeService } from '../sede/sede.service';
import { CombosController } from '../combos/combos.controller';
import { SistemaFinanzasController } from '../sistema-finanzas/sistema-finanzas.controller';
import { ProductoPlantillaController } from '../producto/producto-plantilla.controller';
import { ROLES_KEY } from './decorators/roles.decorator';

const admin = { id: 1, rol: 'ADMIN_EMPRESA', empresaId: 9, sedeId: 5 };
const cajera = { id: 2, rol: 'USUARIO_EMPRESA', empresaId: 9, sedeId: 5 };
const OTRA = '8';

const rolesDe = (clase: any, metodo?: string) =>
  metodo
    ? Reflect.getMetadata(ROLES_KEY, clase.prototype[metodo])
    : Reflect.getMetadata(ROLES_KEY, clase);

describe('Comprobantes por ruta con empresaId', () => {
  const montar = () => {
    const service: any = {
      listar: jest.fn().mockResolvedValue({}),
      siguienteCorrelativo: jest.fn().mockResolvedValue({}),
      detalle: jest.fn().mockResolvedValue({}),
      asegurarDeLaEmpresa: jest.fn().mockResolvedValue(undefined),
    };
    const enviar: any = { execute: jest.fn().mockResolvedValue({}) };
    const ctrl: any = new ComprobanteController(service, enviar, {} as any, {} as any);
    return { ctrl, service, enviar };
  };

  it('rechaza la empresa ajena sin consultar nada', async () => {
    const { ctrl, service } = montar();
    await expect(ctrl.listarPath(admin, OTRA, 'FORMAL')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.siguienteCorrelativoPath(admin, OTRA, '01')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.detallePath(admin, OTRA, 'F001', '1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.listar).not.toHaveBeenCalled();
    expect(service.siguienteCorrelativo).not.toHaveBeenCalled();
    expect(service.detalle).not.toHaveBeenCalled();
  });

  it('la propia empresa sigue funcionando', async () => {
    const { ctrl, service } = montar();
    await ctrl.siguienteCorrelativoPath(admin, '9', '01');
    await ctrl.detallePath(admin, '9', 'F001', '1');
    expect(service.siguienteCorrelativo).toHaveBeenCalledWith(9, '01', undefined);
    expect(service.detalle).toHaveBeenCalledWith(9, 'F001', 1, undefined);
  });

  it('la cajera queda en su sede igual que en las rutas sin empresaId', async () => {
    const { ctrl, service } = montar();
    await ctrl.detallePath(cajera, '9', 'F001', '1');
    await ctrl.listarPath(cajera, '9', 'FORMAL');
    expect(service.detalle).toHaveBeenCalledWith(9, 'F001', 1, 5);
    expect(service.listar).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 9, sedeId: 5 }));
  });

  it('no envía a SUNAT un comprobante ajeno', async () => {
    const { ctrl, service, enviar } = montar();
    service.asegurarDeLaEmpresa.mockRejectedValue(new NotFoundException());
    await expect(ctrl.enviarASunat(admin, 77)).rejects.toBeInstanceOf(NotFoundException);
    expect(service.asegurarDeLaEmpresa).toHaveBeenCalledWith(77, 9);
    expect(enviar.execute).not.toHaveBeenCalled();
  });

  it('debug-xml queda solo para ADMIN_SISTEMA', () => {
    expect(rolesDe(ComprobanteController, 'debugXml')).toEqual(['ADMIN_SISTEMA']);
  });
});

describe('Estado de OT', () => {
  it('busca el comprobante dentro de la empresa del token', async () => {
    const prisma: any = { comprobante: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    const svc: any = Object.create(ComprobanteService.prototype);
    svc.prisma = prisma;
    await expect(svc.actualizarEstadoOT(77, { estadoOT: 'LISTO' }, 9)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.comprobante.findFirst).toHaveBeenCalledWith({ where: { id: 77, empresaId: 9 } });
    expect(prisma.comprobante.update).not.toHaveBeenCalled();
  });
});

describe('Sedes', () => {
  const montar = () => {
    const prisma: any = {
      sede: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      comprobante: { findFirst: jest.fn() },
      movimientoKardex: { findFirst: jest.fn() },
      productoStock: { deleteMany: jest.fn() },
      usuarioSede: { deleteMany: jest.fn() },
      usuario: { updateMany: jest.fn() },
    };
    const svc: any = Object.create(SedeService.prototype);
    svc.prisma = prisma;
    return { svc, prisma };
  };

  it('una sede ajena no se ve', async () => {
    const { svc, prisma } = montar();
    await expect(svc.findOne(3, 9)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sede.findFirst).toHaveBeenCalledWith({ where: { id: 3, empresaId: 9 } });
  });

  it('una sede ajena no se edita y no toca la principal propia', async () => {
    const { svc, prisma } = montar();
    await expect(svc.update(3, { esPrincipal: true }, 9)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sede.updateMany).not.toHaveBeenCalled();
    expect(prisma.sede.update).not.toHaveBeenCalled();
  });

  it('una sede ajena no se borra ni pierde su stock', async () => {
    const { svc, prisma } = montar();
    await expect(svc.remove(3, 9)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productoStock.deleteMany).not.toHaveBeenCalled();
    expect(prisma.usuario.updateMany).not.toHaveBeenCalled();
    expect(prisma.sede.delete).not.toHaveBeenCalled();
  });
});

describe('Combos', () => {
  it('no da el stock de un combo ajeno', async () => {
    const service: any = {
      findOne: jest.fn().mockRejectedValue(new NotFoundException()),
      checkStock: jest.fn(),
    };
    const ctrl: any = new CombosController(service);
    await expect(ctrl.checkStock({ user: admin }, 3)).rejects.toBeInstanceOf(NotFoundException);
    expect(service.findOne).toHaveBeenCalledWith(3, 9);
    expect(service.checkStock).not.toHaveBeenCalled();
  });
});

describe('Rutas de plataforma', () => {
  it('las finanzas de la plataforma son solo de ADMIN_SISTEMA', () => {
    expect(rolesDe(SistemaFinanzasController)).toEqual(['ADMIN_SISTEMA']);
  });

  it.each(['subirImagen', 'create', 'categorizarConIA', 'searchImage', 'deleteMany', 'deleteImagesMany', 'update', 'remove'])(
    'el catálogo global no se escribe sin ADMIN_SISTEMA: %s',
    (metodo) => {
      expect(rolesDe(ProductoPlantillaController, metodo)).toEqual(['ADMIN_SISTEMA']);
    },
  );
});
