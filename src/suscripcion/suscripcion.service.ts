import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuscripcionService {
  constructor(private readonly prisma: PrismaService) {}

  async verMiSuscripcion(empresaId: number) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        id: true,
        razonSocial: true,
        estado: true,
        fechaActivacion: true,
        fechaExpiracion: true,
        plan: { select: { id: true, nombre: true, descripcion: true } },
      },
    });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    return {
      empresaId: empresa.id,
      razonSocial: empresa.razonSocial,
      estado: empresa.estado,
      fechaActivacion: empresa.fechaActivacion,
      fechaExpiracion: empresa.fechaExpiracion,
      plan: empresa.plan,
    };
  }
}
