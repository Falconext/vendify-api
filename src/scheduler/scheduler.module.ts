import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { VerificarPendientesSunatService } from './services/verificar-pendientes-sunat.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ComprobanteModule } from '../comprobante/comprobante.module';
import { ResellerModule } from '../reseller/reseller.module';
import { S3Module } from '../s3/s3.module';
import { GuiaRemisionModule } from '../guia-remision/guia-remision.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { VerificarEnviosOlvaService } from './services/verificar-envios-olva.service';
import { OlvaModule } from '../olva/olva.module';
import { EnvioDespachoModule } from '../envio-despacho/envio-despacho.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    NotificacionesModule,
    forwardRef(() => ComprobanteModule),
    forwardRef(() => GuiaRemisionModule),
    ResellerModule,
    S3Module,
    WhatsAppModule,
    OlvaModule,
    EnvioDespachoModule,
  ],
  providers: [
    SchedulerService,
    VerificarPendientesSunatService,
    VerificarEnviosOlvaService,
    PrismaService,
  ],
  exports: [VerificarPendientesSunatService, VerificarEnviosOlvaService],
})
export class SchedulerModule {}
