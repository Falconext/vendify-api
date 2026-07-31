const { post, baseFactura } = require('./_qa_pay_lib.js');
function svc(det){ return { productoId:22, descripcion:'SERVICIO EMPRESARIAL QA DETRACCION', cantidad:1, nuevoValorUnitario:1000, tipoAfectacionIGV:'10', ...(det||{}) }; }
function summ(r){ const d=r.body?.data||{}; return { status:r.status, sunat_success:d.sunat_success, code:d.code, msg:d.message||r.body?.message, comprobanteId:d.comprobanteId, notes:d.notes }; }
(async()=>{
  // Crédito 2 cuotas sumando el total REAL (1000)
  {
    const dto = baseFactura({ formaPagoTipo:'CREDITO', fechaVencimientoCredito:'2026-09-30',
      cuotas:[{ monto:600, fechaVencimiento:'2026-08-30' },{ monto:400, fechaVencimiento:'2026-09-30' }] });
    console.log('CREDITO-OK', JSON.stringify(summ(await post('/comprobante/factura', dto))));
  }
  // Detracción 12% del total REAL (1000) = 120
  {
    const dto = baseFactura({ tipoOperacionId:3, formaPagoTipo:'Contado', medioPago:'EFECTIVO',
      detalles:[ svc() ], tipoDetraccionId:25, medioPagoDetraccionId:1, cuentaBancoNacion:'00-123-456789',
      porcentajeDetraccion:12, montoDetraccion:120 });
    console.log('DETRACCION-OK', JSON.stringify(summ(await post('/comprobante/factura', dto))));
  }
  // Retención 3% del total REAL (1000) = 30
  {
    const dto = baseFactura({ formaPagoTipo:'Contado', medioPago:'EFECTIVO',
      retencionPorcentaje:3, retencionMonto:30 });
    console.log('RETENCION-OK', JSON.stringify(summ(await post('/comprobante/factura', dto))));
  }
})();
