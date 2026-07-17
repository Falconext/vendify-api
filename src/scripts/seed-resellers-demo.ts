import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Siembra 2 resellers de ejemplo para probar el flujo:
 *   1) SIN white-label  → usa la marca Vendify por defecto.
 *   2) CON white-label  → subdominio propio + logo/colores/nombre propios.
 * Idempotente: no duplica si ya existen (por email/código/dominio).
 *
 * Uso:  npx ts-node src/scripts/seed-resellers-demo.ts
 */

const prisma = new PrismaClient();

async function crearReseller(opts: {
  nombre: string;
  email: string;
  codigo: string;
  telefono?: string;
  representante?: string;
  dominioPersonalizado?: string;
  whiteLabel?: {
    nombre: string;
    colorPrimario: string;
    colorSecundario: string;
    logoUrl?: string;
    website?: string;
    email?: string;
    telefono?: string;
    whatsapp?: string;
  };
}) {
  const existente = await prisma.reseller.findFirst({
    where: {
      OR: [
        { email: opts.email },
        { codigo: opts.codigo },
        ...(opts.dominioPersonalizado
          ? [{ dominioPersonalizado: opts.dominioPersonalizado }]
          : []),
      ],
    },
    select: { id: true, nombre: true },
  });
  if (existente) {
    console.log(`↷ Ya existe "${existente.nombre}" (${opts.codigo}). Se omite.`);
    return existente.id;
  }

  const userExiste = await prisma.usuario.findUnique({
    where: { email: opts.email },
    select: { id: true },
  });
  if (userExiste) {
    console.log(
      `⚠️  El email ${opts.email} ya está en uso por un usuario. Se omite.`,
    );
    return null;
  }

  const wl = opts.whiteLabel;
  const reseller = await prisma.reseller.create({
    data: {
      nombre: opts.nombre,
      email: opts.email,
      codigo: opts.codigo,
      telefono: opts.telefono,
      representante: opts.representante,
      dominioPersonalizado: opts.dominioPersonalizado ?? null,
      whiteLabelNombre: wl?.nombre ?? null,
      whiteLabelLogoUrl: wl?.logoUrl ?? null,
      whiteLabelColorPrimario: wl?.colorPrimario ?? null,
      whiteLabelColorSecundario: wl?.colorSecundario ?? null,
      whiteLabelWebsite: wl?.website ?? null,
      whiteLabelEmail: wl?.email ?? null,
      whiteLabelTelefono: wl?.telefono ?? null,
      whiteLabelWhatsapp: wl?.whatsapp ?? null,
    },
  });

  const hashedPassword = await bcrypt.hash('123456', 10);
  await prisma.usuario.create({
    data: {
      nombre: opts.nombre,
      email: opts.email,
      password: hashedPassword,
      rol: 'RESELLER',
      estado: 'ACTIVO',
      dni: opts.codigo || '00000000',
      celular: opts.telefono || '-',
      resellerId: reseller.id,
    },
  });

  console.log(
    `✅ Reseller creado: ${opts.nombre} (${opts.codigo})` +
      (opts.dominioPersonalizado
        ? ` · white-label en ${opts.dominioPersonalizado}`
        : ' · sin white-label (marca Vendify)'),
  );
  return reseller.id;
}

async function main() {
  console.log('🌱 Sembrando resellers de ejemplo…\n');

  // 1) Reseller SIN white-label → verá la marca Vendify.
  await crearReseller({
    nombre: 'Distribuidora Andina',
    email: 'andina@vendify.pe',
    codigo: 'AND01',
    telefono: '987654321',
    representante: 'Carlos Quispe',
  });

  // 2) Reseller CON white-label → su propio subdominio, logo y colores.
  await crearReseller({
    nombre: 'Los Andes Sistemas',
    email: 'losandes@vendify.pe',
    codigo: 'LAND01',
    telefono: '912345678',
    representante: 'María Huamán',
    dominioPersonalizado: 'losandes.vendify.pe',
    whiteLabel: {
      nombre: 'Los Andes POS',
      colorPrimario: '#0EA5E9',
      colorSecundario: '#0369A1',
      logoUrl: '',
      website: 'https://losandespos.pe',
      email: 'ventas@losandespos.pe',
      telefono: '912345678',
      whatsapp: '51912345678',
    },
  });

  console.log('\n🔑 Login de ambos resellers → contraseña: 123456');
  console.log('   • andina@vendify.pe   (sin white-label)');
  console.log('   • losandes@vendify.pe (white-label: losandes.vendify.pe)');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
