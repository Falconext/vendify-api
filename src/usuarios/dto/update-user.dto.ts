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

export class UpdateUserDto {
  @IsInt()
  id: number;

  @IsString()
  @IsOptional()
  nombre?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @Length(8, 12)
  dni?: string;

  @IsString()
  @IsOptional()
  celular?: string;

  // Nueva contraseña (opcional). Si viene vacía o ausente, no se cambia.
  @IsString()
  @IsOptional()
  @Length(6, 72)
  password?: string;

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

  /** No da descuentos por línea ni globales. */
  @IsBoolean()
  @IsOptional()
  bloquearDescuentos?: boolean;

  @IsBoolean()
  @IsOptional()
  soloImagenesProductos?: boolean;

  // Entre las sedeIds, las que el usuario puede ver pero donde NO emite ventas.
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  sedesSinVenta?: number[];

  @IsOptional()
  @IsString()  sistemaNegocio?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['FACTURACION', 'HOTEL'])
  sistemaProducto?: string | null;

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
