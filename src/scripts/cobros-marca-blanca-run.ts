/**
 * Corre el cobro de cuotas de marca blanca vencidas AHORA (lo mismo que hace el
 * cron diario de las 09:20 y el endpoint POST /resellers/white-label/cobros/run),
 * pero desde la terminal con la BD del entorno (DATABASE_URL).
 *
 * Uso:
 *   pnpm run cobros:marca-blanca
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ResellerService } from '../reseller/reseller.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(ResellerService);
    const r = await service.procesarCobrosMarcaBlanca();
    console.log(
      `✅ Marca blanca: evaluados ${r.totalEvaluados}, cobrados ${r.cobrados} (S/${r.montoCobrado}), pendientes ${r.pendientes}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
