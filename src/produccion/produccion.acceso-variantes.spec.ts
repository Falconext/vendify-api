import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProduccionService } from './produccion.service';

/**
 * Producción sirve a cualquier rubro (módulo en el plan; fabricación la conserva)
 * y, con variantes, se trabaja sobre la talla/color: el stock del modelo es la
 * suma de sus variantes y lo que entre directo a él se pierde.
 */
const conEmpresa = (rubro: string, modulosEnPlan: number, modeloConVariantes?: string) => {
  const prisma: any = {
    empresa: {
      findUnique: jest.fn().mockResolvedValue({
        id: 1,
        rubro: { nombre: rubro },
        plan: { modulosAsignados: Array.from({ length: modulosEnPlan }, (_, id) => ({ id })) },
      }),
    },
    producto: {
      findFirst: jest.fn().mockResolvedValue(
        modeloConVariantes ? { descripcion: modeloConVariantes } : null,
      ),
    },
  };
  return { prisma, servicio: new ProduccionService(prisma, {} as any) as any };
};

describe('acceso a Producción', () => {
  it('rechaza a un rubro cualquiera si su plan no incluye el módulo', async () => {
    const { servicio } = conEmpresa('Textil y confecciones', 0);
    await expect(servicio.asegurarAccesoProduccion(1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deja pasar a cualquier rubro con el módulo en el plan', async () => {
    const { servicio } = conEmpresa('Panadería', 1);
    await expect(servicio.asegurarAccesoProduccion(1)).resolves.toBeUndefined();
  });

  it('fabricación la conserva aunque su plan no tenga el módulo', async () => {
    const { servicio } = conEmpresa('Fabricación y producción', 0);
    await expect(servicio.asegurarAccesoProduccion(1)).resolves.toBeUndefined();
  });
});

describe('producción con variantes', () => {
  it('no deja usar un modelo con variantes y pide elegir la talla', async () => {
    const { servicio } = conEmpresa('Textil', 1, 'POLO BASICO');
    await expect(servicio.asegurarSinVariantes(1, [7], 'que vas a producir')).rejects.toThrow(
      new BadRequestException('"POLO BASICO" tiene variantes: elige la talla o el color exacto que vas a producir.'),
    );
  });

  it('solo cuenta variantes activas y de la misma empresa', async () => {
    const { prisma, servicio } = conEmpresa('Textil', 1);
    await expect(servicio.asegurarSinVariantes(1, [7, 8], 'como insumo')).resolves.toBeUndefined();
    expect(prisma.producto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { empresaId: 1, id: { in: [7, 8] }, variantes: { some: { estado: 'ACTIVO' } } },
      }),
    );
  });
});
