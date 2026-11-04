-- Subcategorías: una categoría puede colgar de otra (un nivel). Las que ya
-- existen quedan como principales (padreId NULL).
ALTER TABLE "Categoria" ADD COLUMN IF NOT EXISTS "padreId" INTEGER;

CREATE INDEX IF NOT EXISTS "Categoria_padreId_idx" ON "Categoria"("padreId");

DO $$ BEGIN
  ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_padreId_fkey" FOREIGN KEY ("padreId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
