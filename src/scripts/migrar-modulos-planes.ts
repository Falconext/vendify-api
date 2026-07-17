import { PrismaClient } from '@prisma/client';

/**
 * Copia de falconext-mype (sistema_mype) a Vendify resellers (sistema_resellers):
 *  - Todos los módulos + submódulos de producto 'facturacion' (logística queda
 *    fuera porque es producto='logistica').
 *  - Los planes de facturación (EMPRENDEDOR/NEGOCIO/CORPORATIVO) con
 *    plataforma='default', con sus módulos/submódulos/features.
 * Idempotente: no duplica (módulos por codigo+producto, submódulos por codigo,
 * planes por nombre+plataforma+producto).
 *
 * Uso: MYPE_URL="<url sistema_mype>" node -r ts-node/register -r tsconfig-paths/register src/scripts/migrar-modulos-planes.ts
 */
const mype = new PrismaClient({ datasources: { db: { url: process.env.MYPE_URL! } } });
const dst = new PrismaClient(); // sistema_resellers (DATABASE_URL del .env)

async function main() {
  // ── 1. Módulos facturacion ──────────────────────────────────────────────
  const modsMype = await mype.modulo.findMany({
    where: { producto: 'facturacion' },
    include: { subModulos: true },
    orderBy: { orden: 'asc' },
  });

  const moduloIdByCodigo = new Map<string, number>();
  const subModuloIdByCodigo = new Map<string, number>();
  let modsCreados = 0;
  let subsCreados = 0;

  for (const m of modsMype) {
    let destino = await dst.modulo.findFirst({
      where: { codigo: m.codigo, producto: m.producto },
      select: { id: true },
    });
    if (!destino) {
      destino = await dst.modulo.create({
        data: {
          codigo: m.codigo,
          producto: m.producto,
          nombre: m.nombre,
          descripcion: m.descripcion,
          icono: m.icono,
          ruta: m.ruta,
          activo: m.activo,
          orden: m.orden,
        },
        select: { id: true },
      });
      modsCreados++;
    }
    moduloIdByCodigo.set(m.codigo, destino.id);

    for (const s of m.subModulos) {
      const sub = await dst.subModulo.upsert({
        where: { codigo: s.codigo },
        create: {
          moduloId: destino.id,
          codigo: s.codigo,
          nombre: s.nombre,
          descripcion: s.descripcion,
          ruta: s.ruta,
          activo: s.activo,
          orden: s.orden,
        },
        update: { moduloId: destino.id, nombre: s.nombre },
        select: { id: true },
      });
      if (!subModuloIdByCodigo.has(s.codigo)) subsCreados++;
      subModuloIdByCodigo.set(s.codigo, sub.id);
    }
  }
  console.log(`✅ Módulos: ${moduloIdByCodigo.size} (nuevos: ${modsCreados}) · Submódulos: ${subModuloIdByCodigo.size} (nuevos: ${subsCreados})`);

  // ── 2. Planes facturacion (los de plataforma falconext → 'default') ──────
  const planesMype = await mype.plan.findMany({
    where: { producto: 'facturacion', plataforma: 'falconext' },
    include: {
      features: true,
      modulosAsignados: { include: { modulo: { select: { codigo: true } } } },
      subModulosAsignados: { include: { subModulo: { select: { codigo: true } } } },
    },
  });

  let planesCreados = 0;
  for (const p of planesMype) {
    const existe = await dst.plan.findFirst({
      where: { nombre: p.nombre, plataforma: 'default', producto: 'facturacion' },
      select: { id: true },
    });
    if (existe) {
      console.log(`↷ Plan "${p.nombre}" ya existe. Se omite.`);
      continue;
    }

    // Campos escalares (se quitan id/relaciones/timestamps/plataforma).
    const {
      id,
      creadoEn,
      createdAt,
      updatedAt,
      plataforma,
      features,
      modulosAsignados,
      subModulosAsignados,
      ...scalars
    } = p as any;

    const moduloIds = modulosAsignados
      .map((x: any) => moduloIdByCodigo.get(x.modulo.codigo))
      .filter((v: any): v is number => typeof v === 'number');
    const subModuloIds = subModulosAsignados
      .map((x: any) => subModuloIdByCodigo.get(x.subModulo.codigo))
      .filter((v: any): v is number => typeof v === 'number');

    await dst.plan.create({
      data: {
        ...scalars,
        plataforma: 'default',
        producto: 'facturacion',
        features: {
          create: features.map((f: any) => ({
            featureKey: f.featureKey,
            enabled: f.enabled,
          })),
        },
        modulosAsignados: { create: moduloIds.map((mid: number) => ({ moduloId: mid })) },
        subModulosAsignados: { create: subModuloIds.map((sid: number) => ({ subModuloId: sid })) },
      },
    });
    planesCreados++;
    console.log(`✅ Plan "${p.nombre}" creado (S/${Number(p.costo)}) · ${moduloIds.length} módulos, ${subModuloIds.length} submódulos`);
  }
  console.log(`\n🎯 Planes nuevos: ${planesCreados}`);
}

main()
  .catch((e) => { console.error('❌ Error:', e?.message || e); process.exit(1); })
  .finally(async () => { await mype.$disconnect(); await dst.$disconnect(); });
