-- Guía de remisión: documentos relacionados (Catálogo 61), vehículos y
-- conductores secundarios, fecha de entrega al transportista, autorización
-- especial del vehículo y código de producto SUNAT por ítem.
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "documentosRelacionados" JSONB;
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "fechaEntregaBienes" TIMESTAMP(3);
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "vehiculoNroAutorizacion" TEXT;
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "vehiculoEntidadEmisora" TEXT;
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "vehiculosSecundarios" JSONB;
ALTER TABLE "GuiaRemision" ADD COLUMN IF NOT EXISTS "conductoresSecundarios" JSONB;
ALTER TABLE "DetalleGuiaRemision" ADD COLUMN IF NOT EXISTS "codigoProductoSunat" TEXT;
