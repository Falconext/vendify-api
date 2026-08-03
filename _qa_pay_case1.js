const { post, baseFactura } = require('./_qa_pay_lib.js');
(async()=>{
  const dto = baseFactura({ formaPagoTipo:'Contado', medioPago:'EFECTIVO' });
  const r = await post('/comprobante/factura', dto);
  console.log('STATUS', r.status);
  console.log(JSON.stringify(r.body, null, 2).slice(0, 2000));
})();
