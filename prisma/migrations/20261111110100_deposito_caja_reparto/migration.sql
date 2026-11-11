-- AlterTable
ALTER TABLE "MovimientoCaja" ADD COLUMN IF NOT EXISTS "depositoLote" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DepositoCajaReparto" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "lote" TEXT NOT NULL,
    "cuentaBancariaId" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "numeroOperacion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositoCajaReparto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MovimientoCaja_depositoLote_idx" ON "MovimientoCaja"("depositoLote");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DepositoCajaReparto_empresaId_lote_idx" ON "DepositoCajaReparto"("empresaId", "lote");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DepositoCajaReparto_cuentaBancariaId_fecha_idx" ON "DepositoCajaReparto"("cuentaBancariaId", "fecha");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DepositoCajaReparto" ADD CONSTRAINT "DepositoCajaReparto_cuentaBancariaId_fkey" FOREIGN KEY ("cuentaBancariaId") REFERENCES "CuentaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
