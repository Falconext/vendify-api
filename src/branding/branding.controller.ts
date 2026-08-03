import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BrandingService } from './branding.service';

@Controller('branding')
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  // Lista pública de resellers con marca blanca activa. Devuelve solo campos
  // seguros de marca (nombre, dominio, logo, colores) para poblar vitrinas de
  // prueba social como el "brand strip" del landing de partners. Sin auth.
  @Get('showcase')
  async getShowcase(@Res({ passthrough: true }) res: Response) {
    const brands = await this.brandingService.getShowcase();
    res.locals.message = 'Marcas cargadas';
    return brands;
  }

  @Get('public')
  async getPublicBranding(
    @Query('host') host: string | undefined,
    @Query('resellerId') resellerId: string | undefined,
    @Headers('host') headerHost: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsedResellerId = resellerId ? parseInt(resellerId, 10) : NaN;
    const branding = !isNaN(parsedResellerId)
      ? await this.brandingService.getPublicBrandingByResellerId(
          parsedResellerId,
        )
      : await this.brandingService.getPublicBranding(host || headerHost);
    res.locals.message = 'Branding cargado';
    return branding;
  }
}
