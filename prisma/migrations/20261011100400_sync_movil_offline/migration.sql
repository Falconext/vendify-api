-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "offlineHabilitado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: uuid de la operación offline que originó el registro (null = online)
ALTER TABLE "Comprobante" ADD COLUMN     "origenSyncUuid" TEXT;

-- AlterTable
ALTER TABLE "MovimientoKardex" ADD COLUMN     "origenSyncUuid" TEXT;

-- AlterTable
ALTER TABLE "MovimientoCaja" ADD COLUMN     "origenSyncUuid" TEXT;

-- CreateTable
CREATE TABLE "DispositivoMovil" (
    "id" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "nombre" TEXT,
    "plataforma" TEXT,
    "appVersion" TEXT,
    "ultimoSyncEn" TIMESTAMP(3),
    "ultimoCatalogoVersion" TEXT,
    "pendientesReportados" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispositivoMovil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperacionSync" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "sedeId" INTEGER,
    "dispositivoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "realizadoEn" TIMESTAMP(3) NOT NULL,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL,
    "resultado" JSONB,
    "error" TEXT,
    "payloadHash" TEXT NOT NULL,

    CONSTRAINT "OperacionSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DispositivoMovil_empresaId_ultimoSyncEn_idx" ON "DispositivoMovil"("empresaId", "ultimoSyncEn");

-- CreateIndex
CREATE UNIQUE INDEX "OperacionSync_uuid_key" ON "OperacionSync"("uuid");

-- CreateIndex
CREATE INDEX "OperacionSync_empresaId_dispositivoId_recibidoEn_idx" ON "OperacionSync"("empresaId", "dispositivoId", "recibidoEn");

-- CreateIndex
CREATE INDEX "OperacionSync_empresaId_estado_idx" ON "OperacionSync"("empresaId", "estado");

-- AddForeignKey
ALTER TABLE "DispositivoMovil" ADD CONSTRAINT "DispositivoMovil_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionSync" ADD CONSTRAINT "OperacionSync_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
