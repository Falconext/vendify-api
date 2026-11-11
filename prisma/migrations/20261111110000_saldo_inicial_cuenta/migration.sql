-- Lo que había en la cuenta al empezar a usarla en el sistema, y desde cuándo contar.
ALTER TABLE "CuentaBancaria" ADD COLUMN IF NOT EXISTS "saldoInicial" DECIMAL(12,2);
ALTER TABLE "CuentaBancaria" ADD COLUMN IF NOT EXISTS "saldoInicialFecha" TIMESTAMP(3);
