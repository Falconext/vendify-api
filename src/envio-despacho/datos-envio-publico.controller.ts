/**
 * La página donde el cliente llena sus datos de envío, sin cuenta.
 *
 * Público a propósito, como el enlace del repartidor: el token es la
 * credencial y abre un solo despacho. Token inválido y enlace cerrado dan el
 * MISMO 404, para no confirmarle a nadie que un token existió. El
 * `empresaId` sale del token, nunca del request.
 */
import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { DatosEnvioClienteService } from './datos-cliente-envio.service';
import type { DatosClienteEntrada } from './datos-cliente-envio';

const CERRADO = 'Este enlace ya no está activo. Escríbele a la tienda por WhatsApp.';

@Controller('datos-envio')
export class DatosEnvioPublicoController {
  constructor(private readonly datos: DatosEnvioClienteService) {}

  @Get(':token')
  async ver(@Param('token') token: string) {
    const r = await this.datos.verPorToken(token);
    if (!r) throw new NotFoundException(CERRADO);
    return r;
  }

  @Get(':token/agencias/:courier')
  async agencias(@Param('token') token: string, @Param('courier') courier: string) {
    const r = await this.datos.agenciasPorToken(token, courier);
    if (!r) throw new NotFoundException(CERRADO);
    return r;
  }

  @Post(':token')
  async guardar(
    @Param('token') token: string,
    // Sin DTO de clase a propósito: el ValidationPipe global con whitelist
    // vaciaría el objeto. Se valida campo por campo en
    // `datosDelClienteParaDespacho`.
    @Body() body: DatosClienteEntrada,
  ) {
    const r = await this.datos.guardarPorToken(token, body ?? {});
    if (!r) throw new NotFoundException(CERRADO);
    return r;
  }
}
