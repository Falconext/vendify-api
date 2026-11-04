-- Por sede: el usuario puede entrar pero no vender ahí. Default true = como hoy.
ALTER TABLE "UsuarioSede" ADD COLUMN IF NOT EXISTS "puedeVender" BOOLEAN NOT NULL DEFAULT true;

-- Usuario que solo gestiona fotos de productos. Default false = como hoy.
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "soloImagenesProductos" BOOLEAN NOT NULL DEFAULT false;
