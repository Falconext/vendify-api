const { post } = require('./_qa_pay_lib.js');
const fs=require('fs');
const results={};
function summ(r){ const d=r.body?.data??{}; return { status:r.status, ok:d.sunat_success, code:d.code, msg:(d.message||r.body?.message||'').slice(0,160), id:d.comprobanteId??d.id, serie:d.serie, correlativo:d.correlativo, estadoPago:d.estadoPago, saldo:d.saldo, tipoDoc:d.tipoDoc, estadoSunat:d.estadoEnvioSunat }; }
async function run(name, method, endpoint, dto){
  const r = await post(endpoint, dto);
  results[name]=summ(r); console.log(name, JSON.stringify(results[name]));
  return r;
}
const common={ tipoOperacionId:1, fechaEmision:new Date().toISOString(), formaPagoMoneda:'PEN', tipoMoneda:'PEN', clienteId:5, clienteName:'ORTEGA ROLDAN DIEGO JESUS' };
(async()=>{
  // NOTA CRÉDITO - anulación total de F001-00000016
  await run('NC01_anulacion','POST','/comprobante/nota-credito', { ...common, tipoDoc:'07', formaPagoTipo:'CONTADO',
    leyenda:'ANULACION DE LA OPERACION', tipDocAfectado:'01', numDocAfectado:'F001-00000016', motivoId:1, detalles:[] });

  // NOTA DÉBITO - intereses por mora sobre F001-00000016
  await run('ND01_mora','POST','/comprobante/nota-debito', { ...common, tipoDoc:'08', formaPagoTipo:'CONTADO',
    leyenda:'INTERESES POR MORA', tipDocAfectado:'01', numDocAfectado:'F001-00000016', motivoId:12,
    detalles:[{ productoId:null, descripcion:'INTERESES POR MORA F001-16', cantidad:1, nuevoValorUnitario:59, tipoAfectacionIGV:'10' }] });

  // INFORMAL - nota de venta contado
  await run('NV_contado','POST','/comprobante/informal', { ...common, tipoDoc:'NV', formaPagoTipo:'CONTADO', medioPago:'EFECTIVO',
    leyenda:'NOTA DE VENTA', detalles:[{ productoId:null, descripcion:'ITEM NV', cantidad:2, nuevoValorUnitario:50, tipoAfectacionIGV:'10' }] });

  // INFORMAL - nota de venta con adelanto (parcial)
  await run('NV_adelanto','POST','/comprobante/informal', { ...common, tipoDoc:'NV', formaPagoTipo:'CREDITO', medioPago:'EFECTIVO',
    adelanto:40, fechaVencimientoCredito:'2026-08-24', leyenda:'NV ADELANTO',
    detalles:[{ productoId:null, descripcion:'ITEM NV', cantidad:2, nuevoValorUnitario:50, tipoAfectacionIGV:'10' }] });

  // INFORMAL - crédito puro (sin adelanto)
  await run('NV_credito','POST','/comprobante/informal', { ...common, tipoDoc:'NV', formaPagoTipo:'CREDITO',
    fechaVencimientoCredito:'2026-09-24', leyenda:'NV CREDITO',
    detalles:[{ productoId:null, descripcion:'ITEM NV', cantidad:2, nuevoValorUnitario:50, tipoAfectacionIGV:'10' }] });

  // OT - con adelanto
  await run('OT_adelanto','POST','/comprobante/ot', { productoId:22, cantidad:1, precioUnitario:200, adelanto:80,
    estadoOT:'PENDIENTE', clienteId:5, observaciones:'Reparacion QA', fechaEmision:new Date().toISOString() });

  // COTIZACION
  await run('COT','POST','/comprobante/informal', { ...common, tipoDoc:'COT', formaPagoTipo:'CONTADO', leyenda:'COTIZACION',
    cotizVigencia:15, cotizTipoPago:'CONTADO', cotizTerminos:'Precios sujetos a cambio', cotizMoneda:'PEN',
    detalles:[{ productoId:null, descripcion:'ITEM COT', cantidad:3, nuevoValorUnitario:50, tipoAfectacionIGV:'10' }] });

  // ANULAR el NV contado recién creado (informal -> debe anular)
  const nvId = results['NV_contado']?.id;
  if (nvId) {
    const { TOKEN, BASE } = require('./_qa_pay_lib.js');
    const r = await fetch(BASE+'/comprobante/'+nvId+'/anular', { method:'PATCH', headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}, body: JSON.stringify({ motivo:'Error QA' }) });
    const t = await r.text(); let j; try{j=JSON.parse(t)}catch{j=t}
    results['ANULAR_NV']={ status:r.status, msg:(j?.data?.message||j?.message||'').slice(0,160), estadoSunat:j?.data?.estadoEnvioSunat, estadoPago:j?.data?.estadoPago };
    console.log('ANULAR_NV', JSON.stringify(results['ANULAR_NV']));
  }
  // ANULAR una factura EMITIDA (comp 67 F001-16) -> debe 400 pidiendo NC
  {
    const { TOKEN, BASE } = require('./_qa_pay_lib.js');
    const r = await fetch(BASE+'/comprobante/67/anular', { method:'PATCH', headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}, body: JSON.stringify({ motivo:'test' }) });
    const t=await r.text(); let j; try{j=JSON.parse(t)}catch{j=t}
    results['ANULAR_FACTURA_EMITIDA']={ status:r.status, msg:(j?.message||j?.data?.message||'').slice(0,160) };
    console.log('ANULAR_FACTURA_EMITIDA', JSON.stringify(results['ANULAR_FACTURA_EMITIDA']));
  }
  fs.writeFileSync(__dirname+'/_qa_notas_results.json', JSON.stringify(results,null,2));
  console.log('DONE');
})().catch(e=>{console.error('FATAL',e.message,e.stack);process.exit(1)});
