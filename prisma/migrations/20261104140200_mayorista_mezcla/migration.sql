-- Precio por mayor mezclando productos (POS). Aditiva: apagado por defecto.
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "mayoristaMezclaActivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "mayoristaMezclaCategoriaIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
