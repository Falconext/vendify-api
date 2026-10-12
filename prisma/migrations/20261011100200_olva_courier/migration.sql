-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "olvaAgenciaOrigenCodigo" TEXT,
ADD COLUMN     "olvaAgenciaOrigenNombre" TEXT,
ADD COLUMN     "olvaAgenciaOrigenUbigeo" TEXT,
ADD COLUMN     "olvaAutoTrackingActivo" BOOLEAN NOT NULL DEFAULT false;
