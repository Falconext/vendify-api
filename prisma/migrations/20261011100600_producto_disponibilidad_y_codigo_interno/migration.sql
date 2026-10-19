-- CreateEnum
CREATE TYPE "DisponibilidadProducto" AS ENUM ('INMEDIATA', 'BAJO_PEDIDO', 'NO_DISPONIBLE', 'NO_COMERCIAL');

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "disponibilidad" "DisponibilidadProducto",
ADD COLUMN     "prioridadVenta" INTEGER;

-- AlterTable: código interno del negocio por presentación (caja/paquete)
ALTER TABLE "producto_codigos_barras" ADD COLUMN     "codigoInterno" TEXT;
