-- Port de features aditivas desde falconext-mype (repo pos-bd) hacia vendify-api.
-- Todas las sentencias son idempotentes: las columnas/tablas pueden existir ya vía db push.

-- Empresa: régimen tributario SUNAT (GENERAL | RER | MYPE | RUS)
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "regimenTributario" TEXT NOT NULL DEFAULT 'GENERAL';

-- Comprobante: tipo de cambio del día (cuando tipoMoneda = USD)
ALTER TABLE "Comprobante" ADD COLUMN IF NOT EXISTS "tipoCambio" DOUBLE PRECISION DEFAULT 1;

-- DetalleComprobante: descuento por línea (solo display, no afecta XML SUNAT)
ALTER TABLE "DetalleComprobante" ADD COLUMN IF NOT EXISTS "mtoDescuento" DOUBLE PRECISION DEFAULT 0;

-- Sede: habilita facturación en sedes tipo ALMACEN (opt-in por sede)
ALTER TABLE "Sede" ADD COLUMN IF NOT EXISTS "permiteFacturacion" BOOLEAN NOT NULL DEFAULT false;

-- Vehiculo: kilometraje y nivel de combustible
ALTER TABLE "Vehiculo" ADD COLUMN IF NOT EXISTS "kilometraje" INTEGER;
ALTER TABLE "Vehiculo" ADD COLUMN IF NOT EXISTS "nivelCombustible" TEXT;

-- ContratoVehiculoItem: unidades de un contrato multi-vehículo
CREATE TABLE IF NOT EXISTS "ContratoVehiculoItem" (
    "id" SERIAL NOT NULL,
    "contratoId" INTEGER NOT NULL,
    "vehiculoId" INTEGER NOT NULL,
    "montoAnual" DECIMAL(12,2),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoVehiculoItem_pkey" PRIMARY KEY ("id")
);

-- Índices de ContratoVehiculoItem
CREATE UNIQUE INDEX IF NOT EXISTS "ContratoVehiculoItem_contratoId_vehiculoId_key" ON "ContratoVehiculoItem"("contratoId", "vehiculoId");
CREATE INDEX IF NOT EXISTS "ContratoVehiculoItem_contratoId_idx" ON "ContratoVehiculoItem"("contratoId");
CREATE INDEX IF NOT EXISTS "ContratoVehiculoItem_vehiculoId_idx" ON "ContratoVehiculoItem"("vehiculoId");

-- FKs de ContratoVehiculoItem (guard con bloque DO para idempotencia)
DO $$ BEGIN
  ALTER TABLE "ContratoVehiculoItem" ADD CONSTRAINT "ContratoVehiculoItem_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "ContratoVehicular"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContratoVehiculoItem" ADD CONSTRAINT "ContratoVehiculoItem_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índices aditivos de rendimiento (nuevos en mype)
CREATE INDEX IF NOT EXISTS "Cliente_empresaId_nroDoc_idx" ON "Cliente"("empresaId", "nroDoc");
CREATE INDEX IF NOT EXISTS "Comprobante_empresaId_fechaEmision_idx" ON "Comprobante"("empresaId", "fechaEmision");
CREATE INDEX IF NOT EXISTS "Comprobante_empresaId_sedeId_fechaEmision_idx" ON "Comprobante"("empresaId", "sedeId", "fechaEmision");
CREATE INDEX IF NOT EXISTS "Comprobante_empresaId_usuarioId_fechaEmision_idx" ON "Comprobante"("empresaId", "usuarioId", "fechaEmision");
CREATE INDEX IF NOT EXISTS "Comprobante_empresaId_estadoPago_idx" ON "Comprobante"("empresaId", "estadoPago");
CREATE INDEX IF NOT EXISTS "DetalleComprobante_comprobanteId_idx" ON "DetalleComprobante"("comprobanteId");
CREATE INDEX IF NOT EXISTS "DetalleComprobante_productoId_idx" ON "DetalleComprobante"("productoId");
CREATE INDEX IF NOT EXISTS "RefreshToken_usuarioId_idx" ON "RefreshToken"("usuarioId");
