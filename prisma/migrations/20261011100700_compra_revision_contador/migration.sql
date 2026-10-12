-- CreateEnum
CREATE TYPE "EstadoContador" AS ENUM ('PENDIENTE', 'APROBADA', 'DENEGADA');

-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "estadoContador" "EstadoContador" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "motivoContador" TEXT,
ADD COLUMN     "revisadoContadorEn" TIMESTAMP(3),
ADD COLUMN     "revisadoContadorPor" INTEGER;
