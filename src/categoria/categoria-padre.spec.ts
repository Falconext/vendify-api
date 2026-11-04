import { BadRequestException } from '@nestjs/common';
import { CategoriaService } from './categoria.service';

describe('subcategorías: reglas de la categoría madre', () => {
  const cats: Record<number, { id: number; padreId: number | null; empresaId: number }> = {
    1: { id: 1, padreId: null, empresaId: 10 },
    2: { id: 2, padreId: 1, empresaId: 10 },
    3: { id: 3, padreId: null, empresaId: 99 },
  };
  const prisma: any = {
    categoria: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.nombre) return null;
        const c = cats[where.id];
        return c && c.empresaId === where.empresaId ? c : null;
      }),
      count: jest.fn(async ({ where }: any) => Object.values(cats).filter((c) => c.padreId === where.padreId).length),
      create: jest.fn(async ({ data }: any) => data),
      update: jest.fn(async ({ data }: any) => data),
    },
  };
  const svc = new CategoriaService(prisma, {} as any);

  it('crea una subcategoría dentro de una principal', async () => {
    await expect(svc.crear({ nombre: 'Osos', padreId: 1 } as any, 10)).resolves.toMatchObject({ padreId: 1 });
  });

  it('no permite un segundo nivel', async () => {
    await expect(svc.crear({ nombre: 'X', padreId: 2 } as any, 10)).rejects.toThrow(BadRequestException);
  });

  it('no permite una madre de otra empresa', async () => {
    await expect(svc.crear({ nombre: 'X', padreId: 3 } as any, 10)).rejects.toThrow(BadRequestException);
  });

  it('una categoría con hijas no puede volverse hija', async () => {
    await expect(svc.actualizar(1, { nombre: 'Peluches', padreId: 4 } as any, 10)).rejects.toThrow(BadRequestException);
  });

  it('no puede ser madre de sí misma', async () => {
    await expect(svc.actualizar(1, { nombre: 'Peluches', padreId: 1 } as any, 10)).rejects.toThrow('sí misma');
  });

  it('sin padreId no cambia la madre; null la vuelve principal', async () => {
    await svc.actualizar(2, { nombre: 'Osos' } as any, 10);
    expect(prisma.categoria.update.mock.calls.at(-1)[0].data).not.toHaveProperty('padreId');
    await svc.actualizar(2, { nombre: 'Osos', padreId: null } as any, 10);
    expect(prisma.categoria.update.mock.calls.at(-1)[0].data.padreId).toBeNull();
  });
});
