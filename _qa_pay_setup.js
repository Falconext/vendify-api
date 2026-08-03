const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  let prod = await p.producto.findFirst({ where:{ empresaId:2, codigo:'QA-SERV-DET' } });
  if (!prod) {
    prod = await p.producto.create({ data:{
      codigo:'QA-SERV-DET', descripcion:'SERVICIO EMPRESARIAL QA DETRACCION',
      unidadMedidaId:1, tipoAfectacionIGV:'10', precioUnitario:1180, valorUnitario:1000,
      igvPorcentaje:18, stock:9999, empresaId:2, codProdSunat:'80101500',
      atributosTecnicos:{ tipoProducto:'SERVICIO' },
    }});
    await p.productoStock.upsert({ where:{ productoId_sedeId:{ productoId:prod.id, sedeId:1 } }, update:{ stock:9999 }, create:{ productoId:prod.id, sedeId:1, stock:9999 } });
  }
  // product WITHOUT codProdSunat (service, to test the sinCodigo validation path)
  let prodNoCod = await p.producto.findFirst({ where:{ empresaId:2, codigo:'QA-SERV-NOCOD' } });
  if (!prodNoCod) {
    prodNoCod = await p.producto.create({ data:{
      codigo:'QA-SERV-NOCOD', descripcion:'SERVICIO SIN COD SUNAT QA',
      unidadMedidaId:1, tipoAfectacionIGV:'10', precioUnitario:1180, valorUnitario:1000,
      igvPorcentaje:18, stock:9999, empresaId:2, codProdSunat:null,
      atributosTecnicos:{ tipoProducto:'SERVICIO' },
    }});
    await p.productoStock.upsert({ where:{ productoId_sedeId:{ productoId:prodNoCod.id, sedeId:1 } }, update:{ stock:9999 }, create:{ productoId:prodNoCod.id, sedeId:1, stock:9999 } });
  }
  console.log('SERV_DET_ID='+prod.id, 'codProdSunat='+prod.codProdSunat);
  console.log('SERV_NOCOD_ID='+prodNoCod.id);
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
