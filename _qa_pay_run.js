const { post, baseFactura } = require('./_qa_pay_lib.js');
const fs = require('fs');
const results = {};
function svc(det){ return { productoId:22, descripcion:'SERVICIO EMPRESARIAL QA DETRACCION', cantidad:1, nuevoValorUnitario:1000, tipoAfectacionIGV:'10', ...(det||{}) }; }
function summ(r){ const d=r.body?.data||{}; return { status:r.status, sunat_success:d.sunat_success, code:d.code, msg:d.message||r.body?.message, comprobanteId:d.comprobanteId, errors:d.errors, notes:d.notes }; }
(async()=>{
  // Case 2: CREDITO 1 cuota
  {
    const total=1180;
    const dto = baseFactura({ formaPagoTipo:'CREDITO', fechaVencimientoCredito:'2026-08-30',
      cuotas:[{ monto: total, fechaVencimiento:'2026-08-30' }] });
    const r = await post('/comprobante/factura', dto); results.case2=summ(r); console.log('CASE2', JSON.stringify(results.case2));
  }
  // Case 3: CREDITO 3 cuotas
  {
    const dto = baseFactura({ formaPagoTipo:'CREDITO', fechaVencimientoCredito:'2026-10-30',
      cuotas:[{ monto:400, fechaVencimiento:'2026-08-30' },{ monto:400, fechaVencimiento:'2026-09-30' },{ monto:380, fechaVencimiento:'2026-10-30' }] });
    const r = await post('/comprobante/factura', dto); results.case3=summ(r); console.log('CASE3', JSON.stringify(results.case3));
  }
  // Case 4: MIXTO split efectivo + tarjeta (top-level splitPayments)
  {
    const dto = baseFactura({ formaPagoTipo:'Contado', medioPago:'EFECTIVO',
      splitPayments:[{ method:'EFECTIVO', amount:680 },{ method:'TARJETA', amount:500, referencia:'VISA-1234' }] });
    const r = await post('/comprobante/factura', dto); results.case4=summ(r); console.log('CASE4', JSON.stringify(results.case4));
  }
  // Case 5a: DETRACCION op 0112 (tipoOperacionId=3), tipoDetraccion 022 (id 25, 12%), product w/ codProdSunat
  {
    const total=1180; const pct=12; const monto=+(total*pct/100).toFixed(2);
    const dto = baseFactura({ tipoOperacionId:3, formaPagoTipo:'Contado', medioPago:'EFECTIVO',
      detalles:[ svc() ],
      tipoDetraccionId:25, medioPagoDetraccionId:1, cuentaBancoNacion:'00-123-456789',
      porcentajeDetraccion:pct, montoDetraccion:monto });
    const r = await post('/comprobante/factura', dto); results.case5=summ(r); console.log('CASE5-DET', JSON.stringify(results.case5));
  }
  // Case 5b: DETRACCION with ITEM LIBRE -> expect 400
  {
    const dto = baseFactura({ tipoOperacionId:3, formaPagoTipo:'Contado', medioPago:'EFECTIVO',
      detalles:[{ productoId:null, descripcion:'ITEM LIBRE DET', cantidad:1, nuevoValorUnitario:1000, tipoAfectacionIGV:'10' }],
      tipoDetraccionId:25, medioPagoDetraccionId:1, cuentaBancoNacion:'00-123-456789', porcentajeDetraccion:12, montoDetraccion:141.6 });
    const r = await post('/comprobante/factura', dto); results.case5b=summ(r); console.log('CASE5b-DET-LIBRE', JSON.stringify(results.case5b));
  }
  // Case 5c: DETRACCION service product WITHOUT codProdSunat (id 23) -> expect 400
  {
    const dto = baseFactura({ tipoOperacionId:3, formaPagoTipo:'Contado', medioPago:'EFECTIVO',
      detalles:[{ productoId:23, descripcion:'SERVICIO SIN COD', cantidad:1, nuevoValorUnitario:1000, tipoAfectacionIGV:'10' }],
      tipoDetraccionId:25, medioPagoDetraccionId:1, cuentaBancoNacion:'00-123-456789', porcentajeDetraccion:12, montoDetraccion:141.6 });
    const r = await post('/comprobante/factura', dto); results.case5c=summ(r); console.log('CASE5c-DET-NOCOD', JSON.stringify(results.case5c));
  }
  // Case 6: RETENCION 3% (retencionMonto/porcentaje, no tipoDetraccionId)
  {
    const total=1180; const pct=3; const monto=+(total*pct/100).toFixed(2);
    const dto = baseFactura({ formaPagoTipo:'Contado', medioPago:'EFECTIVO',
      retencionPorcentaje:pct, retencionMonto:monto });
    const r = await post('/comprobante/factura', dto); results.case6=summ(r); console.log('CASE6-RET', JSON.stringify(results.case6));
  }
  // Case 7: GRATUITA (afectacion 21 gratuita gravada)
  {
    const dto = baseFactura({ formaPagoTipo:'Contado', medioPago:'EFECTIVO',
      leyenda:'TRANSFERENCIA GRATUITA',
      detalles:[{ productoId:null, descripcion:'ITEM GRATUITO QA', cantidad:1, nuevoValorUnitario:100, tipoAfectacionIGV:'21' }] });
    const r = await post('/comprobante/factura', dto); results.case7=summ(r); console.log('CASE7-GRATIS', JSON.stringify(results.case7));
  }
  fs.writeFileSync('/Users/tradercode/Documents/falconext/falconext/falconext-resellers/backend/_qa_pay_results.json', JSON.stringify(results,null,2));
  console.log('DONE');
})();
