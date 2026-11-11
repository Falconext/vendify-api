import type { OlvaShipmentInput } from './olva-api.service';

/**
 * El cuerpo de POST /shipments. Olva cambió el contrato y el que mandábamos
 * (`sender.name`, `sender.document`, `service`) responde 400: ninguna guía salía.
 * Reglas comprobadas contra el proveedor el 2026-11-04.
 */

/**
 * Tallas de caja de /catalog/standard-sizes. Olva rechaza con 422 un peso que no
 * sea exactamente el de la talla, así que se manda el de la talla que lo contiene.
 * El sobre queda fuera: solo acepta la categoría DOCUMENTOS.
 */
export const TALLAS_OLVA = [
  { sizeId: 'extra-extra-small', pesoKg: 0.5 },
  { sizeId: 'extra-small', pesoKg: 1 },
  { sizeId: 'small', pesoKg: 2 },
  { sizeId: 'middle', pesoKg: 5 },
  { sizeId: 'big', pesoKg: 10 },
] as const;

export const tallaOlvaParaPeso = (pesoKg: number) =>
  TALLAS_OLVA.find((t) => pesoKg <= t.pesoKg) ?? null;

// Olva exige categoría y su catálogo no tiene "otros". Se elige por el contenido
// declarado; sin coincidencia va como ropa, que es lo que más despachan.
const ARTICULO_ROPA = 227;
const CATEGORIAS: [RegExp, number][] = [
  [/celular|smartphone/, 129],
  [/laptop/, 393],
  [/tablet/, 635],
  [/camara/, 999],
  [/cosmetic|maquillaje|perfume|crema/, 167],
  [/medicina|farmac|pastilla/, 273],
  [/juguete/, 96],
  [/aliment|bebida|comida|snack/, 120],
  [/repuesto/, 220],
  [/ferreter|construccion|herramienta/, 71],
  [/limpieza|detergente/, 277],
  [/bisuteria|joya/, 772],
  [/electrohogar|licuadora|electrodomestico/, 401],
];

export const categoriaOlva = (contenido: string): number => {
  const texto = contenido
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return CATEGORIAS.find(([patron]) => patron.test(texto))?.[1] ?? ARTICULO_ROPA;
};

/** Mínimo y máximo que Olva acepta cuando el envío se paga en destino. */
const valorDeclaradoOlva = (valor: number) =>
  Math.min(Math.max(Number(valor) || 0, 1), 1500);

/** 9 dígitos: Olva no acepta el +51 ni los espacios del WhatsApp guardado. */
export const celularOlva = (valor?: string | null) =>
  String(valor ?? '')
    .replace(/\D/g, '')
    .slice(-9);

/**
 * Con RUC, Olva igual exige nombres y apellidos del remitente: responde 400 si no
 * los recibe. Se reparte la razón social, sin los signos que no acepta ("S.A.C.", "&").
 */
export const nombresRemitenteOlva = (razonSocial: string) => {
  const palabras = razonSocial
    .replace(/&/g, ' Y ')
    .replace(/\./g, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/);
  const lastName = palabras[palabras.length - 1];
  return {
    firstNames: palabras.slice(0, -1).join(' ').slice(0, 100) || lastName,
    lastName,
  };
};

export const armarEnvioOlva = (d: {
  ruc: string;
  razonSocial: string;
  celularRemitente?: string | null;
  correoRemitente?: string | null;
  documentoDestinatario: string;
  nombreDestinatario: string;
  celularDestinatario: string;
  correoDestinatario?: string | null;
  sedeOrigenId?: string;
  agenciaOrigen: string;
  agenciaDestino: string;
  talla: (typeof TALLAS_OLVA)[number];
  contenido: string;
  valorDeclarado: number;
  clave?: string | null;
  confirmar?: boolean;
}): OlvaShipmentInput => {
  const celularRemitente = celularOlva(d.celularRemitente);
  const clave = String(d.clave ?? '').trim();
  return {
    sender: {
      documentType: 'ruc',
      documentNumber: d.ruc,
      ...nombresRemitenteOlva(d.razonSocial),
      ...(celularRemitente ? { phone: celularRemitente } : {}),
      ...(d.correoRemitente ? { email: d.correoRemitente } : {}),
    },
    recipient: {
      documentNumber: d.documentoDestinatario,
      documentTypeCode: d.documentoDestinatario.length === 11 ? '6' : '4',
      fullName: d.nombreDestinatario.slice(0, 120),
      phone: celularOlva(d.celularDestinatario),
      ...(d.correoDestinatario ? { email: d.correoDestinatario } : {}),
    },
    origin: d.sedeOrigenId
      ? { headquarterId: d.sedeOrigenId }
      : { agencyCode: d.agenciaOrigen },
    destination: { agencyCode: d.agenciaDestino },
    package: {
      weightKg: d.talla.pesoKg,
      shipmentType: 2,
      sizeId: d.talla.sizeId,
      articleId: categoriaOlva(d.contenido),
      description: d.contenido.slice(0, 200),
      declaredValue: valorDeclaradoOlva(d.valorDeclarado),
    },
    whoPays: 'DESTINATION',
    deliveryType: 'O',
    // Sin clave de 4 dígitos, Olva genera una y la devuelve en securityPin.
    ...(/^\d{4}$/.test(clave) ? { pin: clave } : {}),
    ...(d.confirmar === false ? { confirm: false } : {}),
  };
};
