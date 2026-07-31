const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const td = await p.tipoDocumento.findMany();
  console.log('=== tipoDocumento ==='); td.forEach(t=>console.log(t.id, t.codigo, t.descripcion));
  const cli = await p.cliente.findMany({ where:{empresaId:2}, take:20, select:{id:true, nombre:true, nroDoc:true, tipoDocumentoId:true, estado:true} });
  console.log('=== clientes emp2 ==='); cli.forEach(c=>console.log(JSON.stringify(c)));
  const cb = await p.cuentaBancaria.findMany({ where:{empresaId:2}, select:{id:true, banco:true, numeroCuenta:true, activo:true} }).catch(e=>{console.log('cuentaBancaria err', e.message); return [];});
  console.log('=== cuentaBancaria ==='); cb.forEach(c=>console.log(JSON.stringify(c)));
  // producto sedes
  const prods = await p.producto.findMany({ where:{empresaId:2}, take:3, select:{id:true, codigo:true, descripcion:true, stock:true, codProdSunat:true, tipoAfectacionIGV:true, unidadMedidaId:true} });
  console.log('=== sample productos ==='); prods.forEach(c=>console.log(JSON.stringify(c)));
  const sedes = await p.sede.findMany({ where:{empresaId:2}, select:{id:true, nombre:true} });
  console.log('=== sedes ==='); sedes.forEach(c=>console.log(JSON.stringify(c)));
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
