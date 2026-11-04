-- Compra registrada solo por su crédito de IGV (no la pagó la empresa).
ALTER TABLE "Compra" ADD COLUMN IF NOT EXISTS "soloCreditoIgv" BOOLEAN NOT NULL DEFAULT false;
