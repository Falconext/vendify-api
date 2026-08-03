const { post } = require('./_qa_pay_lib.js');
const fs = require('fs');
function base(extra){
  return Object.assign({
    clienteId:5, clienteName:'ORTEGA ROLDAN DIEGO JESUS', tipoDoc:'01', tipoOperacionId:1,
    fechaEmision:new Date().toISOString(), tipoMoneda:'PEN', formaPagoMoneda:'PEN', tipoCambio:1,
    formaPagoTipo:'Contado', medioPago:'EFECTIVO', leyenda:'QA',
    detalles:[{ productoId:null, descripcion:'ITEM QA', cantidad:1, nuevoValorUnitario:118, tipoAfectacionIGV:'10' }],
  }, extra);
}
function summ(r){ const d=r.body?.data||{}; return { status:r.status, ok:d.sunat_success, code:d.code, msg:(d.message||r.body?.message||'').slice(0,180), id:d.comprobanteId, notes:d.notes }; }
const results={};
async function run(name, endpoint, dto){ const r=await post(endpoint,dto); results[name]=summ(r); console.log(name, JSON.stringify(results[name])); }
(async()=>{
  // ---- BOLETAS (03) ----
  await run('B1_contado_dni','/comprobante/boleta', base({ tipoDoc:'03' }));
  await run('B2_clientes_varios','/comprobante/boleta', base({ tipoDoc:'03', clienteId:undefined, clienteName:'CLIENTES VARIOS' }));
  await run('B3_mix_afectaciones','/comprobante/boleta', base({ tipoDoc:'03', detalles:[
    { productoId:null, descripcion:'GRAVADO', cantidad:1, nuevoValorUnitario:118, tipoAfectacionIGV:'10' },
    { productoId:null, descripcion:'EXONERADO', cantidad:1, nuevoValorUnitario:50, tipoAfectacionIGV:'20' },
    { productoId:null, descripcion:'INAFECTO', cantidad:1, nuevoValorUnitario:30, tipoAfectacionIGV:'30' },
  ]}));
  await run('B4_gratuita','/comprobante/boleta', base({ tipoDoc:'03', leyenda:'TRANSFERENCIA GRATUITA', detalles:[
    { productoId:null, descripcion:'ITEM GRATIS', cantidad:1, nuevoValorUnitario:100, tipoAfectacionIGV:'21' }]}));

  // ---- FACTURAS ampliadas (01) ----
  await run('FX1_exonerada','/comprobante/factura', base({ detalles:[
    { productoId:null, descripcion:'SERVICIO EXONERADO', cantidad:1, nuevoValorUnitario:500, tipoAfectacionIGV:'20' }]}));
  await run('FX2_inafecta','/comprobante/factura', base({ detalles:[
    { productoId:null, descripcion:'SERVICIO INAFECTO', cantidad:1, nuevoValorUnitario:500, tipoAfectacionIGV:'30' }]}));
  await run('FX3_exportacion','/comprobante/factura', base({ tipoOperacionId:4, detalles:[
    { productoId:null, descripcion:'SERVICIO EXPORTACION', cantidad:1, nuevoValorUnitario:500, tipoAfectacionIGV:'40' }]}));
  await run('FX4_descuento_global','/comprobante/factura', base({ montoDescuentoGlobal:100, detalles:[
    { productoId:null, descripcion:'ITEM CON DESC', cantidad:1, nuevoValorUnitario:1180, tipoAfectacionIGV:'10' }]}));
  // Mixto correcto: total 1000 -> split 600+400
  await run('FX5_mixto_ok','/comprobante/factura', base({ medioPago:'EFECTIVO', detalles:[
    { productoId:null, descripcion:'ITEM MIXTO', cantidad:1, nuevoValorUnitario:1000, tipoAfectacionIGV:'10' }],
    splitPayments:[{ method:'EFECTIVO', amount:600 },{ method:'TARJETA', amount:400, referencia:'VISA-1' }] }));
  // Sobrepago: split 700+500=1200 > total 1000 -> ¿400?
  await run('FX6_sobrepago','/comprobante/factura', base({ medioPago:'EFECTIVO', detalles:[
    { productoId:null, descripcion:'ITEM MIXTO', cantidad:1, nuevoValorUnitario:1000, tipoAfectacionIGV:'10' }],
    splitPayments:[{ method:'EFECTIVO', amount:700 },{ method:'TARJETA', amount:500, referencia:'VISA-2' }] }));
  fs.writeFileSync(__dirname+'/_qa_bf_results.json', JSON.stringify(results,null,2));
  console.log('DONE');
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
