import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum TipoCaja {
  APERTURA = 'APERTURA',
  CIERRE = 'CIERRE',
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
}

const TURNOS_VALIDOS = ['MAÑANA', 'TARDE', 'NOCHE'] as const;

export class AperturaCajaDto {
  @IsNumber()
  @Min(0, { message: 'El monto inicial no puede ser negativo' })
  @Transform(({ value }) => parseFloat(value) || 0)
  montoInicial: number;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsIn(TURNOS_VALIDOS, { message: 'El turno debe ser MAÑANA, TARDE o NOCHE' })
  turno?: string;
}

export class CierreCajaDto {
  /**
   * Id de la APERTURA que se está cerrando, cuando es un turno de un día
   * anterior que quedó sin cuadrar. Sin este campo se cierra el turno de hoy,
   * que es el caso de siempre.
   */
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  aperturaId?: number;

  @IsNumber()
  @Min(0, { message: 'El monto de efectivo no puede ser negativo' })
  @Transform(({ value }) => parseFloat(value) || 0)
  montoEfectivo: number;

  @IsNumber()
  @Min(0, { message: 'El monto de Yape no puede ser negativo' })
  @Transform(({ value }) => parseFloat(value) || 0)
  montoYape: number;

  @IsNumber()
  @Min(0, { message: 'El monto de Plin no puede ser negativo' })
  @Transform(({ value }) => parseFloat(value) || 0)
  montoPlin: number;

  @IsNumber()
  @Min(0, { message: 'El monto de transferencia no puede ser negativo' })
  @Transform(({ value }) => parseFloat(value) || 0)
  montoTransferencia: number;

  @IsNumber()
  @Min(0, { message: 'El monto de tarjeta no puede ser negativo' })
  @Transform(({ value }) => parseFloat(value) || 0)
  montoTarjeta: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class MovimientoCajaDto {
  @IsEnum(TipoCaja)
  tipoMovimiento: TipoCaja;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  monto?: number;

  @IsOptional()
  @IsString()
  medioPago?: string;

  @IsOptional()
  @IsString()
  concepto?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class EstadoCajaDto {
  @IsOptional()
  @IsString()
  fechaInicio?: string;

  @IsOptional()
  @IsString()
  fechaFin?: string;
}

export class EditarEgresoDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  @Transform(({ value }) => parseFloat(value))
  monto?: number;

  @IsOptional()
  @IsString()
  categoriaGasto?: string;

  @IsOptional()
  @IsString()
  descripcionGasto?: string;

  @IsOptional()
  @IsString()
  metodoPago?: string;
}

export class RegistrarEgresoDto {
  @IsNumber()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  @Transform(({ value }) => parseFloat(value))
  monto: number;

  @IsString()
  @IsNotEmpty({ message: 'La categoría es requerida' })
  categoriaGasto: string;

  @IsOptional()
  @IsString()
  descripcionGasto?: string;

  @IsOptional()
  @IsString()
  metodoPago?: string;
}

/** Plata que entra al cajón durante el turno sin ser una venta. */
export class RegistrarIngresoCajaDto {
  @IsNumber()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  @Transform(({ value }) => parseFloat(value))
  monto: number;

  @IsString()
  @IsNotEmpty({ message: 'Escribe de dónde sale la plata' })
  descripcion: string;
}

export class TransferenciaCajaDto {
  @IsInt()
  @Min(1, { message: 'Selecciona la sede destino' })
  sedeDestinoId: number;

  @IsNumber()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  @Transform(({ value }) => parseFloat(value))
  monto: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class ParteDepositoDto {
  @IsInt()
  @Min(1, { message: 'Selecciona la cuenta de cada parte del reparto' })
  cuentaBancariaId: number;

  @IsNumber()
  @Min(0.01, { message: 'Cada parte del reparto necesita un monto' })
  monto: number;

  @IsOptional()
  @IsString()
  numeroOperacion?: string;
}

export class MarcarDepositadosDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecciona al menos un cierre para depositar' })
  @IsInt({ each: true })
  cierreIds: number[];

  // Una sola cuenta (lo de siempre). Con `repartos` no se usa.
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Selecciona la cuenta bancaria destino' })
  cuentaBancariaId?: number;

  // El efectivo repartido entre varias cuentas (2 o más).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ParteDepositoDto)
  repartos?: ParteDepositoDto[];

  @IsOptional()
  @IsString()
  fecha?: string;

  @IsOptional()
  @IsString()
  numeroOperacion?: string;
}
