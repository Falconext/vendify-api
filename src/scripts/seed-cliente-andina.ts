import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ResellerService } from '../reseller/reseller.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Crea 1 cliente (empresa) para el reseller SIN white-label andina@vendify.pe.
 * Sus clientes entran por app.vendify.pe (localhost en dev) con marca Vendify.
 *
 * Uso:  node -r ts-node/register -r tsconfig-paths/register src/scripts/seed-cliente-andina.ts
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const resellerService = app.get(ResellerService);

  const user = await prisma.usuario.findUnique({
    where: { email: 'andina@vendify.pe' },
    select: { resellerId: true },
  });
  if (!user?.resellerId) throw new Error('Reseller Andina no encontrado.');
  const resellerId = user.resellerId;

  const yaExiste = await prisma.empresa.findFirst({
    where: { ruc: '20888777661' },
    select: { id: true },
  });
  if (yaExiste) {
    console.log('↷ El cliente (RUC 20888777661) ya existe. No se duplica.');
    await app.close();
    return;
  }

  const plan = await prisma.plan.findFirst();
  const rubro = await prisma.rubro.findFirst();

  await prisma.reseller.update({
    where: { id: resellerId },
    data: { saldo: 500 },
  });

  const empresa = await resellerService.createClient(resellerId, {
    rut: '20888777661',
    razonSocial: 'MINIMARKET SOL S.A.C.',
    nombreComercial: 'Minimarket Sol',
    direccion: 'Jr. Comercio 456, Lima',
    departamento: 'LIMA',
    provincia: 'LIMA',
    distrito: 'LIMA',
    rubroId: rubro?.id ?? undefined,
    email: 'minimarketsol@cliente.pe',
    password: '123456',
    representa: 'Ana Torres',
    celular: '955222333',
    planId: plan?.id,
    billingProvider: 'QPSE',
    usuarioPse: 'demo-qpse',
    contrasenaPse: 'demo-qpse',
    usaDemo: true,
    series: [
      { tipoDoc: '01', serie: 'F001', correlativo: 1 },
      { tipoDoc: '03', serie: 'B001', correlativo: 1 },
    ],
  });

  console.log('\n✅ Cliente creado para "Distribuidora Andina" (sin white-label):');
  console.log(`   Empresa: ${empresa.razonSocial} (RUC ${empresa.ruc})`);
  console.log('   Login del cliente → minimarketsol@cliente.pe / 123456 (ADMIN_EMPRESA)');
  console.log('   Entra por: http://localhost:5184/login  → verá marca Vendify');
  await app.close();
}

main().catch((e) => {
  console.error('❌ Error:', e?.message || e);
  process.exit(1);
});
