-- Red de seguridad a nivel de BASE DE DATOS: el saldo del reseller NUNCA puede
-- quedar negativo. El código de la app ya lo garantiza (cobro atómico condicional
-- con `updateMany ... where saldo >= costo`), pero este CHECK es defensa en
-- profundidad: si algún día un endpoint nuevo, un query manual o un bug intenta
-- dejar el saldo en rojo, PostgreSQL rechaza la escritura por sí solo.
--
-- Se agrega como NOT VALID a propósito:
--   * NO valida las filas existentes (evita que el deploy falle si quedó algún
--     saldo negativo residual del bug ya corregido, sin "perdonar" esa deuda
--     silenciosamente poniéndola en 0).
--   * SÍ se aplica a todo INSERT/UPDATE futuro: cualquier decremento que dejaría
--     el saldo < 0 es rechazado.
--
-- Cuando hayas reconciliado los saldos negativos residuales (si los hubiera),
-- puedes validarlo también para el histórico con:
--   ALTER TABLE "Reseller" VALIDATE CONSTRAINT "reseller_saldo_no_negativo";
ALTER TABLE "Reseller"
  ADD CONSTRAINT "reseller_saldo_no_negativo" CHECK ("saldo" >= 0) NOT VALID;
