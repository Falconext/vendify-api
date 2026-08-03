import * as XLSX from 'xlsx';
import { ProductoService } from './producto.service';

/**
 * QA funcional del fix: la carga masiva de productos ahora importa y
 * actualiza la MARCA (antes se ignoraba la columna MARCA del Excel).
 *
 * Se construye un buffer XLSX real y se ejecuta cargaMasiva con Prisma
 * mockeado para observar el upsert de marca y su enlace al producto.
 */
describe('ProductoService — carga masiva importa MARCA', () => {
  let service: ProductoService;
  let prisma: any;

  const empresaId = 1;
  const sedeId = 5;

  const buildBuffer = (rows: Record<string, any>[]): Buffer => {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Productos');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  };

  beforeEach(() => {
    prisma = {
      sede: { findFirst: jest.fn().mockResolvedValue({ id: sedeId }) },
      unidadMedida: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 1, nombre: 'Unidad', codigo: 'NIU' }]),
      },
      categoria: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 3 }),
      },
      marca: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 7 }),
      },
      producto: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 99 }),
      },
    };
    service = new ProductoService(prisma, {} as any, {} as any, {} as any);
  });

  // STOCK vacío para no disparar aplicarStockSedeImportacion (fuera de alcance).
  const baseRow = {
    CÓDIGO: 'PR001',
    PRODUCTO: 'Cerradura para puerta',
    'U.M': 'Unidad',
    AFECT: '10',
    'PRECIO UNITARIO': 44,
    IGV: 18,
    STOCK: null,
    CATEGORIA: 'Cerraduras',
    MARCA: 'Forte',
  };

  it('crea la marca inexistente y la enlaza al actualizar un producto existente', async () => {
    prisma.producto.findFirst.mockResolvedValue({
      id: 99,
      codigo: 'PR001',
      codigoBarras: null,
      opcionesAtributos: null,
    });

    const res = await service.cargaMasiva(
      buildBuffer([baseRow]),
      empresaId,
      sedeId,
    );

    expect(res.fallidos).toBe(0);
    expect(prisma.marca.create).toHaveBeenCalledWith({
      data: { nombre: 'Forte', empresaId },
    });
    expect(prisma.producto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99 },
        data: expect.objectContaining({ marcaId: 7 }),
      }),
    );
  });

  it('reutiliza la marca existente (case-insensitive) sin crearla de nuevo', async () => {
    prisma.marca.findMany.mockResolvedValue([{ id: 7, nombre: 'Forte' }]);
    prisma.producto.findFirst.mockResolvedValue({
      id: 99,
      codigo: 'PR001',
      codigoBarras: null,
      opcionesAtributos: null,
    });

    await service.cargaMasiva(
      buildBuffer([{ ...baseRow, MARCA: 'forte' }]),
      empresaId,
      sedeId,
    );

    expect(prisma.marca.create).not.toHaveBeenCalled();
    expect(prisma.producto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ marcaId: 7 }),
      }),
    );
  });

  it('actualiza la marca al re-subir el Excel con una marca distinta', async () => {
    // La empresa ya tiene "Forte" (id 7); el nuevo Excel trae "Trebol".
    prisma.marca.findMany.mockResolvedValue([{ id: 7, nombre: 'Forte' }]);
    prisma.marca.create.mockResolvedValue({ id: 8 });
    prisma.producto.findFirst.mockResolvedValue({
      id: 99,
      codigo: 'PR001',
      codigoBarras: null,
      opcionesAtributos: null,
    });

    await service.cargaMasiva(
      buildBuffer([{ ...baseRow, MARCA: 'Trebol' }]),
      empresaId,
      sedeId,
    );

    expect(prisma.marca.create).toHaveBeenCalledWith({
      data: { nombre: 'Trebol', empresaId },
    });
    expect(prisma.producto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ marcaId: 8 }),
      }),
    );
  });

  it('sin columna MARCA no crea marca ni escribe marcaId', async () => {
    const { MARCA, ...rowSinMarca } = baseRow;
    prisma.producto.findFirst.mockResolvedValue({
      id: 99,
      codigo: 'PR001',
      codigoBarras: null,
      opcionesAtributos: null,
    });

    await service.cargaMasiva(buildBuffer([rowSinMarca]), empresaId, sedeId);

    expect(prisma.marca.create).not.toHaveBeenCalled();
    const updateArg = prisma.producto.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty('marcaId');
  });
});
