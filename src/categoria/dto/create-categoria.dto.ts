import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoriaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  imagenUrl?: string;

  /** Categoría madre. null la vuelve principal; sin enviar, no cambia. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  padreId?: number | null;
}
