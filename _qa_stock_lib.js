// Shared: read effective stock of a product at a sede (resellers QA).
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
async function readStock(productoId, sedeId = 1) {
  const row = await prisma.productoStock.findUnique({
    where: { productoId_sedeId: { productoId, sedeId } },
    select: { stock: true },
  });
  return row ? Number(row.stock) : null;
}
module.exports = { readStock, prisma };
