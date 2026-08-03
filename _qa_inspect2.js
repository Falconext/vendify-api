const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  for (const id of [67,68,70]) {
    const c = await p.comprobante.findUnique({ where:{id}, select:{id:true,serie:true,correlativo:true,tipoDoc:true,mtoImpVenta:true,valorVenta:true,totalImpuestos:true,subTotal:true,estadoPago:true,saldo:true,formaPagoTipo:true} });
    console.log(JSON.stringify(c));
  }
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
