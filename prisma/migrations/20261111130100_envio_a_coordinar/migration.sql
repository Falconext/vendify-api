-- El negocio coordina el envío aparte: la tienda no cobra envío ni lo anuncia gratis.
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "envioACoordinar" BOOLEAN NOT NULL DEFAULT false;
