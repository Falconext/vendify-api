import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthService } from '../auth/auth.service';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { EmpresaService } from './empresa.service';

/**
 * "Permitir fechas anteriores dentro de una serie" (Configuración →
 * Comprobantes e impresión): se guarda y se expone igual que
 * `imprimirAutomatico`.
 */
describe('opción permitirFechaAnteriorEnSerie', () => {
  describe('DTO', () => {
    const errores = async (body: any) =>
      (await validate(plainToInstance(UpdateEmpresaDto, body))).filter(
        (e) => e.property === 'permitirFechaAnteriorEnSerie',
      );

    it('acepta true y false', async () => {
      expect(await errores({ permitirFechaAnteriorEnSerie: true })).toHaveLength(0);
      expect(await errores({ permitirFechaAnteriorEnSerie: false })).toHaveLength(0);
    });

    it('es opcional', async () => {
      expect(await errores({})).toHaveLength(0);
    });

    it('rechaza lo que no es boolean', async () => {
      expect(await errores({ permitirFechaAnteriorEnSerie: 'si' })).toHaveLength(1);
      expect(await errores({ permitirFechaAnteriorEnSerie: 1 })).toHaveLength(1);
    });
  });

  describe('EmpresaService.actualizar', () => {
    const armar = () => {
      const prisma: any = {
        empresa: {
          findUnique: jest.fn().mockResolvedValue({ id: 7, brand: 'vendify', producto: 'pos', planId: 1 }),
          update: jest.fn().mockResolvedValue({ id: 7 }),
        },
      };
      const service = new EmpresaService(prisma, {} as any, {} as any, {} as any);
      jest.spyOn(service, 'obtenerPorId').mockResolvedValue({ id: 7 } as any);
      return { prisma, service };
    };
    const datos = (prisma: any) => prisma.empresa.update.mock.calls[0][0].data;

    it('guarda la opción al activarla', async () => {
      const { prisma, service } = armar();
      await service.actualizar({ id: 7, permitirFechaAnteriorEnSerie: true } as any);
      expect(datos(prisma)).toEqual({ permitirFechaAnteriorEnSerie: true });
    });

    it('guarda la opción al apagarla', async () => {
      const { prisma, service } = armar();
      await service.actualizar({ id: 7, permitirFechaAnteriorEnSerie: false } as any);
      expect(datos(prisma)).toEqual({ permitirFechaAnteriorEnSerie: false });
    });

    it('no la toca si no viene', async () => {
      const { prisma, service } = armar();
      await service.actualizar({ id: 7, imprimirAutomatico: true } as any);
      expect(datos(prisma)).not.toHaveProperty('permitirFechaAnteriorEnSerie');
    });
  });

  describe('perfil (AuthService)', () => {
    const armar = () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const prisma: any = { usuario: { findUnique } };
      const config: any = { get: () => undefined };
      const service = new AuthService(prisma, {} as any, config, {} as any);
      return { service, findUnique };
    };
    const selectEmpresa = (findUnique: jest.Mock) =>
      findUnique.mock.calls[0][0].select.empresa.select;

    it('obtenerUsuarioActual expone empresa.permitirFechaAnteriorEnSerie', async () => {
      const { service, findUnique } = armar();
      await service.obtenerUsuarioActual(1);
      expect(selectEmpresa(findUnique).permitirFechaAnteriorEnSerie).toBe(true);
    });

    it('obtenerPerfilCompleto expone empresa.permitirFechaAnteriorEnSerie', async () => {
      const { service, findUnique } = armar();
      await service.obtenerPerfilCompleto(1);
      expect(selectEmpresa(findUnique).permitirFechaAnteriorEnSerie).toBe(true);
    });
  });
});
