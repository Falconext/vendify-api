import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SuscripcionController } from './suscripcion.controller';
import { SuscripcionService } from './suscripcion.service';

@Module({
  imports: [PrismaModule],
  controllers: [SuscripcionController],
  providers: [SuscripcionService],
})
export class SuscripcionModule {}
