import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class CategoriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * La madre de una subcategoría: de la misma empresa y principal (un solo
   * nivel, "Peluches > Osos"). Una categoría que ya tiene hijas no puede
   * volverse hija de otra.
   */
  private async validarPadre(
    empresaId: number,
    padreId: number | null | undefined,
    categoriaId?: number,
  ): Promise<number | null | undefined> {
    if (padreId === undefined) return undefined;
    if (padreId === null || Number(padreId) === 0) return null;
    if (categoriaId && Number(padreId) === categoriaId)
      throw new BadRequestException(
        'Una categoría no puede ser subcategoría de sí misma',
      );
    const padre = await this.prisma.categoria.findFirst({
      where: { id: Number(padreId), empresaId },
      select: { id: true, padreId: true },
    });
    if (!padre)
      throw new BadRequestException(
        'La categoría madre no existe en tu empresa',
      );
    if (padre.padreId)
      throw new BadRequestException(
        'Solo hay un nivel: elige una categoría principal como madre',
      );
    if (categoriaId) {
      const hijas = await this.prisma.categoria.count({
        where: { padreId: categoriaId },
      });
      if (hijas)
        throw new BadRequestException(
          'Esta categoría tiene subcategorías: no puede ser subcategoría de otra',
        );
    }
    return padre.id;
  }

  async crear(dto: CreateCategoriaDto, empresaId: number) {
    const existe = await this.prisma.categoria.findFirst({
      where: { nombre: dto.nombre, empresaId },
    });
    if (existe)
      throw new ForbiddenException(
        'Ya existe una categoría con ese nombre en tu empresa',
      );
    const padreId = await this.validarPadre(empresaId, dto.padreId);
    return this.prisma.categoria.create({
      data: {
        nombre: dto.nombre,
        imagenUrl: dto.imagenUrl,
        empresaId,
        padreId: padreId ?? null,
      },
    });
  }

  async listar(empresaId: number) {
    const visibles = { in: [EstadoType.ACTIVO, EstadoType.INACTIVO] };
    const categorias = await this.prisma.categoria.findMany({
      where: { empresaId },
      orderBy: { id: 'desc' },
      include: {
        padre: { select: { id: true, nombre: true } },
        _count: {
          select: {
            productos: { where: { estado: visibles } },
            productosExtra: { where: { producto: { estado: visibles } } },
          },
        },
      },
    });
    // El conteo suma los que la tienen como principal y como adicional. Una
    // adicional nunca repite la principal, así que nadie se cuenta dos veces.
    return categorias.map(({ _count, ...categoria }) => ({
      ...categoria,
      _count: { productos: _count.productos + _count.productosExtra },
    }));
  }

  async obtenerPorId(id: number, empresaId: number) {
    const categoria = await this.prisma.categoria.findFirst({
      where: { id, empresaId },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    return categoria;
  }

  async actualizar(id: number, dto: CreateCategoriaDto, empresaId: number) {
    const categoria = await this.prisma.categoria.findFirst({
      where: { id, empresaId },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    const padreId = await this.validarPadre(empresaId, dto.padreId, id);
    return this.prisma.categoria.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        imagenUrl: dto.imagenUrl,
        ...(padreId !== undefined ? { padreId } : {}),
      },
    });
  }

  async eliminar(id: number, empresaId: number) {
    const categoria = await this.prisma.categoria.findFirst({
      where: { id, empresaId },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    return this.prisma.categoria.delete({ where: { id } });
  }

  async subirImagenPrincipal(
    empresaId: number,
    categoriaId: number,
    file: { buffer: Buffer; mimetype?: string },
  ) {
    const categoria = await this.prisma.categoria.findFirst({
      where: { id: categoriaId, empresaId },
    });
    if (!categoria) throw new NotFoundException('Categoría no encontrada');
    if (!file || !file.buffer)
      throw new ForbiddenException('Archivo no proporcionado');
    const ct = file.mimetype || 'image/jpeg';
    if (!/^image\//i.test(ct))
      throw new ForbiddenException('El archivo debe ser una imagen');

    const ts = Date.now();
    const s3Key = `categorias/empresa-${empresaId}/categoria-${categoriaId}/${ts}.webp`;
    const url = await this.s3.uploadImage(file.buffer, s3Key, ct);

    await this.prisma.categoria.update({
      where: { id: categoriaId },
      data: { imagenUrl: url },
    });

    const idx = url.indexOf('amazonaws.com/');
    const objKey =
      idx !== -1 ? url.substring(idx + 'amazonaws.com/'.length) : '';
    const signedUrl = objKey ? await this.s3.getSignedGetUrl(objKey, 600) : url;
    return { url, signedUrl };
  }
}
