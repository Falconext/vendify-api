/**
 * Filtro por variante del inventario (02-11): "¿qué modelos tengo en talla M?".
 * El valor viaja como "Talla=M"; las opciones salen de las variantes activas.
 */

/** "Talla=M" → { nombre: 'Talla', valor: 'M' }; cualquier otra cosa, null. */
export function parsearFiltroVariante(
  v: unknown,
): { nombre: string; valor: string } | null {
  const texto = typeof v === 'string' ? v : '';
  const i = texto.indexOf('=');
  if (i <= 0) return null;
  const nombre = texto.slice(0, i).trim();
  const valor = texto.slice(i + 1).trim();
  if (!nombre || !valor || nombre.length > 60 || valor.length > 120)
    return null;
  return { nombre, valor };
}

export interface AtributoDeVariante {
  nombre: string;
  valores: { valor: string; modelos: number }[];
}

/** Las filas (nombre, valor, modelos) agrupadas por atributo, en orden útil. */
export function agruparAtributos(
  filas: { nombre: string; valor: string; modelos: number }[],
): AtributoDeVariante[] {
  const porNombre = new Map<string, AtributoDeVariante>();
  for (const f of filas) {
    const clave = f.nombre.trim().toUpperCase();
    const grupo = porNombre.get(clave) ?? {
      nombre: f.nombre.trim(),
      valores: [],
    };
    grupo.valores.push({
      valor: f.valor.trim(),
      modelos: Number(f.modelos) || 0,
    });
    porNombre.set(clave, grupo);
  }
  // Tallas numéricas en orden numérico (36, 38, 40), el resto alfabético.
  const comparar = (a: string, b: string) => {
    const na = Number(a),
      nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b, 'es', { numeric: true });
  };
  return [...porNombre.values()]
    .map((g) => ({
      ...g,
      valores: g.valores
        .sort((a, b) => comparar(a.valor, b.valor))
        .slice(0, 80),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
