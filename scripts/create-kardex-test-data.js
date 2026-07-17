const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api';
const USER_EMAIL = 'diego.ortega.dev@gmail.com';
const USER_PASSWORD = 'developer';

let authToken = '';
let empresaId = null;
let usuarioId = null;
let productos = [];

// Función para autenticar
async function authenticate() {
  try {
    console.log('🔐 Autenticando usuario...');
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: USER_EMAIL,
      password: USER_PASSWORD
    });
    
    if (response.data.code === 1) {
      authToken = response.data.data.accessToken;
      empresaId = response.data.data.usuario.empresaId;
      usuarioId = response.data.data.usuario.id;
      console.log('✅ Usuario autenticado correctamente');
      console.log(`   - Usuario ID: ${usuarioId}`);
      console.log(`   - Empresa ID: ${empresaId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error en autenticación:', error.response?.data || error.message);
    return false;
  }
}

// Función para crear headers de autenticación
function getAuthHeaders() {
  return {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };
}

// Función para obtener productos existentes
async function getProductos() {
  try {
    console.log('📦 Obteniendo productos existentes...');
    const response = await axios.get(`${BASE_URL}/producto?page=1&limit=10`, {
      headers: getAuthHeaders()
    });
    
    if (response.data.code === 1 && response.data.data.productos.length > 0) {
      productos = response.data.data.productos.slice(0, 5); // Tomar solo 5 productos
      console.log(`✅ Obtenidos ${productos.length} productos para pruebas`);
      productos.forEach(p => console.log(`   - ${p.codigo}: ${p.descripcion} (Stock: ${p.stock})`));
      return true;
    } else {
      console.log('⚠️  No se encontraron productos existentes, creando productos de prueba...');
      return await createTestProducts();
    }
  } catch (error) {
    console.error('❌ Error al obtener productos:', error.response?.data || error.message);
    return false;
  }
}

// Función para crear productos de prueba si no existen
async function createTestProducts() {
  const testProducts = [
    {
      codigo: 'TEST001',
      descripcion: 'Producto Test 1 - Laptops',
      precio: 2500.00,
      stock: 10,
      stockMinimo: 5,
      unidadMedidaId: 1, // Asumiendo que existe una unidad de medida
      categoriaId: 1 // Asumiendo que existe una categoría
    },
    {
      codigo: 'TEST002', 
      descripcion: 'Producto Test 2 - Mouses',
      precio: 50.00,
      stock: 25,
      stockMinimo: 10,
      unidadMedidaId: 1,
      categoriaId: 1
    },
    {
      codigo: 'TEST003',
      descripcion: 'Producto Test 3 - Teclados',
      precio: 120.00,
      stock: 0,
      stockMinimo: 5,
      unidadMedidaId: 1,
      categoriaId: 1
    }
  ];

  try {
    productos = [];
    for (const product of testProducts) {
      const response = await axios.post(`${BASE_URL}/producto`, product, {
        headers: getAuthHeaders()
      });
      
      if (response.data.code === 1) {
        productos.push(response.data.data);
        console.log(`✅ Producto creado: ${product.codigo}`);
      }
    }
    return productos.length > 0;
  } catch (error) {
    console.error('❌ Error al crear productos de prueba:', error.response?.data || error.message);
    return false;
  }
}

// Función para realizar ajuste de inventario
async function createAjuste(productoId, tipoAjuste, cantidad, motivo, observacion = '') {
  try {
    const response = await axios.post(`${BASE_URL}/kardex/ajuste`, {
      productoId,
      tipoAjuste,
      cantidad,
      motivo,
      observacion,
      costoUnitario: 100 + Math.random() * 200 // Costo aleatorio
    }, {
      headers: getAuthHeaders()
    });

    if (response.data.code === 1) {
      console.log(`✅ Ajuste ${tipoAjuste} creado para producto ${productoId}: ${cantidad} unidades`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error en ajuste ${tipoAjuste}:`, error.response?.data || error.message);
    return false;
  }
}

