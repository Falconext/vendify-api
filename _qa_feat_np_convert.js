// QA — NP: conversión descuenta exactamente 1 vez; anulación NO infla stock.
// Producto 8 (CEMENTO ANDINO), sede 1. Emite boletas reales a SUNAT demo.
const { post, TOKEN, BASE } = require('./_qa_pay_lib.js');
const { readStock, prisma } = require('./_qa_stock_lib.js');
const fs = require('fs');
const PID = 8, SEDE = 1;
const common = { tipoOperacionId:1, fechaEmision:new Date().toISOString(), formaPagoMoneda:'PEN', tipoMoneda:'PEN', tipoCambio:1, clienteId:5, clienteName:'ORTEGA ROLDAN DIEGO JESUS' };
const line = (qty)=>[{ productoId:PID, descripcion:'CEMENTO ANDINO', cantidad:qty, nuevoValorUnitario:25, tipoAfectacionIGV:'10' }];
const npId = (r)=> r.body?.data?.id;               // el informal devuelve data.id
const R = {};
async function anular(id){
  const r = await fetch(BASE+'/comprobante/'+id+'/anular', { method:'PATCH', headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}, body: JSON.stringify({ motivo:'QA anulacion NP' }) });
  const t = await r.text(); let j; try{j=JSON.parse(t)}catch{j=t}
  return { status:r.status, msg:(j?.data?.message||j?.message||'').slice(0,140) };
}
(async()=>{
  const s0 = await readStock(PID, SEDE);

  // 1) NP sin descontar (qty 4) -> stock igual
  let r = await post('/comprobante/informal', { ...common, tipoDoc:'NP', formaPagoTipo:'CONTADO', medioPago:'EFECTIVO', leyenda:'NP a convertir', detalles: line(4) });
  const id1 = npId(r);
  const s1 = await readStock(PID, SEDE);
  R.paso1_np_sin_stock = { npId:id1, emit_status:r.status, s0, s1, PASS: (id1>0) && s1 === s0 };

  // 2) Convertir esa NP -> BOLETA (comprobanteOrigenId real) -> descuenta 4 UNA vez + acepta SUNAT
  r = await post('/comprobante/boleta', { ...common, tipoDoc:'03', formaPagoTipo:'Contado', medioPago:'EFECTIVO', leyenda:'BOLETA desde NP', comprobanteOrigenId: id1, detalles: line(4) });
  const s2 = await readStock(PID, SEDE);
  R.paso2_conversion_sin_stock = { origenId:id1, status:r.status, sunat_success:r.body?.data?.sunat_success, doc:(r.body?.data?.serie||'')+'-'+(r.body?.data?.correlativo||''), s1, s2, esperado:s1-4, PASS: s2 === s1 - 4 };

  // 3) NP sin descontar (qty 5) -> ANULAR -> stock NO debe inflarse (revertirStock early-return)
  r = await post('/comprobante/informal', { ...common, tipoDoc:'NP', formaPagoTipo:'CONTADO', medioPago:'EFECTIVO', leyenda:'NP a anular', detalles: line(5) });
  const id3 = npId(r);
  const s3 = await readStock(PID, SEDE);
  const anul = await anular(id3);
  const s4 = await readStock(PID, SEDE);
  R.paso3_anular_np_sin_stock = { npId:id3, emit_status:r.status, anular:anul, s3, s4, PASS: (id3>0) && anul.status>=200 && anul.status<300 && s4 === s3 };

  // 4) NP CON descontar (qty 3) -> stock -3; convertir -> NO debe volver a descontar (origenYaDescontoStock)
  r = await post('/comprobante/informal', { ...common, tipoDoc:'NP', formaPagoTipo:'CONTADO', medioPago:'EFECTIVO', leyenda:'NP con stock', descontarStock:true, detalles: line(3) });
  const id4 = npId(r);
  const s5 = await readStock(PID, SEDE);
  r = await post('/comprobante/boleta', { ...common, tipoDoc:'03', formaPagoTipo:'Contado', medioPago:'EFECTIVO', leyenda:'BOLETA desde NP con stock', comprobanteOrigenId: id4, detalles: line(3) });
  const s6 = await readStock(PID, SEDE);
  R.paso4_np_con_stock_convert = { npId:id4, s4, s5, descuento_al_crear_NP: s4 - s5, conv_status:r.status, conv_ok:r.body?.data?.sunat_success, s6, esperado_igual_s5: s5, PASS: (s5 === s4 - 3) && (s6 === s5) };

  console.log(JSON.stringify(R, null, 2));
  const allPass = R.paso1_np_sin_stock.PASS && R.paso2_conversion_sin_stock.PASS && R.paso3_anular_np_sin_stock.PASS && R.paso4_np_con_stock_convert.PASS;
  console.log('QA_NP_CONVERT_RESULT:', allPass ? 'ALL PASS' : 'SOME FAIL');
  fs.writeFileSync(__dirname+'/_qa_feat_np_convert_results.json', JSON.stringify(R,null,2));
  await prisma.$disconnect();
})().catch(async e=>{ console.error('FATAL', e.message); try{await prisma.$disconnect()}catch{}; process.exit(1); });
