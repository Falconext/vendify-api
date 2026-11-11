-- Producción deja de depender del rubro: se activa con este módulo en el plan.
-- Solo se crea el módulo; no se asigna a ningún plan. Si ya existe, no se toca.
INSERT INTO "Modulo" ("codigo", "producto", "nombre", "descripcion", "icono", "activo", "orden")
SELECT
  'produccion',
  'facturacion',
  'Producción',
  'Recetas de insumos y órdenes de producción, para cualquier rubro',
  'solar:box-minimalistic-bold-duotone',
  true,
  12
WHERE NOT EXISTS (
  SELECT 1 FROM "Modulo" WHERE "codigo" = 'produccion' AND "producto" = 'facturacion'
);
