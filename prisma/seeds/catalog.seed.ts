
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export const catalogoBodega = [
    { nombre: 'Arroz Costeño Extra 750g', descripcion: 'Arroz superior, bolsa de 750g', precioSugerido: 4.50, unidadConteo: 'NIU' },
    { nombre: 'Azúcar Rubia Cartavio 1kg', descripcion: 'Azúcar rubia doméstica', precioSugerido: 3.80, unidadConteo: 'NIU' },
    { nombre: 'Leche Gloria Azul 400g', descripcion: 'Leche evaporada entera', precioSugerido: 4.20, unidadConteo: 'NIU' },
    { nombre: 'Aceite Primor 1L', descripcion: 'Aceite vegetal botella 1 litro', precioSugerido: 12.50, unidadConteo: 'NIU' },
    { nombre: 'Coca Cola 500ml', descripcion: 'Gaseosa sabor original', precioSugerido: 3.00, unidadConteo: 'NIU' },
    { nombre: 'Inca Kola 1.5L', descripcion: 'La bebida del Perú', precioSugerido: 7.50, unidadConteo: 'NIU' },
    { nombre: 'Galleta Soda San Jorge', descripcion: 'Paquete familiar', precioSugerido: 2.50, unidadConteo: 'NIU' },
    { nombre: 'Atún Florida Filete', descripcion: 'Filete de atún en aceite', precioSugerido: 6.50, unidadConteo: 'NIU' },
];

export const catalogoFerreteria = [
    { nombre: 'Cemento Sol 42.5kg', descripcion: 'Cemento Portland Tipo I', precioSugerido: 28.50, unidadConteo: 'NIU' },
    { nombre: 'Fierro Corrugado 1/2" Aceros Arequipa', descripcion: 'Varilla de construcción', precioSugerido: 45.00, unidadConteo: 'NIU' },
    { nombre: 'Ladrillo King Kong 18 huecos', descripcion: 'Ladrillo para muros portantes', precioSugerido: 1.20, unidadConteo: 'NIU' },
    { nombre: 'Pintura Vencelatex Blanco', descripcion: 'Galón de pintura látex lavable', precioSugerido: 45.00, unidadConteo: 'GLN' },
    { nombre: 'Thinner Acrílico Vencedor', descripcion: 'Botella 1 litro', precioSugerido: 15.00, unidadConteo: 'NIU' },
    { nombre: 'Clavos 2" con cabeza', descripcion: 'Caja x 1kg', precioSugerido: 8.00, unidadConteo: 'KG' },
    { nombre: 'Martillo Truper 16oz', descripcion: 'Martillo uña curva mango madera', precioSugerido: 25.00, unidadConteo: 'NIU' },
    { nombre: 'Cinta Aislante 3M', descripcion: 'Rollo 20m negro', precioSugerido: 4.50, unidadConteo: 'NIU' },
];

