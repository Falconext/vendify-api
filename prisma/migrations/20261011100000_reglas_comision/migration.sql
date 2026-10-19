-- CreateTable
CREATE TABLE "ReglaComision" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "productoId" INTEGER,
    "vendedorId" INTEGER,
    "diasSemana" TEXT,
    "montoFijo" DECIMAL(65,30),
    "porcentaje" DECIMAL(65,30),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglaComision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReglaComision_empresaId_activa_idx" ON "ReglaComision"("empresaId", "activa");

-- CreateIndex
CREATE INDEX "ReglaComision_productoId_idx" ON "ReglaComision"("productoId");

-- CreateIndex
CREATE INDEX "ReglaComision_vendedorId_idx" ON "ReglaComision"("vendedorId");

-- AddForeignKey
ALTER TABLE "ReglaComision" ADD CONSTRAINT "ReglaComision_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaComision" ADD CONSTRAINT "ReglaComision_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaComision" ADD CONSTRAINT "ReglaComision_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
