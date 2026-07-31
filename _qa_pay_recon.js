const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const to = await p.tipoOperacion.findMany({ orderBy:{codigo:'asc'} });
  console.log('=== tipoOperacion ==='); to.forEach(t=>console.log(t.id, t.codigo, t.nombre||t.descripcion));
  const td = await p.tipoDetraccion.findMany({ orderBy:{codigo:'asc'} });
  console.log('=== tipoDetraccion ==='); td.forEach(t=>console.log(t.id, t.codigo, t.porcentaje, t.descripcion));
  const mp = await p.medioPagoDetraccion.findMany({ orderBy:{codigo:'asc'} });
  console.log('=== medioPagoDetraccion ==='); mp.forEach(t=>console.log(t.id, t.codigo, t.descripcion));
  const emp = await p.empresa.findUnique({ where:{id:2}, select:{id:true, ruc:true, razonSocial:true, usuarioPse:true, contrasenaPse:true, billingProvider:true} });
  console.log('=== empresa 2 ===', JSON.stringify(emp));
  const cli = await p.cliente.findMany({ where:{empresaId:2, tipoDocumento:{in:['6','RUC']}}, take:5, select:{id:true, nombre:true, numeroDocumento:true, tipoDocumento:true, estado:true} });
  console.log('=== clientes RUC empresa 2 ==='); cli.forEach(c=>console.log(JSON.stringify(c)));
  const cb = await p.cuentaBancaria.findMany({ where:{empresaId:2}, take:5, select:{id:true, banco:true, numero:true, activo:true} });
  console.log('=== cuentaBancaria emp2 ==='); cb.forEach(c=>console.log(JSON.stringify(c)));
  await p.$disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
