-- Avisos de despacho: textos opcionales para provincia (agencia), distintos del
-- delivery local de Lima. Null = sale el texto general.
ALTER TABLE "DespachoMensajeTemplate" ADD COLUMN IF NOT EXISTS "mensajeEnCaminoAgencia" TEXT;
ALTER TABLE "DespachoMensajeTemplate" ADD COLUMN IF NOT EXISTS "mensajeEntregadoAgencia" TEXT;
