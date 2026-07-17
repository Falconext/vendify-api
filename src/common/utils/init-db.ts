import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { existsSync, copyFileSync, unlinkSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

export async function initializeDatabase(prisma: PrismaService) {
  try {
    // For desktop deployments: handle SQLite database initialization
    const dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl.startsWith('file:')) {
      const dbPath = dbUrl.replace('file:', '');
      const templatePath = join(
        process.cwd(),
        'prisma',
        'nephi_pos_template.db',
      );

      // Check if we need to copy the template
      let needsCopy = false;

      if (!existsSync(dbPath)) {
        console.log('📦 Database not found, will copy template...');
        needsCopy = true;
      } else {
        // Database exists - check if it's empty/too small (corrupted)
        try {
          const stats = statSync(dbPath);
          // Template is ~438KB, if user db is much smaller, it's likely empty
          if (stats.size < 10000) {
            console.log(
              '📦 Database appears empty/corrupted, replacing with template...',
            );
            unlinkSync(dbPath);
            needsCopy = true;
          }
        } catch (e) {
          needsCopy = true;
        }
      }

      if (needsCopy && existsSync(templatePath)) {
        try {
          copyFileSync(templatePath, dbPath);
          console.log('✅ Database template copied successfully!');
        } catch (copyError) {
          console.error(
            '❌ Error copying template database:',
            copyError.message,
          );
        }
      } else if (needsCopy) {
        console.log('⚠️ No template database found, tables may be missing');
      }
    }

    // Seed SUNAT reference catalogs (UnidadMedida, TipoOperacion, MotivoNota,
    // TipoDocumento). Idempotent (upsert) and runs on EVERY boot — before the
    // "already initialized" early-return below — so existing databases get
    // backfilled, not only fresh ones.
    await seedCatalogosSunat(prisma);

    // Catálogo de Ubigeos (departamento/provincia/distrito). Se siembra una sola
    // vez (guardado por conteo) desde prisma/data/*.json — necesario para el
    // selector de ubicación al crear/editar empresas.
    await seedUbigeo(prisma);

    // Try to count users - this will fail if tables don't exist
    let userCount = 0;
    try {
      userCount = await prisma.usuario.count();
      if (userCount > 0) return; // Already initialized
    } catch (tableError) {
      console.log('⚠️ Tables may not exist yet, attempting seeding anyway...');
    }

    console.log('🚀 Initializing database with default data...');

    // 1. Create Default Rubro
    let rubro = await prisma.rubro.findFirst();
    if (!rubro) {
      rubro = await prisma.rubro.create({
        data: { nombre: 'General' },
      });
    }

    // 2. Create Default Plan
    let plan = await prisma.plan.findFirst();
    if (!plan) {
      plan = await prisma.plan.create({
        data: {
          nombre: 'PRO',
          costo: 0,
          esPrueba: false,
          tipoFacturacion: 'ANUAL',
          tieneTienda: true,
          tieneBanners: true,
          tieneGaleria: true,
          tieneCulqi: true,
          tieneDeliveryGPS: true,
        },
      });
    }

    // 3. TipoDocumento ya fue sembrado por seedCatalogosSunat() arriba.

    // 4. Create Default Company
    const empresa = await prisma.empresa.create({
      data: {
        ruc: '20000000001',
        razonSocial: 'MI EMPRESA S.A.C.',
        direccion: 'Av. Principal 123',
        fechaActivacion: new Date(),
        fechaExpiracion: new Date(
          new Date().setFullYear(new Date().getFullYear() + 10),
        ),
        planId: plan.id,
        rubroId: rubro.id,
        estado: 'ACTIVO',
        tipoEmpresa: 'FORMAL',
        // Tienda defaults
        slugTienda: 'mi-tienda',
        colorPrimario: '#000000',
        aceptaEfectivo: true,
      },
    });

    // 5. Create Default "Varios" Client
    const tipoDocDNI = await prisma.tipoDocumento.findUnique({
      where: { codigo: '1' },
    });
    if (tipoDocDNI) {
      await prisma.cliente.create({
        data: {
          nombre: 'VARIOS',
          nroDoc: '00000000',
          direccion: '-',
          empresaId: empresa.id,
          tipoDocumentoId: tipoDocDNI.id,
          persona: 'CLIENTE',
          estado: 'ACTIVO',
        },
      });
      console.log('   ✅ Default client "VARIOS" created');
    }

    // 6. Create Admin User with ADMIN_SISTEMA role
    const hashedPassword = await bcrypt.hash('admin123', 10);

    await prisma.usuario.create({
      data: {
        nombre: 'Administrador',
        dni: '00000001',
        celular: '999999999',
        email: 'admin@vendify.pe',
        password: hashedPassword,
        rol: 'ADMIN_SISTEMA',
        empresaId: empresa.id,
        estado: 'ACTIVO',
        permisos: 'ALL',
      },
    });

    console.log('✅ Database initialized successfully!');
    console.log('🔑 Credentials: admin@vendify.pe / admin123');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
}

/**
 * Siembra los catálogos de referencia SUNAT que las tablas de la BD necesitan
 * para operar: Tipos de Documento (cat. 06), Unidades de Medida (cat. 03),
 * Tipos de Operación (cat. 51), Motivos de Nota (cat. 09/10), Tipos de
 * Detracción (cat. 54) y Medios de Pago de Detracción. Es idempotente (upsert)
 * y se invoca en CADA arranque, antes del early-return de "ya inicializado",
 * para rellenar también bases de datos existentes que no tenían estos datos.
 *
 * Fuente canónica de los datos: prisma/desktop-seed.ts y
 * prisma/seeds/seed-detracciones.ts.
 */
export async function seedCatalogosSunat(prisma: PrismaService) {
  try {
    // 1. Tipos de Documento (SUNAT Catálogo 06)
    const tiposDocumento = [
      { codigo: '0', descripcion: 'OTROS' },
      { codigo: '1', descripcion: 'DNI' },
      { codigo: '4', descripcion: 'CARNET DE EXTRANJERÍA' },
      { codigo: '6', descripcion: 'RUC' },
      { codigo: '7', descripcion: 'PASAPORTE' },
      { codigo: 'A', descripcion: 'CARNET DE IDENTIDAD' },
    ];
    for (const doc of tiposDocumento) {
      await prisma.tipoDocumento.upsert({
        where: { codigo: doc.codigo },
        update: {},
        create: doc,
      });
    }

    // 2. Unidades de Medida (SUNAT Catálogo 03)
    const unidadesMedida = [
      { codigo: 'NIU', nombre: 'UNIDAD' },
      { codigo: 'KGM', nombre: 'KILOGRAMO' },
      { codigo: 'LTR', nombre: 'LITRO' },
      { codigo: 'MTR', nombre: 'METRO' },
      { codigo: 'MTK', nombre: 'METRO CUADRADO' },
      { codigo: 'MTQ', nombre: 'METRO CÚBICO' },
      { codigo: 'GRM', nombre: 'GRAMO' },
      { codigo: 'TNE', nombre: 'TONELADA' },
      { codigo: 'GLN', nombre: 'GALÓN' },
      { codigo: 'BOX', nombre: 'CAJA' },
      { codigo: 'DZN', nombre: 'DOCENA' },
      { codigo: 'PAR', nombre: 'PAR' },
      { codigo: 'SET', nombre: 'JUEGO' },
      { codigo: 'ZZ', nombre: 'OTROS' },
    ];
    for (const u of unidadesMedida) {
      await prisma.unidadMedida.upsert({
        where: { codigo: u.codigo },
        update: {},
        create: u,
      });
    }

    // 3. Tipos de Operación (SUNAT Catálogo 51). Lista alineada con
    // prisma/seeds/seed-detracciones.ts (fuente autoritativa en web).
    const tiposOperacion = [
      { codigo: '0101', descripcion: 'VENTA INTERNA' },
      { codigo: '0102', descripcion: 'EXPORTACIÓN' },
      { codigo: '0112', descripcion: 'VENTA INTERNA - ANTICIPOS' },
      { codigo: '0113', descripcion: 'EXPORTACIÓN - ANTICIPOS' },
      { codigo: '0121', descripcion: 'VENTA INTERNA SUJETA A IVAP' },
      { codigo: '0200', descripcion: 'EXPORTACIÓN DE SERVICIOS - PRESTACIÓN DE SERVICIOS REALIZADOS EN EL PAÍS' },
      { codigo: '0201', descripcion: 'EXPORTACIÓN DE SERVICIOS - PRESTACIÓN DE SERVICIOS REALIZADOS ÍNTEGRAMENTE EN EL EXTRANJERO' },
      { codigo: '0202', descripcion: 'EXPORTACIÓN DE SERVICIOS - SERVICIOS DE HOSPEDAJE NO DOMICILIADOS' },
      { codigo: '0205', descripcion: 'EXPORTACIÓN DE SERVICIOS - SERVICIOS A NAVES Y AERONAVES DE BANDERA EXTRANJERA' },
      { codigo: '0206', descripcion: 'EXPORTACIÓN DE SERVICIOS - SERVICIOS COMPLEMENTARIOS AL TRANSPORTE DE CARGA' },
      { codigo: '0401', descripcion: 'OPERACIONES SUJETAS A DETRACCIÓN' },
    ];
    for (const op of tiposOperacion) {
      await prisma.tipoOperacion.upsert({
        where: { codigo: op.codigo },
        update: { descripcion: op.descripcion },
        create: op,
      });
    }

    // 4. Motivos de Nota de Crédito/Débito (SUNAT Catálogos 09 y 10)
    const motivosNota = [
      { tipo: 'CREDITO', codigo: '01', descripcion: 'ANULACIÓN DE LA OPERACIÓN' },
      { tipo: 'CREDITO', codigo: '02', descripcion: 'ANULACIÓN POR ERROR EN EL RUC' },
      { tipo: 'CREDITO', codigo: '03', descripcion: 'CORRECCIÓN POR ERROR EN LA DESCRIPCIÓN' },
      { tipo: 'CREDITO', codigo: '04', descripcion: 'DESCUENTO GLOBAL' },
      { tipo: 'CREDITO', codigo: '05', descripcion: 'DESCUENTO POR ÍTEM' },
      { tipo: 'CREDITO', codigo: '06', descripcion: 'DEVOLUCIÓN TOTAL' },
      { tipo: 'CREDITO', codigo: '07', descripcion: 'DEVOLUCIÓN POR ÍTEM' },
      { tipo: 'CREDITO', codigo: '08', descripcion: 'BONIFICACIÓN' },
      { tipo: 'CREDITO', codigo: '09', descripcion: 'DISMINUCIÓN EN EL VALOR' },
      { tipo: 'CREDITO', codigo: '10', descripcion: 'OTROS CONCEPTOS' },
      { tipo: 'CREDITO', codigo: '13', descripcion: 'AJUSTE MYPE' },
      { tipo: 'DEBITO', codigo: '01', descripcion: 'INTERESES POR MORA' },
      { tipo: 'DEBITO', codigo: '02', descripcion: 'AUMENTO EN EL VALOR' },
      { tipo: 'DEBITO', codigo: '03', descripcion: 'PENALIDADES/OTROS CONCEPTOS' },
    ];
    for (const m of motivosNota) {
      const existing = await prisma.motivoNota.findFirst({
        where: { tipo: m.tipo as any, codigo: m.codigo },
      });
      if (!existing) {
        await prisma.motivoNota.create({ data: m as any });
      }
    }

    // 5. Tipos de Detracción (SUNAT Catálogo 54 — Anexos 2 y 3)
    const tiposDetraccion = [
      // BIENES (Anexo 2)
      { codigo: '001', descripcion: 'Azúcar y melaza de caña', porcentaje: 10 },
      { codigo: '003', descripcion: 'Alcohol etílico', porcentaje: 4 },
      { codigo: '004', descripcion: 'Recursos hidrobiológicos', porcentaje: 4 },
      { codigo: '005', descripcion: 'Maíz amarillo duro', porcentaje: 4 },
      { codigo: '006', descripcion: 'Madera', porcentaje: 4 },
      { codigo: '007', descripcion: 'Arena y piedra', porcentaje: 10 },
      { codigo: '008', descripcion: 'Residuos, subproductos, desechos, recortes y desperdicios', porcentaje: 15 },
      { codigo: '009', descripcion: 'Carnes y despojos comestibles', porcentaje: 4 },
      { codigo: '010', descripcion: 'Harina, polvo y pellets de pescado, crustáceos, moluscos', porcentaje: 4 },
      { codigo: '011', descripcion: 'Aceite de pescado', porcentaje: 10 },
      { codigo: '012', descripcion: 'Leche', porcentaje: 4 },
      { codigo: '014', descripcion: 'Bienes gravados con el IGV por renuncia a la exoneración', porcentaje: 10 },
      { codigo: '016', descripcion: 'Páprika y otros frutos del género capsicum o pimienta', porcentaje: 10 },
      { codigo: '017', descripcion: 'Espárragos', porcentaje: 10 },
      { codigo: '018', descripcion: 'Minerales metálicos no auríferos', porcentaje: 10 },
      { codigo: '023', descripcion: 'Plomo', porcentaje: 15 },
      { codigo: '029', descripcion: 'Minerales no metálicos', porcentaje: 10 },
      { codigo: '031', descripcion: 'Oro gravado con el IGV', porcentaje: 10 },
      { codigo: '034', descripcion: 'Oro y demás minerales metálicos exonerados del IGV', porcentaje: 1.5 },
      { codigo: '035', descripcion: 'Bienes exonerados del IGV', porcentaje: 1.5 },
      { codigo: '036', descripcion: 'Caña de azúcar', porcentaje: 10 },
      // SERVICIOS (Anexo 3)
      { codigo: '019', descripcion: 'Arrendamiento de bienes', porcentaje: 10 },
      { codigo: '020', descripcion: 'Mantenimiento y reparación de bienes muebles', porcentaje: 12 },
      { codigo: '021', descripcion: 'Movimiento de carga', porcentaje: 10 },
      { codigo: '022', descripcion: 'Otros servicios empresariales', porcentaje: 12 },
      { codigo: '024', descripcion: 'Comisión mercantil', porcentaje: 10 },
      { codigo: '025', descripcion: 'Fabricación de bienes por encargo', porcentaje: 10 },
      { codigo: '026', descripcion: 'Servicio de transporte de personas', porcentaje: 10 },
      { codigo: '027', descripcion: 'Servicio de transporte de carga', porcentaje: 4 },
      { codigo: '030', descripcion: 'Contratos de construcción', porcentaje: 4 },
      { codigo: '032', descripcion: 'Intermediación laboral y tercerización', porcentaje: 12 },
      { codigo: '037', descripcion: 'Demás servicios gravados con el IGV', porcentaje: 12 },
    ];
    for (const t of tiposDetraccion) {
      await prisma.tipoDetraccion.upsert({
        where: { codigo: t.codigo },
        update: { descripcion: t.descripcion, porcentaje: t.porcentaje },
        create: t,
      });
    }

    // 6. Medios de Pago para Detracción
    const mediosPagoDetraccion = [
      { codigo: '001', descripcion: 'Depósito en cuenta' },
      { codigo: '002', descripcion: 'Giro' },
      { codigo: '003', descripcion: 'Transferencia de fondos' },
      { codigo: '004', descripcion: 'Orden de pago' },
      { codigo: '005', descripcion: 'Tarjeta de débito' },
      { codigo: '006', descripcion: 'Tarjeta de crédito emitida en el país por empresa del sistema financiero' },
      { codigo: '007', descripcion: 'Cheques con la cláusula de "NO NEGOCIABLE", "INTRANSFERIBLES"' },
      { codigo: '008', descripcion: 'Efectivo, en operaciones en las que no supere S/ 500' },
      { codigo: '009', descripcion: 'Otros medios de pago' },
    ];
    for (const m of mediosPagoDetraccion) {
      await prisma.medioPagoDetraccion.upsert({
        where: { codigo: m.codigo },
        update: { descripcion: m.descripcion },
        create: m,
      });
    }

    console.log(
      '   ✅ Catálogos SUNAT (documento/unidad/operación/nota/detracción) OK',
    );
  } catch (error) {
    // No debe romper el arranque si las tablas aún no existen (pre-migración).
    console.log(
      '⚠️ No se pudieron sembrar los catálogos SUNAT todavía:',
      (error as Error)?.message,
    );
  }
}

/**
 * Siembra el catálogo de Ubigeos (departamento/provincia/distrito) desde los
 * JSON en prisma/data. Idempotente por conteo: solo inserta si la tabla está
 * vacía. Fuente canónica: prisma/seeds/seed-ubigeo.ts.
 */
async function seedUbigeo(prisma: PrismaService) {
  try {
    const count = await prisma.ubigeo.count();
    if (count > 0) return; // Ya sembrado

    const dataDir = join(process.cwd(), 'prisma', 'data');
    const deptPath = join(dataDir, 'departamentos.json');
    const provPath = join(dataDir, 'provincias.json');
    const distPath = join(dataDir, 'distritos.json');

    if (!existsSync(deptPath) || !existsSync(provPath) || !existsSync(distPath)) {
      console.log('⚠️ Archivos de ubigeo no encontrados, se omite el seeding.');
      return;
    }

    const departamentos: { id: string; name: string }[] = JSON.parse(
      readFileSync(deptPath, 'utf-8'),
    );
    const provincias: { id: string; name: string }[] = JSON.parse(
      readFileSync(provPath, 'utf-8'),
    );
    const distritos: {
      id: string;
      name: string;
      province_id: string;
      department_id: string;
    }[] = JSON.parse(readFileSync(distPath, 'utf-8'));

    const deptMap = new Map(departamentos.map((d) => [d.id, d.name]));
    const provMap = new Map(provincias.map((p) => [p.id, p.name]));

    const ubigeoData = distritos.map((d) => ({
      codigo: d.id,
      departamento: deptMap.get(d.department_id) || '',
      provincia: provMap.get(d.province_id) || '',
      distrito: d.name,
    }));

    const batchSize = 500;
    for (let i = 0; i < ubigeoData.length; i += batchSize) {
      await prisma.ubigeo.createMany({
        data: ubigeoData.slice(i, i + batchSize),
        skipDuplicates: true,
      });
    }
    console.log(`   ✅ Ubigeos sembrados (${ubigeoData.length})`);
  } catch (error) {
    console.log(
      '⚠️ No se pudieron sembrar los ubigeos todavía:',
      (error as Error)?.message,
    );
  }
}
