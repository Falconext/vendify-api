/**
 * Arranca el cobro de marca blanca para los resellers que YA operaban antes de
 * que existiera la cuota (whiteLabelDesde = NULL con clientes en producción).
 *
 * Regla de negocio: la cuota corre desde el primer cliente en producción, pero
 * NO se cobra retroactivo. Por eso, por defecto, este script deja el primer
 * cobro para el PRÓXIMO aniversario (el mes en curso se da por pagado).
 *
 * Para un reseller que sí debe el mes en curso, pásalo en --cobrar-ahora: su
 * próximo cobro queda con fecha de hoy y el cron (o el endpoint manual
 * POST /api/resellers/white-label/cobros/run) se lo cobra en la siguiente corrida.
 *
 * Idempotente: solo toca resellers con whiteLabelDesde = NULL.
 *
 * Uso:
 *   npx ts-node src/scripts/backfill-marca-blanca.ts
 *   npx ts-node src/scripts/backfill-marca-blanca.ts --cobrar-ahora=ARLO
 *   npx ts-node src/scripts/backfill-marca-blanca.ts --cobrar-ahora=ARLO,OTRO --dry-run
 *
 * --cobrar-ahora acepta código o id de reseller, separados por coma.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const cobrarAhora = new Set(
  (args.find((a) => a.startsWith('--cobrar-ahora='))?.split('=')[1] || '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean),
);

// Mismo aniversario del día de origen; si el mes destino no tiene ese día
// (31 -> 30/28), retrocede al último día del mes correcto.
function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha);
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  if (d.getDate() !== dia) d.setDate(0);
  return d;
}

// Primer aniversario estrictamente futuro a partir del ancla.
function proximoAniversario(ancla: Date, desde: Date): Date {
  let siguiente = new Date(ancla);
  let guard = 0;
  while (siguiente <= desde && guard < 600) {
    siguiente = sumarMeses(siguiente, 1);
    guard += 1;
  }
  return siguiente;
}

async function main() {
  const ahora = new Date();

  const resellers = await prisma.reseller.findMany({
    where: { whiteLabelDesde: null },
    select: { id: true, nombre: true, codigo: true, activo: true },
    orderBy: { id: 'asc' },
  });

  console.log(`🔎 Resellers sin ciclo de marca blanca: ${resellers.length}`);
  if (dryRun) console.log('🧪 DRY RUN: no se escribe nada.\n');

  let iniciados = 0;
  let omitidos = 0;

  for (const reseller of resellers) {
    // El ciclo solo aplica a quien tiene (o tuvo) clientes en producción.
    const primerCliente = await prisma.empresa.findFirst({
      where: { resellerId: reseller.id, usaDemo: false },
      select: { fechaActivacion: true, razonSocial: true },
      orderBy: { fechaActivacion: 'asc' },
    });

    if (!primerCliente) {
      omitidos += 1;
      console.log(
        `   ⏭️  ${reseller.codigo} (${reseller.nombre}): sin clientes en producción, no se le cobra todavía.`,
      );
      continue;
    }

    const ancla = primerCliente.fechaActivacion || ahora;
    const debeMesEnCurso =
      cobrarAhora.has(String(reseller.codigo).toUpperCase()) ||
      cobrarAhora.has(String(reseller.id));

    // Cobra ya (debe el mes en curso) o recién en el próximo aniversario.
    const proximoCobro = debeMesEnCurso
      ? ahora
      : proximoAniversario(ancla, ahora);

    if (!dryRun) {
      await prisma.reseller.update({
        where: { id: reseller.id },
        data: { whiteLabelDesde: ancla, whiteLabelProximoCobro: proximoCobro },
      });
    }

    iniciados += 1;
    console.log(
      `   ✅ ${reseller.codigo} (${reseller.nombre}): desde ${ancla.toISOString().slice(0, 10)} · próximo cobro ${proximoCobro.toISOString().slice(0, 10)}${debeMesEnCurso ? '  ← COBRA AHORA (debe el mes en curso)' : ''}`,
    );
  }

  console.log(
    `\n📊 Listo. Ciclo iniciado: ${iniciados} · omitidos (sin producción): ${omitidos}`,
  );
  if (iniciados > 0 && !dryRun) {
    console.log(
      'ℹ️  Los cobros vencidos se aplican con el cron diario (09:20 Lima) o al toque con:\n' +
        '   POST /api/resellers/white-label/cobros/run  (rol ADMIN_SISTEMA)',
    );
  }
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
