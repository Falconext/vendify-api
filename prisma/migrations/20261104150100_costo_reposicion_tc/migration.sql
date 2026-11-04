-- Dólar y márgenes (Compras, 03-11): umbral de aviso, margen objetivo y colchón de TC por empresa.
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "tcAlertaUmbralPct" DECIMAL(5,2) NOT NULL DEFAULT 3;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "margenObjetivoPct" DECIMAL(5,2) NOT NULL DEFAULT 30;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "tcColchon" DECIMAL(6,3) NOT NULL DEFAULT 0;
