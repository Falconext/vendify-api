-- AlterTable
ALTER TABLE "DespachoMensajeTemplate" ADD COLUMN IF NOT EXISTS "claveEnAvisos" BOOLEAN NOT NULL DEFAULT true;
