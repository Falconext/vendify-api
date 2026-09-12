-- Cuota mensual de marca blanca del reseller: inicio del ciclo y próximo cobro.
ALTER TABLE "Reseller" ADD COLUMN IF NOT EXISTS "whiteLabelDesde" TIMESTAMP(3);
ALTER TABLE "Reseller" ADD COLUMN IF NOT EXISTS "whiteLabelProximoCobro" TIMESTAMP(3);
