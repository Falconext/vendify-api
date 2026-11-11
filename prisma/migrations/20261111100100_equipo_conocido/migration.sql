-- CreateTable
CREATE TABLE IF NOT EXISTS "EquipoConocido" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "huella" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipoConocido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EquipoConocido_usuarioId_huella_key" ON "EquipoConocido"("usuarioId", "huella");
