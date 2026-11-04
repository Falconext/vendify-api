import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfigCostoReposicionDto {
  @IsOptional() @IsNumber() @Min(0.5) @Max(50)
  umbralPct?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(90)
  margenObjetivoPct?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  colchonTc?: number;
}

export class PrecioProductoDto {
  @IsInt()
  productoId: number;

  @IsNumber() @Min(0.01)
  precio: number;
}

export class AplicarPreciosDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(2000)
  @ValidateNested({ each: true }) @Type(() => PrecioProductoDto)
  items: PrecioProductoDto[];
}
