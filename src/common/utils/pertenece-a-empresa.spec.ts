import { BadRequestException } from '@nestjs/common';
import { exigirDeLaEmpresa } from './pertenece-a-empresa';

const prismaCon = (encontrados: number) => {
  const count = jest.fn(async () => encontrados);
  return { prisma: { cliente: { count }, sede: { count } }, count };
};

describe('exigirDeLaEmpresa', () => {
  it('pasa si todos son de la empresa', async () => {
    const { prisma } = prismaCon(2);
    await expect(
      exigirDeLaEmpresa(prisma, 'cliente', [1, 2], 5, 'x'),
    ).resolves.toBeUndefined();
  });

  it('rechaza si alguno no lo es', async () => {
    const { prisma } = prismaCon(1);
    await expect(
      exigirDeLaEmpresa(prisma, 'cliente', [1, 2], 5, 'ajeno'),
    ).rejects.toThrow(new BadRequestException('ajeno'));
  });

  it('un id repetido cuenta una vez y los vacíos no consultan', async () => {
    const { prisma, count } = prismaCon(1);
    await exigirDeLaEmpresa(prisma, 'cliente', [7, 7, '7', null], 5, 'x');
    expect(count.mock.calls[0]).toEqual([
      {
        where: {
          id: { in: [7] },
          OR: [{ empresaId: 5 }, { empresaId: null }],
        },
      },
    ]);
    count.mockClear();
    await exigirDeLaEmpresa(prisma, 'cliente', [null, undefined, ''], 5, 'x');
    expect(count).not.toHaveBeenCalled();
  });

  it('una sede siempre es de una empresa: no admite filas globales', async () => {
    const { prisma, count } = prismaCon(1);
    await exigirDeLaEmpresa(prisma, 'sede', [3], 5, 'x');
    expect(count.mock.calls[0]).toEqual([
      { where: { id: { in: [3] }, empresaId: 5 } },
    ]);
  });
});
