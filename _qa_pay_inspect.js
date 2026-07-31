const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const S = { id:true, serie:true, correlativo:true, tipoDoc:true, mtoImpVenta:true, valorVenta:true, totalImpuestos:true, subTotal:true, estadoPago:true, saldo:true, tipoDetraccionId:true, montoDetraccion:true, porcentajeDetraccion:true, cuotas:true, tipoOperacionId:true, cuentaBancoNacion:true };
(async () => {
  for (const id of [63,64,66]) {
    const c = await p.comprobante.findUnique({ where:{id}, select:S });
    console.log('--- COMP', id, JSON.stringify(c));
    const pagos = await p.pago.findMany({ where:{comprobanteId:id}, select:{id:true, monto:true, medioPago:true, referencia:true} });
    console.log('   PAGOS('+pagos.length+'):', JSON.stringify(pagos));
  }
  const c1 = await p.comprobante.findFirst({ where:{ empresaId:2, serie:'F001', correlativo:'00000011' }, select:S });
  console.log('--- CONTADO F001-11', JSON.stringify(c1));
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
