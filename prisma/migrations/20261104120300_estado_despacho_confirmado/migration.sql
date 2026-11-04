-- Estado interno de despacho: rótulo impreso, se está alistando.
ALTER TYPE "EstadoDespacho" ADD VALUE IF NOT EXISTS 'CONFIRMADO' BEFORE 'EN_CAMINO';
