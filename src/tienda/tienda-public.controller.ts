import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
} from '@nestjs/common';
import { TiendaService } from './tienda.service';
import { CrearPedidoDto } from './dto/crear-pedido.dto';
import { DisponibilidadCarritoDto } from './dto/disponibilidad-carrito.dto';
import { ModificadoresService } from '../modificadores/modificadores.service';

/**
 * `?sede=<id>`: sede elegida por el comprador. Solo cuenta si la tienda está en
 * modo CLIENTE; en SEDE y TODAS se ignora (ver stock-tienda.ts). Una sede que
 * no está habilitada cae a la de por defecto en las lecturas.
 */
@Controller('public/store')
export class TiendaPublicController {
  constructor(
    private readonly tiendaService: TiendaService,
    private readonly modificadoresService: ModificadoresService,
  ) {}

  @Get(':slug')
  async obtenerTienda(@Param('slug') slug: string) {
    return this.tiendaService.obtenerTiendaPorSlug(slug);
  }

  @Get(':slug/products')
  async obtenerProductos(
    @Param('slug') slug: string,
    @Query('page') page = '1',
    @Query('limit') limit = '30',
    @Query('search') search = '',
    @Query('category') category = '',
    @Query('minPrice') minPrice = '',
    @Query('maxPrice') maxPrice = '',
    @Query('brand') brand = '',
    @Query('wholesale') wholesale = '',
    @Query('sede') sede?: string,
    @Query('organo') organo = '',
    @Query('sistema') sistema = '',
  ) {
    const min =
      minPrice && !isNaN(Number(minPrice)) ? Number(minPrice) : undefined;
    const max =
      maxPrice && !isNaN(Number(maxPrice)) ? Number(maxPrice) : undefined;
    const isWholesale = wholesale === 'true';

    return this.tiendaService.obtenerProductosTienda(
      slug,
      Number(page) || 1,
      Number(limit) || 30,
      search,
      category,
      min,
      max,
      brand,
      isWholesale,
      sede,
      organo,
      sistema,
    );
  }

  @Get(':slug/categories')
  async obtenerCategorias(
    @Param('slug') slug: string,
    @Query('sede') sede?: string,
  ) {
    return this.tiendaService.obtenerCategoriasTienda(slug, sede);
  }

  @Get(':slug/brands')
  async obtenerMarcas(@Param('slug') slug: string, @Query('sede') sede?: string) {
    return this.tiendaService.obtenerMarcasTienda(slug, sede);
  }

  /** Chips del filtro "Órganos" y "Sistemas" (solo los que tiene el catálogo). */
  @Get(':slug/organos-sistemas')
  async obtenerOrganosSistemas(@Param('slug') slug: string, @Query('sede') sede?: string) {
    return this.tiendaService.obtenerOrganosSistemasTienda(slug, sede);
  }

  @Get(':slug/price-range')
  async obtenerRangoPrecios(
    @Param('slug') slug: string,
    @Query('sede') sede?: string,
  ) {
    return this.tiendaService.obtenerRangoPreciosTienda(slug, sede);
  }

  @Get(':slug/products/:id')
  async obtenerProductoDetalle(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query('sede') sede?: string,
  ) {
    return this.tiendaService.obtenerProductoDetalle(slug, +id, sede);
  }

  @Get(':slug/products/:id/reviews')
  async listarReviewsProducto(
    @Param('slug') slug: string,
    @Param('id') id: string,
  ) {
    return this.tiendaService.listarReviewsPublicas(slug, +id);
  }

  @Post(':slug/products/:id/reviews')
  async crearReviewProducto(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.tiendaService.crearReviewPublica(slug, +id, dto);
  }

  @Get(':slug/products/:id/related')
  async obtenerProductosRelacionados(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query('sede') sede?: string,
  ) {
    return this.tiendaService.obtenerProductosRelacionados(slug, +id, 10, sede);
  }

  @Get(':slug/payment-config')
  async obtenerConfiguracionPago(@Param('slug') slug: string) {
    return this.tiendaService.obtenerConfiguracionPago(slug);
  }

  @Get(':slug/shipping-config')
  async obtenerConfiguracionEnvio(@Param('slug') slug: string) {
    return this.tiendaService.obtenerConfiguracionEnvioPublica(slug);
  }

  /** Agencias de Shalom u Olva para elegir dónde recoger (solo las que la tienda ofrece). */
  @Get(':slug/agencias/:courier')
  async agencias(@Param('slug') slug: string, @Param('courier') courier: string) {
    return this.tiendaService.agenciasParaTienda(slug, courier);
  }

  @Get('track/:codigo')
  async rastrearPedido(@Param('codigo') codigo: string) {
    return this.tiendaService.obtenerPedidoPorCodigo(codigo);
  }

  // ==================== COMBOS ====================

  @Get(':slug/combos')
  async obtenerCombos(@Param('slug') slug: string, @Query('sede') sede?: string) {
    return this.tiendaService.obtenerCombosTienda(slug, sede);
  }

  @Get(':slug/combos/:id')
  async obtenerComboDetalle(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query('sede') sede?: string,
  ) {
    return this.tiendaService.obtenerComboDetalle(slug, +id, sede);
  }

  @Get(':slug/combos/:id/stock')
  async verificarStockCombo(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query('sede') sede?: string,
  ) {
    return this.tiendaService.verificarStockCombo(slug, +id, sede);
  }

  /** Revalida el carrito con el stock de la sede (o del modo de la tienda). */
  @Post(':slug/carrito/disponibilidad')
  @HttpCode(200)
  async disponibilidadCarrito(
    @Param('slug') slug: string,
    @Body() dto: DisponibilidadCarritoDto,
  ) {
    return this.tiendaService.disponibilidadCarrito(slug, dto);
  }

  // ==================== MODIFICADORES ====================

  @Get(':slug/products/:id/modifiers')
  async obtenerModificadoresProducto(
    @Param('slug') slug: string,
    @Param('id') id: string,
  ) {
    // slug se usa para validar que el producto pertenece a esa tienda
    return this.modificadoresService.obtenerModificadoresProductoPublico(+id);
  }

  // ==================== PEDIDOS ====================

  @Post(':slug/orders')
  async crearPedido(@Param('slug') slug: string, @Body() dto: CrearPedidoDto) {
    return this.tiendaService.crearPedido(slug, dto);
  }
}
