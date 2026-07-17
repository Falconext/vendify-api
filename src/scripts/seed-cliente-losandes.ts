import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ResellerService } from '../reseller/reseller.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Crea 1 cliente (empresa) para el reseller losandes@vendify.pe usando el
 * servicio real (crea empresa + clientes + productos base + sede + usuario
 * ADMIN_EMPRESA + series). Topea el saldo del reseller para pasar el cobro.
 *
 * Uso:  npx ts-node src/scripts/seed-cliente-losandes.ts
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const resellerService = app.get(ResellerService);

  const user = await prisma.usuario.findUnique({
    where: { email: 'losandes@vendify.pe' },
    select: { resellerId: true },
  });
  if (!user?.resellerId) throw new Error('Reseller losandes no encontrado.');
  const resellerId = user.resellerId;

  const yaExiste = await prisma.empresa.findFirst({
    where: { ruc: '20999888771' },
    select: { id: true },
  });
  if (yaExiste) {
    console.log('↷ El cliente (RUC 20999888771) ya existe. No se duplica.');
    await app.close();
    return;
  }

  // Asegurar unidades de medida SUNAT (la empresa las necesita para sus productos).
  await prisma.unidadMedida.createMany({
    data: [
      { codigo: 'NIU', nombre: 'Unidad (bienes)' },
      { codigo: 'ZZ', nombre: 'Servicio' },
      { codigo: 'KGM', nombre: 'Kilogramo' },
      { codigo: 'MTR', nombre: 'Metro' },
      { codigo: 'LTR', nombre: 'Litro' },
    ],
    skipDuplicates: true,
  });

  const plan = await prisma.plan.findFirst();
  const rubro = await prisma.rubro.findFirst();

  // Saldo suficiente para el cobro de activación.
  await prisma.reseller.update({
    where: { id: resellerId },
    data: { saldo: 500 },
  });

  const empresa = await resellerService.createClient(resellerId, {
    rut: '20999888771',
    razonSocial: 'BODEGA DON JOSE E.I.R.L.',
    nombreComercial: 'Bodega Don José',
    direccion: 'Av. Los Andes 123, Cusco',
    departamento: 'CUSCO',
    provincia: 'CUSCO',
    distrito: 'CUSCO',
    rubroId: rubro?.id ?? undefined,
    email: 'bodegadonjose@cliente.pe',
    password: '123456',
    representa: 'José Ramírez',
    celular: '987111222',
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

  console.log('\n✅ Cliente creado para "Los Andes Sistemas":');
  console.log(`   Empresa: ${empresa.razonSocial} (RUC ${empresa.ruc})`);
  console.log('   Login del cliente → bodegadonjose@cliente.pe / 123456 (ADMIN_EMPRESA)');
  await app.close();
}

main().catch((e) => {
  console.error('❌ Error:', e?.message || e);
  process.exit(1);
});
