// QA — N° de operación OPCIONAL (cambio 1). Emisión real a SUNAT demo.
// Verifica: TARJETA sin referencia YA NO bloquea; TRANSFERENCIA sigue exigiendo cuenta.
const { post } = require('./_qa_pay_lib.js');
const fs = require('fs');
const common = { tipoOperacionId:1, fechaEmision:new Date().toISOString(), formaPagoMoneda:'PEN', tipoMoneda:'PEN', tipoCambio:1, clienteId:5, clienteName:'ORTEGA ROLDAN DIEGO JESUS', leyenda:'QA NUM OPERACION' };
const item = (v=100)=>[{ productoId:null, descripcion:'ITEM QA NUMOP', cantidad:1, nuevoValorUnitario:v, tipoAfectacionIGV:'10' }];
const R = {};
function summ(r){ const d=r.body?.data||{}; return { status:r.status, sunat_success:d.sunat_success, code:d.code, msg:(d.message||r.body?.message||'').slice(0,140), serie:d.serie, correlativo:d.correlativo }; }
(async()=>{
  // 1a: FACTURA Contado, medioPago TARJETA, SIN referencia -> antes 400, ahora debe ACEPTAR
  let r = await post('/comprobante/factura', { ...common, tipoDoc:'01', formaPagoTipo:'Contado', medioPago:'TARJETA', detalles:item(100) });
  R.factura_tarjeta_sin_ref = summ(r);
  R.factura_tarjeta_sin_ref.PASS = (r.status===200||r.status===201) && R.factura_tarjeta_sin_ref.sunat_success===true;

  // 1b: BOLETA Contado, split EFECTIVO+TARJETA, TARJETA SIN referencia -> debe ACEPTAR
  r = await post('/comprobante/boleta', { ...common, tipoDoc:'03', formaPagoTipo:'Contado', medioPago:'EFECTIVO',
    splitPayments:[{ method:'EFECTIVO', amount:59 }, { method:'TARJETA', amount:59 }], detalles:item(100) });
  R.boleta_split_tarjeta_sin_ref = summ(r);
  R.boleta_split_tarjeta_sin_ref.PASS = (r.status===200||r.status===201) && R.boleta_split_tarjeta_sin_ref.sunat_success===true;

  // 1c (control): TRANSFERENCIA sin cuentaBancariaId -> debe SEGUIR fallando (400), no relajamos cuenta
  r = await post('/comprobante/boleta', { ...common, tipoDoc:'03', formaPagoTipo:'Contado', medioPago:'TRANSFERENCIA', detalles:item(100) });
  R.transferencia_sin_cuenta = { status:r.status, msg:(r.body?.message||r.body?.data?.message||'').slice(0,140) };
  R.transferencia_sin_cuenta.PASS = r.status===400; // se espera bloqueo por cuenta bancaria

  console.log(JSON.stringify(R, null, 2));
  const allPass = R.factura_tarjeta_sin_ref.PASS && R.boleta_split_tarjeta_sin_ref.PASS && R.transferencia_sin_cuenta.PASS;
  console.log('QA_NUMOP_RESULT:', allPass ? 'ALL PASS' : 'SOME FAIL');
  fs.writeFileSync(__dirname+'/_qa_feat_numop_results.json', JSON.stringify(R,null,2));
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
