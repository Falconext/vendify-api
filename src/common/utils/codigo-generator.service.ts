import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CodigoGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generarCodigoProducto(empresaId: number): Promise<string> {
    const ultimo = await this.prisma.producto.findFirst({
      where: { empresaId, codigo: { startsWith: 'PR' } },
      orderBy: { id: 'desc' },
      select: { codigo: true },
    });

    let siguienteNumero = 1;

    if (ultimo?.codigo) {
      const match = ultimo.codigo.match(/^PR(\d+)$/);
      if (match) {
        const ultimoNumero = parseInt(match[1], 10);
        siguienteNumero = ultimoNumero + 1;
      }
    }

    const nuevoCodigo = `PR${siguienteNumero.toString().padStart(3, '0')}`;
    return nuevoCodigo;
  }
}
