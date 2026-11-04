import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoRepartidorDto {
  PLANILLA = 'PLANILLA',
  EVENTUAL = 'EVENTUAL',
}

export class CreateRepartidorDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  celular?: string;

  @IsOptional()
  @IsEnum(TipoRepartidorDto)
  tipo?: TipoRepartidorDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sedeId?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  /** Color de su etiqueta en la lista de ventas (#RRGGBB); "" lo quita. */
  @IsOptional()
  @Matches(/^(#[0-9a-fA-F]{6})?$/, { message: 'El color debe ser #RRGGBB' })
  color?: string;
}

export class UpdateRepartidorDto extends CreateRepartidorDto {}
