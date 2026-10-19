-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "shalomAutoTrackingActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shalomInstanceId" TEXT,
ADD COLUMN     "shalomInstanceNombre" TEXT,
ADD COLUMN     "shalomInstanceEstado" TEXT,
ADD COLUMN     "shalomInstanceError" TEXT,
ADD COLUMN     "shalomInstanceSyncAt" TIMESTAMP(3),
ADD COLUMN     "shalomSecurityCode" TEXT,
ADD COLUMN     "shalomAgenciaOrigenId" TEXT,
ADD COLUMN     "shalomAgenciaOrigenNombre" TEXT,
ADD COLUMN     "shalomAutoGuiaActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shalomClavesRetiro" TEXT,
ADD COLUMN     "shalomTamanoDefault" TEXT;

-- AlterTable
ALTER TABLE "EnvioDespacho" ADD COLUMN     "shalomTamano" TEXT,
ADD COLUMN     "shalomFleteCotizado" DOUBLE PRECISION;
