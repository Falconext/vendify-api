import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ItemPedidoDto {
  @IsNumber()
  productoId: number;

  @IsNumber()
  @Min(1)
  cantidad: number;

  @IsString()
  @IsOptional()
  observacion?: string;

  /**
   * Variante elegida (color/talla/medida), si el producto las tiene. Se manda
   * el id y el precio lo resuelve el servidor: nunca se confía en el del
   * navegador.
   */
  @IsNumber()
  @IsOptional()
  varianteId?: number;

  /**
   * Presentación elegida (ej. el código del rollo de 12 m). Es el `codigo` de
   * ProductoCodigoBarras; igual que con la variante, el precio y las unidades
   * las resuelve el servidor a partir de ese código.
   */
  @IsString()
  @IsOptional()
  presentacionCodigo?: string;
}

export enum MedioPagoTienda {
  YAPE = 'YAPE',
  PLIN = 'PLIN',
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  TARJETA = 'TARJETA',
}

export enum TipoEntrega {
  RECOJO = 'RECOJO',
  ENVIO = 'ENVIO',
}

export class CrearPedidoDto {
  @IsString()
  clienteNombre: string;

  @IsString()
  clienteTelefono: string;

  // El correo es opcional, pero el checkout lo manda como "" cuando el
  // comprador no lo escribe, y @IsOptional solo deja pasar null/undefined:
  // el pedido se rechazaba con "clienteEmail must be an email" (29-10).
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsEmail()
  @IsOptional()
  clienteEmail?: string;

  @IsString()
  @IsOptional()
  clienteDireccion?: string;

  @IsString()
  @IsOptional()
  clienteReferencia?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemPedidoDto)
  items: ItemPedidoDto[];

  @IsEnum(MedioPagoTienda)
  medioPago: MedioPagoTienda;

  @IsString()
  @IsOptional()
  observaciones?: string;

  @IsString()
  @IsOptional()
  referenciaTransf?: string;

  @IsString()
  @IsOptional()
  culqiToken?: string;

  // Mismo caso: sin tarjeta el checkout lo manda como "".
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsEmail()
  @IsOptional()
  culqiEmail?: string;

  @IsEnum(TipoEntrega)
  @IsOptional()
  tipoEntrega?: TipoEntrega = TipoEntrega.RECOJO;

  @IsString()
  @IsOptional()
  agenciaEnvio?: string;

  /** Envío por agencia elegido en la tienda: SHALOM u OLVA. Ver envio-agencia.ts. */
  @IsString()
  @IsOptional()
  envioCourier?: string;

  /** Id de la agencia destino (ter_id de Shalom, código de Olva). */
  @IsString()
  @IsOptional()
  envioAgenciaId?: string;

  @IsString()
  @IsOptional()
  envioAgenciaNombre?: string;

  /** DNI/CE/RUC del comprador: la agencia lo pide al entregar. */
  @IsString()
  @IsOptional()
  clienteDocumento?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  adelanto?: number;
}
