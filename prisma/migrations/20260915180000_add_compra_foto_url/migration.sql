-- Foto de la factura/boleta de compra (evidencia, URL en S3)
ALTER TABLE "Compra" ADD COLUMN IF NOT EXISTS "fotoUrl" TEXT;
