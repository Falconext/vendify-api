-- Enlace para que el cliente llene sus datos de envío.
ALTER TABLE "EnvioDespacho" ADD COLUMN IF NOT EXISTS "datosClienteEn" TIMESTAMP(3);
ALTER TABLE "EnvioDespacho" ADD COLUMN IF NOT EXISTS "datosClienteToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "EnvioDespacho_datosClienteToken_key" ON "EnvioDespacho"("datosClienteToken");
