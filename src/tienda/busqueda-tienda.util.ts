/**
 * Filtro del buscador de la tienda: cada palabra tiene que estar en el nombre,
 * la descripción larga o el código. Así "lavanda aceite" encuentra "aceite
 * esencial de lavanda", y una palabra que solo está en la descripción también.
 */
export const filtroBusquedaTienda = (texto: string | null | undefined) =>
  (texto ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra) => ({
      OR: [
        { descripcion: { contains: palabra, mode: 'insensitive' as const } },
        { descripcionLarga: { contains: palabra, mode: 'insensitive' as const } },
        { codigo: { contains: palabra, mode: 'insensitive' as const } },
      ],
    }));
