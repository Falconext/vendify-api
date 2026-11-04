-- Agenda (Mi negocio → Agenda): reuniones, tareas, pagos y recordatorios.
--
-- Las repeticiones no se materializan: se guarda el evento base y se expanden al
-- consultar. Por ocurrencia solo se guarda si se completó y si ya se avisó; el
-- unique (eventoId, ocurrencia) hace idempotente el cron de recordatorios aunque
-- corran varias instancias.
--
-- Es una característica del plan (`tieneAgenda`). El backfill la enciende SOLO
-- para los planes Corporativos; el resto la tiene apagada y se puede cambiar
-- desde Sistema → Planes sin tocar código.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AgendaTipo" AS ENUM ('REUNION', 'TAREA', 'PAGO', 'RECORDATORIO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AgendaPrioridad" AS ENUM ('BAJA', 'MEDIA', 'ALTA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AgendaVisibilidad" AS ENUM ('PERSONAL', 'EQUIPO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AgendaRepeticion" AS ENUM ('NINGUNA', 'DIARIA', 'SEMANAL', 'MENSUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgendaEvento" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "creadorId" INTEGER NOT NULL,
    "responsableId" INTEGER,
    "titulo" VARCHAR(120) NOT NULL,
    "descripcion" TEXT,
    "lugar" VARCHAR(300),
    "tipo" "AgendaTipo" NOT NULL,
    "prioridad" "AgendaPrioridad" NOT NULL DEFAULT 'MEDIA',
    "visibilidad" "AgendaVisibilidad" NOT NULL DEFAULT 'PERSONAL',
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3),
    "todoElDia" BOOLEAN NOT NULL DEFAULT false,
    "repeticion" "AgendaRepeticion" NOT NULL DEFAULT 'NINGUNA',
    "repetirHasta" TIMESTAMP(3),
    "recordatorioMin" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgendaOcurrenciaCompletada" (
    "id" SERIAL NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "ocurrencia" TIMESTAMP(3) NOT NULL,
    "completadoPorId" INTEGER,
    "completadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaOcurrenciaCompletada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgendaRecordatorioEnviado" (
    "id" SERIAL NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "ocurrencia" TIMESTAMP(3) NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "enviadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaRecordatorioEnviado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgendaEvento_empresaId_inicio_idx" ON "AgendaEvento"("empresaId", "inicio");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgendaEvento_empresaId_repeticion_idx" ON "AgendaEvento"("empresaId", "repeticion");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AgendaEvento_recordatorioMin_inicio_idx" ON "AgendaEvento"("recordatorioMin", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AgendaOcurrenciaCompletada_eventoId_ocurrencia_key" ON "AgendaOcurrenciaCompletada"("eventoId", "ocurrencia");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AgendaRecordatorioEnviado_eventoId_ocurrencia_key" ON "AgendaRecordatorioEnviado"("eventoId", "ocurrencia");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AgendaEvento" ADD CONSTRAINT "AgendaEvento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AgendaEvento" ADD CONSTRAINT "AgendaEvento_creadorId_fkey" FOREIGN KEY ("creadorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AgendaEvento" ADD CONSTRAINT "AgendaEvento_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AgendaOcurrenciaCompletada" ADD CONSTRAINT "AgendaOcurrenciaCompletada_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "AgendaEvento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AgendaRecordatorioEnviado" ADD CONSTRAINT "AgendaRecordatorioEnviado_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "AgendaEvento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- Backfill de la característica del plan
INSERT INTO "PlanFeature" ("planId", "featureKey", "enabled", "createdAt", "updatedAt")
SELECT p.id, 'tieneAgenda', UPPER(p.nombre) LIKE '%CORPORAT%', NOW(), NOW()
FROM "Plan" p
ON CONFLICT ("planId", "featureKey") DO NOTHING;
