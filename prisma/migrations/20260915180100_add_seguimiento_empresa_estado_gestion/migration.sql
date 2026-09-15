-- Postventa / retención: estado de gestión de la cuenta + bitácora de seguimientos
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "estadoGestion" TEXT;

CREATE TABLE IF NOT EXISTS "SeguimientoEmpresa" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nota" TEXT NOT NULL,
    "canal" TEXT,
    "estadoGestion" TEXT,
    "autorNombre" TEXT NOT NULL,
    "autorEmail" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeguimientoEmpresa_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeguimientoEmpresa_empresaId_creadoEn_idx" ON "SeguimientoEmpresa"("empresaId", "creadoEn");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SeguimientoEmpresa_empresaId_fkey'
  ) THEN
    ALTER TABLE "SeguimientoEmpresa"
      ADD CONSTRAINT "SeguimientoEmpresa_empresaId_fkey"
      FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
