import { Module } from '@nestjs/common';
import { EnvioDespachoController } from './envio-despacho.controller';
import { EnvioDespachoService } from './envio-despacho.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RepartidorModule } from '../repartidor/repartidor.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { S3Module } from '../s3/s3.module';
import { EvidenciaEntregaService } from './evidencia-entrega.service';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ShalomModule } from '../shalom/shalom.module';
import { OlvaModule } from '../olva/olva.module';
import { DatosEnvioPublicoController } from './datos-envio-publico.controller';
import { DatosEnvioClienteService } from './datos-cliente-envio.service';

@Module({
  imports: [
    PrismaModule,
    RepartidorModule,
    WhatsAppModule,
    S3Module,
    NotificacionesModule,
    ShalomModule,
    OlvaModule,
  ],
  // `DatosEnvioPublicoController` va SIN guard a propósito: el cliente no tiene
  // cuenta y el token del enlace es su credencial. Ver `datos-cliente-envio.ts`.
  controllers: [EnvioDespachoController, DatosEnvioPublicoController],
  providers: [
    EnvioDespachoService,
    EvidenciaEntregaService,
    DatosEnvioClienteService,
  ],
  exports: [EnvioDespachoService, EvidenciaEntregaService],
})
export class EnvioDespachoModule {}
