-- Órdenes de compra con entregas parciales: el proveedor factura una vez y
-- despacha por partes.
ALTER TYPE "EstadoOrdenCompra" ADD VALUE IF NOT EXISTS 'PARCIAL' BEFORE 'RECIBIDA';

ALTER TABLE "DetalleOrdenCompra" ADD COLUMN IF NOT EXISTS "cantidadRecibida" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "DetalleCompra" ADD COLUMN IF NOT EXISTS "cantidadRecibida" DECIMAL(65,30);

-- Las órdenes ya recibidas llegaron completas.
UPDATE "DetalleOrdenCompra" d SET "cantidadRecibida" = d."cantidad"
FROM "OrdenCompra" o WHERE o.id = d."ordenCompraId" AND o.estado = 'RECIBIDA';
