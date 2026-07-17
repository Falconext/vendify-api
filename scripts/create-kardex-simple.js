const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Creando datos de prueba Kardex con Prisma...\n');

  try {
    // 1. Obtener productos existentes
    const productos = await prisma.producto.findMany({
      take: 5,
      include: {
        unidadMedida: true,
        categoria: true
      }
    });

    if (productos.length === 0) {
      console.log('❌ No hay productos en la base de datos');
      return;
    }

    console.log(`📦 Usando ${productos.length} productos existentes:`);
    productos.forEach(p => {
      console.log(`   - ${p.codigo}: Stock actual ${p.stock}`);
    });

    // 2. Usuario ID (usar el ID 2 que encontramos antes)
    const usuarioId = 2;
    const empresaId = 1;

    console.log('\n📝 Creando movimientos de INGRESO...');
    
    // 3. Crear movimientos de INGRESO para cada producto
    for (let i = 0; i < productos.length; i++) {
      const producto = productos[i];
      const cantidad = 20 + (i * 5);
      const costoUnitario = 100 + (i * 50);
      
      const movimiento = await prisma.movimientoKardex.create({
        data: {
          productoId: producto.id,
          usuarioId: usuarioId,
          empresaId: empresaId,
          tipoMovimiento: 'INGRESO',
          concepto: `Compra inicial - Producto ${producto.codigo}`,
          cantidad: cantidad,
          stockAnterior: producto.stock,
          stockActual: producto.stock + cantidad,
          costoUnitario: costoUnitario,
          valorTotal: cantidad * costoUnitario,
          observacion: 'Ingreso de prueba generado automáticamente',
          lote: `LOTE-${Date.now()}-${i}`,
          fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
        }
      });

      // Actualizar stock del producto
      await prisma.producto.update({
        where: { id: producto.id },
        data: { stock: producto.stock + cantidad }
      });

      console.log(`✅ INGRESO creado: ${cantidad} unidades de ${producto.codigo} (Costo: S/ ${costoUnitario})`);
      
      // Actualizar referencia local
      productos[i].stock += cantidad;
    }

    console.log('\n📝 Creando movimientos de SALIDA...');
    
    // 4. Crear movimientos de SALIDA para algunos productos
    for (let i = 0; i < Math.min(productos.length, 3); i++) {
      const producto = productos[i];
      const cantidadSalida = 5 + (i * 3);
      
      if (producto.stock >= cantidadSalida) {
        const movimiento = await prisma.movimientoKardex.create({
          data: {
            productoId: producto.id,
            usuarioId: usuarioId,
            empresaId: empresaId,
            tipoMovimiento: 'SALIDA',
            concepto: `Venta - Cliente ${i + 1}`,
            cantidad: cantidadSalida,
            stockAnterior: producto.stock,
            stockActual: producto.stock - cantidadSalida,
            costoUnitario: 100 + (i * 50), // Mismo costo de compra
            valorTotal: cantidadSalida * (100 + (i * 50)),
            observacion: 'Venta de prueba generada automáticamente'
          }
        });

        // Actualizar stock del producto
        await prisma.producto.update({
          where: { id: producto.id },
          data: { stock: producto.stock - cantidadSalida }
        });

        console.log(`✅ SALIDA creada: ${cantidadSalida} unidades de ${producto.codigo}`);
        
        // Actualizar referencia local
        productos[i].stock -= cantidadSalida;
      }
    }

    console.log('\n📝 Creando AJUSTES de inventario...');
    
    // 5. Crear ajustes de diferentes tipos
    if (productos.length > 0) {
      // Ajuste POSITIVO
      const producto1 = productos[0];
      const ajustePositivo = await prisma.movimientoKardex.create({
        data: {
          productoId: producto1.id,
          usuarioId: usuarioId,
          empresaId: empresaId,
          tipoMovimiento: 'AJUSTE',
          concepto: 'Ajuste Positivo - Inventario físico',
          cantidad: 10,
          stockAnterior: producto1.stock,
          stockActual: producto1.stock + 10,
          costoUnitario: 120,
          valorTotal: 10 * 120,
          observacion: 'Productos encontrados durante inventario físico'
        }
      });

      await prisma.producto.update({
        where: { id: producto1.id },
        data: { stock: producto1.stock + 10 }
      });

      console.log(`✅ AJUSTE POSITIVO: +10 unidades de ${producto1.codigo}`);
    }

    if (productos.length > 1) {
      // Ajuste NEGATIVO
      const producto2 = productos[1];
      const cantidadNegativa = 5;
      
      if (producto2.stock >= cantidadNegativa) {
        const ajusteNegativo = await prisma.movimientoKardex.create({
          data: {
            productoId: producto2.id,
            usuarioId: usuarioId,
            empresaId: empresaId,
            tipoMovimiento: 'AJUSTE',
            concepto: 'Ajuste Negativo - Productos dañados',
            cantidad: cantidadNegativa,
            stockAnterior: producto2.stock,
            stockActual: producto2.stock - cantidadNegativa,
            costoUnitario: 150,
            valorTotal: cantidadNegativa * 150,
            observacion: 'Productos dañados por humedad detectados en inventario'
          }
        });

        await prisma.producto.update({
          where: { id: producto2.id },
          data: { stock: producto2.stock - cantidadNegativa }
        });

        console.log(`✅ AJUSTE NEGATIVO: -${cantidadNegativa} unidades de ${producto2.codigo}`);
      }
    }

    if (productos.length > 2) {
      // Corrección de stock
      const producto3 = productos[2];
      const stockCorrecto = 25;
      
      const correccion = await prisma.movimientoKardex.create({
        data: {
          productoId: producto3.id,
          usuarioId: usuarioId,
          empresaId: empresaId,
          tipoMovimiento: 'AJUSTE',
          concepto: 'Corrección de Stock - Error de registro',
          cantidad: Math.abs(stockCorrecto - producto3.stock),
          stockAnterior: producto3.stock,
          stockActual: stockCorrecto,
          costoUnitario: 200,
          valorTotal: Math.abs(stockCorrecto - producto3.stock) * 200,
          observacion: 'Corrección de stock después de auditoria'
        }
      });

      await prisma.producto.update({
        where: { id: producto3.id },
        data: { stock: stockCorrecto }
      });

      console.log(`✅ CORRECCIÓN DE STOCK: ${producto3.codigo} ajustado a ${stockCorrecto} unidades`);
    }

    // 6. Verificar resultados
    console.log('\n📊 Verificando resultados...');
    
    const totalMovimientos = await prisma.movimientoKardex.count();
    console.log(`✅ Total movimientos creados: ${totalMovimientos}`);
    
    const movimientosPorTipo = await prisma.movimientoKardex.groupBy({
      by: ['tipoMovimiento'],
      _count: {
        tipoMovimiento: true
      }
    });
    
    console.log('📈 Resumen por tipo:');
    movimientosPorTipo.forEach(tipo => {
      console.log(`   - ${tipo.tipoMovimiento}: ${tipo._count.tipoMovimiento} movimientos`);
    });

    // 7. Mostrar productos finales
    const productosFinales = await prisma.producto.findMany({
      where: {
        id: { in: productos.map(p => p.id) }
      },
      include: {
        unidadMedida: true
      }
    });

    console.log('\n📦 Stock final de productos:');
    productosFinales.forEach(p => {
      console.log(`   - ${p.codigo}: ${p.stock} ${p.unidadMedida.codigo}`);
    });

    console.log('\n✅ ¡Datos de prueba creados exitosamente!');
    console.log('\n🌐 Ahora puedes probar el frontend en:');
    console.log('   - Dashboard: http://localhost:5173/admin/kardex/dashboard');
    console.log('   - Movimientos: http://localhost:5173/admin/kardex');
    console.log('   - Ajustes: http://localhost:5173/admin/kardex/ajustes');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();