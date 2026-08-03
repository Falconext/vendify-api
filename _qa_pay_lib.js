const jwt = require('/Users/tradercode/Documents/falconext/falconext/falconext-resellers/backend/node_modules/.pnpm/jsonwebtoken@9.0.2/node_modules/jsonwebtoken');
const fs = require('fs');
const env = fs.readFileSync('/Users/tradercode/Documents/falconext/falconext/falconext-resellers/backend/.env','utf8');
const m = env.match(/^JWT_SECRET="?(.*?)"?$/m);
const SECRET = m[1];
const TOKEN = jwt.sign({ sub:4, rol:'ADMIN_EMPRESA', empresaId:2, sedeId:1 }, SECRET, { expiresIn:'2h' });
const BASE = 'http://localhost:4101/api';
async function post(path, body) {
  const r = await fetch(BASE+path, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+TOKEN }, body: JSON.stringify(body) });
  let j; const t = await r.text(); try{ j = JSON.parse(t);}catch{ j = t; }
  return { status:r.status, body:j };
}
function baseFactura(extra) {
  return Object.assign({
    clienteId:5, clienteName:'ORTEGA ROLDAN DIEGO JESUS', tipoDoc:'01', tipoOperacionId:1,
    fechaEmision: new Date().toISOString(), tipoMoneda:'PEN', formaPagoMoneda:'PEN', tipoCambio:1,
    formaPagoTipo:'Contado', leyenda:'SON MIL CIENTO OCHENTA CON 00/100 SOLES',
    detalles:[{ productoId:null, descripcion:'ITEM LIBRE QA', cantidad:1, nuevoValorUnitario:1000, tipoAfectacionIGV:'10' }],
  }, extra);
}
module.exports = { post, baseFactura, TOKEN, BASE };
