-- Órganos y sistemas sobre los que actúa el producto (la tienda busca y filtra por ellos).
ALTER TABLE "Producto" ADD COLUMN IF NOT EXISTS "organos" TEXT;
ALTER TABLE "Producto" ADD COLUMN IF NOT EXISTS "sistemas" TEXT;
