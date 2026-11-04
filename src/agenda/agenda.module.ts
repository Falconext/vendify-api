import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { AgendaRecordatoriosService } from './agenda-recordatorios.service';
import { AgendaPlanGuard } from './agenda-plan.guard';

@Module({
  imports: [PrismaModule, NotificacionesModule],
  controllers: [AgendaController],
  providers: [AgendaService, AgendaRecordatoriosService, AgendaPlanGuard],
})
export class AgendaModule {}
