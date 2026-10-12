-- CreateEnum
CREATE TYPE "TipoEvidenciaEntrega" AS ENUM ('FOTO_PAQUETE', 'FOTO_RECEPTOR', 'FIRMA', 'DOCUMENTO');

-- AlterTable
ALTER TABLE "EnvioDespacho" ADD COLUMN     "costoCourier" DOUBLE PRECISION,
ADD COLUMN     "entregadoEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EvidenciaEntrega" (
    "id" SERIAL NOT NULL,
    "despachoId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "tipo" "TipoEvidenciaEntrega" NOT NULL DEFAULT 'FOTO_PAQUETE',
    "nota" TEXT,
    "usuarioId" INTEGER,
    "usuarioNombre" TEXT,
    "repartidorId" INTEGER,
    "tomadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPor" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenciaEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenciaEntrega_despachoId_idx" ON "EvidenciaEntrega"("despachoId");

-- CreateIndex
CREATE INDEX "EvidenciaEntrega_empresaId_anuladaEn_idx" ON "EvidenciaEntrega"("empresaId", "anuladaEn");

-- AddForeignKey
ALTER TABLE "EvidenciaEntrega" ADD CONSTRAINT "EvidenciaEntrega_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "EnvioDespacho"("id") ON DELETE CASCADE ON UPDATE CASCADE;
