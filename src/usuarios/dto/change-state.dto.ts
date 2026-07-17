import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ChangeStateDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado: 'ACTIVO' | 'INACTIVO';
}
