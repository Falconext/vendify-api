import { Module } from '@nestjs/common';
import { ExtensionesController } from './extensiones.controller';

@Module({
  controllers: [ExtensionesController],
})
export class ExtensionesModule {}