export const catalogoFarmacia = [
    // ANALGÉSICOS Y ANTIINFLAMATORIOS
    { nombre: 'Paracetamol 500mg', descripcion: 'Caja x 100 tabletas (Generico)', precioSugerido: 10.00, unidadConteo: 'CJA' },
    { nombre: 'Panadol Forte 500mg', descripcion: 'Caja x 100 tabletas', precioSugerido: 80.00, unidadConteo: 'CJA' },
    { nombre: 'Ibuprofeno 400mg', descripcion: 'Caja x 100 tabletas (Generico)', precioSugerido: 12.00, unidadConteo: 'CJA' },
    { nombre: 'Doloflam 550mg', descripcion: 'Naproxeno Sodico, Caja x 100', precioSugerido: 60.00, unidadConteo: 'CJA' },
    { nombre: 'Aspirina 100mg', descripcion: 'Caja x 100 tabletas', precioSugerido: 45.00, unidadConteo: 'CJA' },
    { nombre: 'Apronax 275mg', descripcion: 'Caja x 20 tabletas', precioSugerido: 25.00, unidadConteo: 'CJA' },

    // ANTIBIÓTICOS (Solo Venta con Receta)
    { nombre: 'Amoxicilina 500mg', descripcion: 'Caja x 100 cápsulas', precioSugerido: 30.00, unidadConteo: 'CJA' },
    { nombre: 'Azitromicina 500mg', descripcion: 'Caja x 5 tabletas', precioSugerido: 15.00, unidadConteo: 'CJA' },
    { nombre: 'Ciprofloxacino 500mg', descripcion: 'Caja x 100 tabletas', precioSugerido: 35.00, unidadConteo: 'CJA' },

    // RESPIRATORIO Y ALERGIAS
    { nombre: 'Cetirizina 10mg', descripcion: 'Caja x 100 tabletas', precioSugerido: 20.00, unidadConteo: 'CJA' },
    { nombre: 'Loratadina 10mg', descripcion: 'Caja x 100 tabletas', precioSugerido: 18.00, unidadConteo: 'CJA' },
    { nombre: 'Jarabe para la tos Abrilar', descripcion: 'Frasco 100ml', precioSugerido: 35.00, unidadConteo: 'NIU' },
    { nombre: 'Vick Vaporub 50g', descripcion: 'Ungüento tópico', precioSugerido: 12.00, unidadConteo: 'NIU' },

    // ESTOMACALES
    { nombre: 'Omeprazol 20mg', descripcion: 'Caja x 100 cápsulas', precioSugerido: 15.00, unidadConteo: 'CJA' },
    { nombre: 'Sal de Andrews', descripcion: 'Caja x 50 sobres', precioSugerido: 25.00, unidadConteo: 'CJA' },
    { nombre: 'Bismutol', descripcion: 'Frasco 150ml', precioSugerido: 18.00, unidadConteo: 'NIU' },
    { nombre: 'Gastrozepina', descripcion: 'Caja x 30 tabletas', precioSugerido: 40.00, unidadConteo: 'CJA' },

    // PRIMEROS AUXILIOS
    { nombre: 'Alcohol Medicinal 96° 1L', descripcion: 'Botella 1 litro', precioSugerido: 12.00, unidadConteo: 'NIU' },
    { nombre: 'Agua Oxigenada 120ml', descripcion: 'Frasco', precioSugerido: 3.00, unidadConteo: 'NIU' },
    { nombre: 'Algodón Hidrófilo 50g', descripcion: 'Bolsa pequeña', precioSugerido: 2.50, unidadConteo: 'NIU' },
    { nombre: 'Gasa Estéril 10x10', descripcion: 'Sobre individual', precioSugerido: 1.00, unidadConteo: 'NIU' },
    { nombre: 'Curitas Band-Aid', descripcion: 'Caja x 100 unidades', precioSugerido: 15.00, unidadConteo: 'CJA' },
    { nombre: 'Venda Elástica 4x5', descripcion: 'Unidad', precioSugerido: 5.00, unidadConteo: 'NIU' },

    // CUIDADO PERSONAL E HIGIENE
    { nombre: 'Pasta Dental Colgate Total 12', descripcion: 'Tubo 100ml', precioSugerido: 8.50, unidadConteo: 'NIU' },
    { nombre: 'Cepillo Dental Oral-B medio', descripcion: 'Unidad', precioSugerido: 5.00, unidadConteo: 'NIU' },
    { nombre: 'Jabón Antibacterial Protex', descripcion: 'Barra 100g', precioSugerido: 3.50, unidadConteo: 'NIU' },
    { nombre: 'Shampoo H&S Control Caspa', descripcion: 'Frasco 375ml', precioSugerido: 18.00, unidadConteo: 'NIU' },
    { nombre: 'Desodorante Rexona Clinical', descripcion: 'Barra', precioSugerido: 22.00, unidadConteo: 'NIU' },
    { nombre: 'Toallas Higiénicas Nosotras', descripcion: 'Paquete x 10', precioSugerido: 6.50, unidadConteo: 'NIU' },

    // BEBÉS Y MATERNIDAD
    { nombre: 'Pañales Huggies Talla M', descripcion: 'Paquete x 50 unidades', precioSugerido: 45.00, unidadConteo: 'NIU' },
    { nombre: 'Pañales Pampers RN', descripcion: 'Paquete x 20 unidades', precioSugerido: 25.00, unidadConteo: 'NIU' },
    { nombre: 'Fórmula Enfamil 1', descripcion: 'Lata 400g', precioSugerido: 65.00, unidadConteo: 'NIU' },
    { nombre: 'Toallitas Húmedas Huggies', descripcion: 'Paquete x 80', precioSugerido: 10.00, unidadConteo: 'NIU' },
    { nombre: 'Shampoo Johnson Baby', descripcion: 'Frasco 400ml', precioSugerido: 15.00, unidadConteo: 'NIU' },

    // VITAMINAS Y SUPLEMENTOS
    { nombre: 'Vitamina C 1000mg', descripcion: 'Tubo x 10 efervescentes', precioSugerido: 12.00, unidadConteo: 'NIU' },
    { nombre: 'Neurobion', descripcion: 'Caja x 3 ampollas', precioSugerido: 35.00, unidadConteo: 'CJA' },
    { nombre: 'Ensure Advance Vainilla', descripcion: 'Lata 400g', precioSugerido: 68.00, unidadConteo: 'NIU' },
    { nombre: 'Magnesol', descripcion: 'Caja x 33 sobres', precioSugerido: 30.00, unidadConteo: 'CJA' },

    // DERMOCOSMÉTICA
    { nombre: 'Bloqueador Solar Eucerin 50+', descripcion: 'Frasco 50ml', precioSugerido: 85.00, unidadConteo: 'NIU' },
    { nombre: 'Agua Micelar Garnier', descripcion: 'Frasco 400ml', precioSugerido: 25.00, unidadConteo: 'NIU' },
    { nombre: 'Crema Hidratante Nivea', descripcion: 'Lata azul 150ml', precioSugerido: 12.00, unidadConteo: 'NIU' },
];

