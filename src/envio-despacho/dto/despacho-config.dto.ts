import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class DespachoConfigDto {
  @IsOptional() @IsString() mensajeEnCamino?: string;
  /** Opcional: "en camino" para provincia (agencia). Vacío = sale el general. */
  @IsOptional() @IsString() @MaxLength(1000) mensajeEnCaminoAgencia?: string;
  @IsOptional() @IsString() mensajeEntregado?: string;
  /** Opcional: "entregado" para provincia (recogió en agencia). Vacío = el general. */
  @IsOptional() @IsString() @MaxLength(1000) mensajeEntregadoAgencia?: string;
  @IsOptional() @IsBoolean() notificarEnCamino?: boolean;
  @IsOptional() @IsBoolean() notificarEntregado?: boolean;
}
