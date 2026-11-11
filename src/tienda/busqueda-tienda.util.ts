/**
 * Filtro del buscador de la tienda: cada palabra tiene que estar en el nombre,
 * la descripción larga, el código o los órganos y sistemas sobre los que actúa.
 * Así "lavanda aceite" encuentra "aceite esencial de lavanda", y una palabra
 * que solo está en la descripción también.
 *
 * Las tildes no deben importar (Hierba Sana, 08-11: "higado" daba 4 y
 * "hígado" 242). Postgres no las ignora en `contains`, así que cada palabra
 * se busca también sin tilde y, si sin tildes coincide con una palabra del
 * `vocabulario` (las palabras con tilde del catálogo), con la de él.
 */
export const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const CAMPOS = ['descripcion', 'descripcionLarga', 'codigo', 'organos', 'sistemas'] as const;

export const filtroBusquedaTienda = (texto: string | null | undefined, vocabulario: string[] = []) => {
  const porClave = new Map<string, Set<string>>();
  for (const v of vocabulario) {
    for (const w of v.split(/[\s,;]+/).filter(Boolean)) {
      const k = sinTildes(w).toLowerCase();
      if (!porClave.has(k)) porClave.set(k, new Set());
      porClave.get(k)!.add(w);
    }
  }
  return (texto ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra) => {
      const plana = sinTildes(palabra);
      const variantes = [...new Set([palabra, plana, ...(porClave.get(plana.toLowerCase()) ?? [])])];
      return {
        OR: variantes.flatMap((v) =>
          CAMPOS.map((campo) => ({ [campo]: { contains: v, mode: 'insensitive' as const } })),
        ),
      };
    });
};