export async function seedCatalog(prisma: PrismaClient) {
    console.log('🌱 Seeding Global Catalog...');

    // 1. Get or Create Rubros
    const rubroBodega = await prisma.rubro.upsert({ where: { nombre: 'Bodega' }, update: {}, create: { nombre: 'Bodega' } });
    const rubroFerreteria = await prisma.rubro.upsert({ where: { nombre: 'Ferreteria' }, update: {}, create: { nombre: 'Ferreteria' } });
    const rubroFarmacia = await prisma.rubro.upsert({ where: { nombre: 'Farmacia' }, update: {}, create: { nombre: 'Farmacia' } });

    // 2. Seed Products for Bodega
    for (const prod of catalogoBodega) {
        const exists = await prisma.productoPlantilla.findFirst({
            where: { nombre: prod.nombre, rubroId: rubroBodega.id }
        });
        if (!exists) {
            await prisma.productoPlantilla.create({
                data: { ...prod, rubroId: rubroBodega.id }
            });
        }
    }

    // 3. Seed Products for Ferreteria
    for (const prod of catalogoFerreteria) {
        const exists = await prisma.productoPlantilla.findFirst({
            where: { nombre: prod.nombre, rubroId: rubroFerreteria.id }
        });
        if (!exists) {
            await prisma.productoPlantilla.create({
                data: { ...prod, rubroId: rubroFerreteria.id }
            });
        }
    }

    // 4. Seed Products for Farmacia
    const jsonPath = path.join(process.cwd(), 'catalogo_farmacia_real.json');
    let farmaciaData: any[] = catalogoFarmacia;

    if (fs.existsSync(jsonPath)) {
        try {
            const fileContent = fs.readFileSync(jsonPath, 'utf-8');
            const realCatalog = JSON.parse(fileContent);
            console.log(`📦 Encontrado catalogo_farmacia_real.json con ${realCatalog.length} productos.`);
            farmaciaData = realCatalog;
        } catch (error) {
            console.error('Error leyendo catalogo_farmacia_real.json, usando fallback:', error);
        }
    } else {
        console.log('⚠️ No se encontró catalogo_farmacia_real.json, usando catálogo de muestra.');
    }

    console.log('⏳ Procesando productos de farmacia (Upsert seguro)...');
    let currentCode = 1;
    let addedCount = 0;

    for (const prod of farmaciaData) {
        // Verificar si ya existe por nombre para NO duplicar ni afectar existentes
        const exists = await prisma.productoPlantilla.findFirst({
            where: { nombre: prod.nombre, rubroId: rubroFarmacia.id }
        });

        if (!exists) {
            // Generar código secuencial FAR0001, FAR0002...
            const codigo = `FAR${currentCode.toString().padStart(4, '0')}`;
            // Remover campos que no estén en el esquema si vienen del JSON
            const { esGenerico, ...validData } = prod;

            try {
                await prisma.productoPlantilla.create({
                    data: {
                        nombre: validData.nombre,
                        descripcion: validData.descripcion,
                        precioSugerido: validData.precioSugerido || 0,
                        unidadConteo: validData.unidadConteo || 'NIU',
                        imagenUrl: validData.imagenUrl || null,
                        rubroId: rubroFarmacia.id,
                        codigo: codigo
                    }
                });
                addedCount++;
                currentCode++;
            } catch (e) {
                console.warn(`Error insertando ${validData.nombre}:`, e);
            }
        } else {
            // Si ya existe, simplemente saltamos. No afectamos nada.
        }
    }
    console.log(`✅ Farmacia procesada: ${addedCount} nuevos productos agregados.`);

    console.log('✅ Global Catalog seeded successfully');
}
