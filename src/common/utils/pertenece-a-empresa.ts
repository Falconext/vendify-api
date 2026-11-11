import { BadRequestException } from '@nestjs/common';

/** Sin empresa = catálogo global: no es dato de otra empresa. */
const CON_FILAS_GLOBALES = ['cliente', 'producto', 'categoria', 'marca'];

type Modelo =
  | 'cliente'
  | 'producto'
  | 'categoria'
  | 'marca'
  | 'sede'
  | 'cuentaBancaria'
  | 'pedidoLogistica'
  | 'conductorLogistica'
  | 'vehiculoLogistica'
  | 'almacenLogistica';

/**
 * Los ids que llegan en el cuerpo los elige quien llama: sin esto, un id de otra
 * empresa se guarda tal cual y luego expone o altera sus datos.
 */
export async function exigirDeLaEmpresa(
  prisma: any,
  modelo: Modelo,
  ids: Array<number | string | null | undefined>,
  empresaId: number,
  mensaje: string,
): Promise<void> {
  const unicos = [
    ...new Set(ids.filter((id) => id != null && id !== '').map(Number)),
  ].filter((id) => id > 0);
  if (unicos.length === 0) return;

  const empresa = CON_FILAS_GLOBALES.includes(modelo)
    ? { OR: [{ empresaId }, { empresaId: null }] }
    : { empresaId };
  const encontrados = await prisma[modelo].count({
    where: { id: { in: unicos }, ...empresa },
  });
  if (encontrados !== unicos.length) throw new BadRequestException(mensaje);
}
