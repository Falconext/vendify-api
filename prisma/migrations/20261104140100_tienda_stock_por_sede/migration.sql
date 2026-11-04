-- Stock de la tienda virtual por sede.
-- La tienda dejaba de saber de sedes: mostraba y validaba la SUMA de todas.
-- Ahora el negocio elige de qué stock vende (ver src/tienda/stock-tienda.ts).
DO $$ BEGIN
  CREATE TYPE "ModoStockTienda" AS ENUM ('SEDE', 'CLIENTE', 'TODAS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Si "tiendaStockModo" ya existía no se vuelve a clasificar a nadie: rehacer
-- la migración no debe pisar lo que el dueño eligió.
DO $$
DECLARE
  nueva boolean := NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Empresa' AND column_name = 'tiendaStockModo'
  );
BEGIN
  ALTER TABLE "Empresa"
    ADD COLUMN IF NOT EXISTS "tiendaStockModo" "ModoStockTienda" NOT NULL DEFAULT 'SEDE',
    ADD COLUMN IF NOT EXISTS "tiendaSedeId" INTEGER,
    ADD COLUMN IF NOT EXISTS "tiendaSedesIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    ADD COLUMN IF NOT EXISTS "tiendaStockModoElegidoEn" TIMESTAMP(3);

  -- No romper lo que ven hoy: las empresas con más de una sede activa siguen
  -- vendiendo la suma de sus sedes (TODAS). Con una sola sede, SEDE es lo mismo
  -- que antes. `tiendaStockModoElegidoEn` queda en NULL: el panel invita a las
  -- de varias sedes a elegir.
  IF nueva THEN
    UPDATE "Empresa" e
    SET "tiendaStockModo" = 'TODAS'
    WHERE (
      SELECT COUNT(*) FROM "Sede" s WHERE s."empresaId" = e."id" AND s."activo" = true
    ) > 1;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "Empresa"
    ADD CONSTRAINT "Empresa_tiendaSedeId_fkey" FOREIGN KEY ("tiendaSedeId")
    REFERENCES "Sede"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
