import { Module } from '@nestjs/common';
import { UsersService } from './usuarios.service';
import { UsersController } from './usuarios.controller';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
