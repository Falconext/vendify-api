// QA — NP toggle de stock (cambio 2), producto 7 (CEMENTO SOL), sede 1.
const { post } = require('./_qa_pay_lib.js');
const { readStock, prisma } = require('./_qa_stock_lib.js');
const fs = require('fs');
const PID = 7, SEDE = 1;
const common = { tipoOperacionId:1, fechaEmision:new Date().toISOString(), formaPagoMoneda:'PEN', tipoMoneda:'PEN', tipoCambio:1, clienteId:5, clienteName:'ORTEGA ROLDAN DIEGO JESUS' };
const line = (qty)=>[{ productoId:PID, descripcion:'CEMENTO SOL', cantidad:qty, nuevoValorUnitario:25, tipoAfectacionIGV:'10' }];
const R = {};
(async()=>{
  const s0 = await readStock(PID, SEDE);

  // NP SIN descontarStock -> stock NO debe cambiar
  let r = await post('/comprobante/informal', { ...common, tipoDoc:'NP', formaPagoTipo:'CONTADO', medioPago:'EFECTIVO', leyenda:'NP QA sin stock', detalles: line(3) });
  const s1 = await readStock(PID, SEDE);
  R.np_sin_descuento = { emit_status:r.status, npId:r.body?.data?.comprobanteId, s0, s1, PASS: s1 === s0 };

  // NP CON descontarStock:true, cantidad 2 -> stock debe bajar 2
  r = await post('/comprobante/informal', { ...common, tipoDoc:'NP', formaPagoTipo:'CONTADO', medioPago:'EFECTIVO', leyenda:'NP QA con stock', descontarStock:true, detalles: line(2) });
  const s2 = await readStock(PID, SEDE);
  R.np_con_descuento = { emit_status:r.status, npId:r.body?.data?.comprobanteId, s1, s2, esperado: s1 - 2, PASS: s2 === s1 - 2 };

  console.log(JSON.stringify(R, null, 2));
  console.log('QA_NP_TOGGLE_RESULT:', (R.np_sin_descuento.PASS && R.np_con_descuento.PASS) ? 'ALL PASS' : 'SOME FAIL');
  fs.writeFileSync(__dirname+'/_qa_feat_np_toggle_results.json', JSON.stringify(R,null,2));
  await prisma.$disconnect();
})().catch(async e=>{ console.error('FATAL', e.message); try{await prisma.$disconnect()}catch{}; process.exit(1); });