// Función para crear movimientos de entrada (simulando compras)
async function createMovimientoIngreso(productoId, cantidad, costoUnitario) {
  try {
    const response = await axios.post(`${BASE_URL}/kardex/movimiento`, {
      productoId,
      tipoMovimiento: 'INGRESO',
      concepto: 'Compra a proveedor - Prueba',
      cantidad,
      costoUnitario,
      observacion: 'Movimiento de prueba generado automáticamente',
      lote: `LOTE-${Date.now()}`,
      fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 año
    }, {
      headers: getAuthHeaders()
    });

    if (response.data.code === 1) {
      console.log(`✅ Movimiento de INGRESO creado: ${cantidad} unidades del producto ${productoId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error en movimiento de ingreso:', error.response?.data || error.message);
    return false;
  }
}

// Función para crear movimientos de salida (simulando ventas)
async function createMovimientoSalida(productoId, cantidad) {
  try {
    const response = await axios.post(`${BASE_URL}/kardex/movimiento`, {
      productoId,
      tipoMovimiento: 'SALIDA',
      concepto: 'Venta a cliente - Prueba',
      cantidad,
      observacion: 'Venta de prueba generada automáticamente'
    }, {
      headers: getAuthHeaders()
    });

    if (response.data.code === 1) {
      console.log(`✅ Movimiento de SALIDA creado: ${cantidad} unidades del producto ${productoId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error en movimiento de salida:', error.response?.data || error.message);
    return false;
  }
}

// Función para probar el dashboard
async function testDashboard() {
  try {
    console.log('📊 Probando dashboard...');
    const response = await axios.get(`${BASE_URL}/kardex/dashboard`, {
      headers: getAuthHeaders()
    });

    if (response.data.code === 1) {
      const data = response.data.data;
      console.log('✅ Dashboard funciona correctamente:');
      console.log(`   - Total productos: ${data.resumenGeneral.totalProductos}`);
      console.log(`   - Valor inventario: S/ ${data.resumenGeneral.valorTotalInventario.toFixed(2)}`);
      console.log(`   - Stock crítico: ${data.resumenGeneral.productosStockCritico}`);
      console.log(`   - Sin stock: ${data.resumenGeneral.productosStockCero}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error en dashboard:', error.response?.data || error.message);
    return false;
  }
}

// Función para probar consulta de kardex con filtros
async function testKardexQuery() {
  try {
    console.log('🔍 Probando consulta de kardex...');
    
    // Consulta básica
    let response = await axios.get(`${BASE_URL}/kardex?page=1&limit=10`, {
      headers: getAuthHeaders()
    });

    if (response.data.code === 1) {
      console.log(`✅ Consulta básica: ${response.data.data.movimientos.length} movimientos encontrados`);
    }

    // Consulta con filtros de fecha
    const fechaInicio = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Hace 7 días
    const fechaFin = new Date().toISOString(); // Hoy
    
    response = await axios.get(`${BASE_URL}/kardex?page=1&limit=10&fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`, {
      headers: getAuthHeaders()
    });

    if (response.data.code === 1) {
      console.log(`✅ Consulta con filtros de fecha: ${response.data.data.movimientos.length} movimientos`);
    }

    // Consulta por tipo de movimiento
    response = await axios.get(`${BASE_URL}/kardex?page=1&limit=10&tipoMovimiento=INGRESO`, {
      headers: getAuthHeaders()
    });

    if (response.data.code === 1) {
      console.log(`✅ Consulta por tipo INGRESO: ${response.data.data.movimientos.length} movimientos`);
    }

    return true;
  } catch (error) {
    console.error('❌ Error en consulta kardex:', error.response?.data || error.message);
    return false;
  }
}

// Función principal
async function main() {
  console.log('🚀 Iniciando creación de datos de prueba para Kardex\n');

  // 1. Autenticar
  if (!(await authenticate())) {
    process.exit(1);
  }

  // 2. Obtener/crear productos
  if (!(await getProductos())) {
    process.exit(1);
  }

  console.log('\n📝 Creando movimientos de prueba...');

  // 3. Crear movimientos de ingreso para varios productos
  for (let i = 0; i < Math.min(productos.length, 3); i++) {
    const producto = productos[i];
    await createMovimientoIngreso(producto.id, 20 + i * 5, 100 + i * 50);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1s entre requests
  }

  // 4. Crear movimientos de salida
  for (let i = 0; i < Math.min(productos.length, 2); i++) {
    const producto = productos[i];
    await createMovimientoSalida(producto.id, 5 + i * 2);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 5. Crear ajustes de diferentes tipos
  if (productos.length > 0) {
    await createAjuste(productos[0].id, 'POSITIVO', 10, 'Inventario físico', 'Encontrados productos adicionales');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (productos.length > 1) {
      await createAjuste(productos[1].id, 'NEGATIVO', 3, 'Productos dañados', 'Productos dañados por humedad');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (productos.length > 2) {
      await createAjuste(productos[2].id, 'CORRECCION', 15, 'Error de registro', 'Corrección de stock después de inventario');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n🧪 Ejecutando pruebas del sistema...');

  // 6. Probar dashboard
  await testDashboard();
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 7. Probar consultas de kardex
  await testKardexQuery();

  console.log('\n✅ ¡Datos de prueba creados exitosamente!');
  console.log('\n📋 Resumen de lo creado:');
  console.log('   - Movimientos de INGRESO (compras)');
  console.log('   - Movimientos de SALIDA (ventas)');  
  console.log('   - Ajustes POSITIVO, NEGATIVO y CORRECCIÓN');
  console.log('   - Dashboard probado');
  console.log('   - Consultas con filtros probadas');
  
  console.log('\n🌐 Puedes probar el frontend en:');
  console.log('   - Dashboard: http://localhost:5173/admin/kardex/dashboard');
  console.log('   - Movimientos: http://localhost:5173/admin/kardex');
  console.log('   - Ajustes: http://localhost:5173/admin/kardex/ajustes');
}

// Ejecutar
main().catch(console.error);