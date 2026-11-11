/**
 * IRBA NV01-8 (09-11): la nota se editó después de generar el A4, y el A4
 * cacheado seguía con S/ 1526 mientras el ticket (siempre regenerado) ya decía
 * S/ 1534.40. Solo los comprobantes fiscales pueden servir el PDF cacheado.
 */
jest.mock('archiver', () => () => ({
  append: () => undefined,
  finalize: () => undefined,
  pipe: () => undefined,
}));

import { ComprobanteService } from './comprobante.service';

function armar(tipoDoc: string) {
  const svc: any = Object.create(ComprobanteService.prototype);
  svc.prisma = {
    comprobante: {
      findFirst: jest.fn(async () => ({
        s3PdfUrl: 'https://s3/viejo.pdf',
        tipoDoc,
      })),
      update: jest.fn(async () => ({})),
    },
  };
  svc.s3Service = {
    isEnabled: () => true,
    uploadPDF: jest.fn(async () => 'https://s3/nuevo.pdf'),
  };
  svc.buildPdfBufferInformal = jest.fn(async () => ({
    buffer: Buffer.from('x'),
    key: 'k',
  }));
  svc.logger = { warn: jest.fn(), error: jest.fn() };
  return svc;
}

describe('generarYSubirPdf: caché del A4', () => {
  it.each(['NV', 'TICKET', 'NP', 'OT', 'RH', 'CP', 'COT'])(
    '%s se regenera aunque ya tenga s3PdfUrl',
    async (tipoDoc) => {
      const svc = armar(tipoDoc);
      const url = await svc.generarYSubirPdf(8, { empresaId: 90 });
      expect(svc.buildPdfBufferInformal).toHaveBeenCalledWith(8, 'a4');
      expect(url).toBe('https://s3/nuevo.pdf');
      expect(svc.prisma.comprobante.update).toHaveBeenCalledWith({
        where: { id: 8 },
        data: { s3PdfUrl: 'https://s3/nuevo.pdf' },
      });
    },
  );

  it.each(['01', '03', '07', '08'])(
    '%s (fiscal) sirve el PDF cacheado',
    async (tipoDoc) => {
      const svc = armar(tipoDoc);
      expect(await svc.generarYSubirPdf(8, { empresaId: 90 })).toBe(
        'https://s3/viejo.pdf',
      );
      expect(svc.buildPdfBufferInformal).not.toHaveBeenCalled();
    },
  );

  it('un fiscal con force=true se regenera', async () => {
    const svc = armar('03');
    await svc.generarYSubirPdf(8, { empresaId: 90 }, true);
    expect(svc.buildPdfBufferInformal).toHaveBeenCalled();
  });
});
