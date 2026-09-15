import {
  IsArray,
  IsEmail,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @Transform(({ value }) => value || undefined)
  @IsString()
  @Length(8, 12)
  dni?: string;

  @IsOptional()
  @Transform(({ value }) => value || undefined)
  @IsString()
  celular?: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsInt()
  @IsOptional()
  empresaId?: number;

  @IsOptional()
  permisos?: string[];

  @IsArray()
  @IsOptional()
  sedeIds?: number[];

  // Sede que se usa como activa al loguear, entre las de sedeIds — evita el
  // selector de sede aunque el usuario tenga varias asignadas.
  @IsInt()
  @IsOptional()
  sedeDefaultId?: number;

  @IsArray()
  @IsOptional()
  subModuloIds?: number[];

  @IsBoolean()
  @IsOptional()
  puedeAnularComprobantes?: boolean;

  @IsOptional()
  @IsString()  sistemaNegocio?: string;

  @IsOptional()
  @IsString()
  @IsIn(['FACTURACION', 'HOTEL'])
  sistemaProducto?: string;

  @IsOptional()
  @IsNumber()
  comisionGlobal?: number;

  @IsOptional()
  @IsNumber()
  comisionGlobalFija?: number;

  @IsOptional()
  @IsNumber()
  comisionGlobalVenta?: number;
}
