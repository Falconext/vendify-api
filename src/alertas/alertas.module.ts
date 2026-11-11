import { Global, Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AlertasService } from './alertas.service';

@Global()
@Module({
  imports: [WhatsAppModule],
  providers: [AlertasService],
  exports: [AlertasService],
})
export class AlertasModule {}
