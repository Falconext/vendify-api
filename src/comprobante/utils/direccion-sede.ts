/**
 * Dirección de la sede a imprimir bajo la fiscal ("DIRECCION SEDE: ..."), o ''
 * si es el mismo local. Antes solo se ocultaba si era idéntica letra por letra:
 * agregarle "-TRUJILLO" a la fiscal hacía salir la misma calle dos veces
 * (ITOUCHSHOP, 10-11). Se considera el mismo local si una contiene a la otra,
 * ignorando mayúsculas, tildes, espacios y signos.
 */
export function direccionSedeParaImprimir(
  sede: string | null | undefined,
  fiscal: string | null | undefined,
): string {
  const visible = String(sede ?? '').trim().toUpperCase();
  if (!visible) return '';
  const s = normalizar(visible);
  const f = normalizar(String(fiscal ?? ''));
  if (!s) return '';
  if (f && (` ${f} `.includes(` ${s} `) || ` ${s} `.includes(` ${f} `))) return '';
  return visible;
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}
