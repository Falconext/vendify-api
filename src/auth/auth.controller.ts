import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Optional,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AlertasService } from '../alertas/alertas.service';
import { clientIp } from '../common/security/rate-limit.middleware';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { Request, Response } from 'express';
import { User } from '../common/decorators/user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    // Opcional: los specs arman el controlador solo con AuthService.
    @Optional() private readonly alertas?: AlertasService,
  ) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') origin: string,
    @Req() req?: Request,
  ) {
    const ip = req ? clientIp(req) : undefined;
    const ua = req?.headers?.['user-agent'];
    let result: Awaited<ReturnType<AuthService['login']>>;
    try {
      result = await this.authService.login(dto, origin);
    } catch (e) {
      if (e instanceof UnauthorizedException)
        void this.alertas?.claveEquivocada(dto?.email, ip);
      throw e;
    }
    // Avisa si un administrador del sistema entró desde un equipo nuevo. No se
    // espera: el aviso no demora el inicio de sesión.
    if ((result as any)?.accessToken && (result as any)?.usuario)
      void this.alertas?.entradaCorrecta((result as any).usuario, ua, ip);
    res.locals.message = 'Inicio de sesión exitoso';
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('select-sede')
  async selectSede(
    @User() user: any,
    @Body('sedeId') sedeId: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.selectSede(
      user.id ?? user.sub,
      Number(sedeId),
    );
    res.locals.message = 'Sede seleccionada correctamente';
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@User() user: any) {
    const usuario = await this.authService.obtenerUsuarioActual(
      user.id ?? user.sub,
    );
    return usuario;
  }

  @UseGuards(JwtAuthGuard)
  @Get('perfil')
  async perfil(@User() user: any) {
    const perfil = await this.authService.obtenerPerfilCompleto(
      user.id ?? user.sub,
    );
    return perfil;
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refresh(dto.refreshToken);
    res.locals.message = 'Refresh exitoso';
    return tokens;
  }

  @HttpCode(200)
  @Post('forgot-password')
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Headers('origin') origin?: string,
    @Headers('host') host?: string,
  ) {
    await this.authService.forgotPassword(dto.email, dto.brand, origin || host);
    return {
      message:
        'Si el correo existe, recibirás un enlace de recuperación en breve.',
    };
  }

  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return {
      message:
        'Contraseña actualizada correctamente. Ya puedes iniciar sesión.',
    };
  }
}
