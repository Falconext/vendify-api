/**
 * ¿La guía saldría con un destinatario que no cuadra con la venta?
 *
 * Shalom recibe el DNI y el celular por separado, y el nombre sale del DNI. Si
 * el despacho dice que recibe otra persona pero no tiene su DNI, la guía mezcla
 * el documento del cliente con el celular de esa otra persona, y los avisos de
 * llegada se van a alguien que no retira. Así salieron cinco guías de ZABDI el
 * 02-11, con datos heredados de la venta anterior.
 *
 * Mandarle a un tercero sigue siendo válido: basta con escribir su DNI.
 */
const palabras = (nombre: unknown) =>
  String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-ZÑ]+/)
    .filter((p) => p.length >= 3 && !['DEL', 'LAS', 'LOS'].includes(p));

const esGenerico = (nombre: unknown) => {
  const n = String(nombre ?? '').trim().toUpperCase();
  return n === '' || n === 'VARIOS' || n === 'CLIENTES VARIOS' || n.startsWith('WSP ');
};

export function destinatarioNoCuadra(p: {
  nombreDestinatario?: string | null;
  dniDestinatario?: string | null;
  clienteNombre?: string | null;
  clienteDocumento?: string | null;
}): boolean {
  const destinatario = palabras(p.nombreDestinatario);
  if (destinatario.length === 0 || esGenerico(p.clienteNombre)) return false;
  const dni = String(p.dniDestinatario ?? '').trim();
  if (dni && dni !== String(p.clienteDocumento ?? '').trim()) return false;
  const cliente = new Set(palabras(p.clienteNombre));
  return !destinatario.some((d) => cliente.has(d));
}
