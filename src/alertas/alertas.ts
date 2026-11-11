import { createHash } from 'crypto';

/**
 * Avisos al equipo de la plataforma: errores del servidor, entradas de un
 * administrador del sistema desde un equipo nuevo y bloqueos por intentos
 * fallidos. Antes nadie se enteraba de nada de esto hasta que un cliente
 * reclamaba.
 *
 * Aquí está lo que no depende de Nest (textos, huella del equipo, freno anti
 * ruido); `alertas.service.ts` hace el envío.
 */

export type Alerta = {
  /** Agrupa repeticiones: la misma clave no se avisa dos veces en la ventana. */
  clave: string;
  /** Una línea para la plantilla de WhatsApp (sale cuando la ventana de 24 h está cerrada). */
  titulo: string;
  /** Texto completo del aviso. */
  texto: string;
};

/**
 * Freno para que los avisos no se vuelvan ruido:
 *  - la misma clave se avisa una vez cada `ventanaMs`;
 *  - como máximo `topePorHora` avisos en total por hora. Los que se frenan se
 *    cuentan y salen sumados en el siguiente aviso.
 */
export class FrenoDeAvisos {
  private ultimos = new Map<string, number>();
  private envios: number[] = [];
  private frenados = 0;

  constructor(
    private readonly ventanaMs = 30 * 60 * 1000,
    private readonly topePorHora = 12,
  ) {}

  /** null = no se envía; número = se envía, y cuántos se frenaron antes. */
  pasar(clave: string, ahora = Date.now()): number | null {
    const previo = this.ultimos.get(clave);
    if (previo !== undefined && ahora - previo < this.ventanaMs) {
      this.frenados++;
      return null;
    }
    this.envios = this.envios.filter((t) => ahora - t < 60 * 60 * 1000);
    if (this.envios.length >= this.topePorHora) {
      this.frenados++;
      return null;
    }
    this.envios.push(ahora);
    this.ultimos.set(clave, ahora);
    if (this.ultimos.size > 500) {
      for (const [k, t] of this.ultimos)
        if (ahora - t >= this.ventanaMs) this.ultimos.delete(k);
    }
    const n = this.frenados;
    this.frenados = 0;
    return n;
  }
}

/** Navegador y sistema en palabras: "Chrome en Windows". */
export function describirEquipo(ua: string | undefined): string {
  const s = String(ua ?? '');
  const nav = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /Firefox\//.test(s)
        ? 'Firefox'
        : /Chrome\//.test(s)
          ? 'Chrome'
          : /Safari\//.test(s)
            ? 'Safari'
            : /okhttp|Expo|ReactNative|CFNetwork|Dart/i.test(s)
              ? 'la app'
              : s
                ? 'otro navegador'
                : 'equipo sin identificar';
  const so = /Android/.test(s)
    ? 'Android'
    : /iPhone|iPad|iOS/.test(s)
      ? 'iPhone'
      : /Windows/.test(s)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(s)
          ? 'Mac'
          : /Linux/.test(s)
            ? 'Linux'
            : '';
  return so ? `${nav} en ${so}` : nav;
}

/**
 * Red de la IP: los primeros 3 bloques en IPv4 y 4 en IPv6. La IP exacta
 * cambia seguido en la misma casa u oficina; la red, casi nunca.
 */
export function redDeIp(ip: string | undefined): string {
  const s = String(ip ?? '').replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.split('.').slice(0, 3).join('.');
  if (s.includes(':')) return s.split(':').slice(0, 4).join(':');
  return s || 'sin-ip';
}

/** Huella del equipo: navegador + sistema + red. No guarda la IP ni el user-agent en claro. */
export function huellaDeEquipo(
  ua: string | undefined,
  ip: string | undefined,
): string {
  return createHash('sha256')
    .update(`${describirEquipo(ua)}|${redDeIp(ip)}`)
    .digest('hex')
    .slice(0, 40);
}

/** Hora de Lima, para que el aviso se lea sin hacer cuentas. */
export function horaLima(fecha = new Date()): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(fecha);
}

/** Ruta sin ids ni query: "/api/comprobante/123?x=1" → "/api/comprobante/:id". */
export function rutaGenerica(url: string | undefined): string {
  return String(url ?? '')
    .split('?')[0]
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .slice(0, 120);
}

export function alertaDeError(i: {
  metodo?: string;
  url?: string;
  status: number;
  mensaje: string;
  nombre?: string;
  empresaId?: number | null;
  usuarioId?: number | null;
  ahora?: Date;
}): Alerta {
  const ruta = rutaGenerica(i.url);
  const mensaje = String(i.mensaje || 'sin mensaje').slice(0, 300);
  const firma = `${i.nombre ?? 'Error'}:${mensaje.slice(0, 80)}`;
  return {
    clave: `error:${i.metodo ?? ''} ${ruta}:${firma}`,
    titulo: `Error ${i.status} en ${i.metodo ?? ''} ${ruta}`.slice(0, 200),
    texto: [
      `🔴 *Error del servidor (${i.status})*`,
      '',
      `${i.metodo ?? ''} ${ruta}`,
      `${i.nombre ?? 'Error'}: ${mensaje}`,
      i.empresaId
        ? `Empresa ${i.empresaId}${i.usuarioId ? ` · usuario ${i.usuarioId}` : ''}`
        : '',
      `🕒 ${horaLima(i.ahora)}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function alertaDeFalloGrave(
  tipo: string,
  mensaje: string,
  ahora?: Date,
): Alerta {
  const m = String(mensaje || 'sin mensaje').slice(0, 300);
  return {
    clave: `proceso:${tipo}:${m.slice(0, 80)}`,
    titulo: `${tipo} en el servidor`,
    texto: [`🔴 *${tipo} en el servidor*`, '', m, `🕒 ${horaLima(ahora)}`].join(
      '\n',
    ),
  };
}

export function alertaDeEquipoNuevo(i: {
  nombre: string;
  email: string;
  ua?: string;
  ip?: string;
  ahora?: Date;
}): Alerta {
  const equipo = describirEquipo(i.ua);
  return {
    clave: `equipo:${i.email}:${huellaDeEquipo(i.ua, i.ip)}`,
    titulo:
      `Administrador del sistema entró desde un equipo nuevo: ${i.email}`.slice(
        0,
        200,
      ),
    texto: [
      '🔐 *Entrada desde un equipo nuevo*',
      '',
      `👤 ${i.nombre} (${i.email}) — administrador del sistema`,
      `💻 ${equipo}`,
      `🌐 IP ${i.ip || 'desconocida'}`,
      `🕒 ${horaLima(i.ahora)}`,
      '',
      'Si no fue esa persona, cambien su contraseña ya.',
    ].join('\n'),
  };
}

export function alertaDeClaveFallida(i: {
  email: string;
  intentos: number;
  ip?: string;
  ahora?: Date;
}): Alerta {
  return {
    clave: `clave-fallida:${i.email}`,
    titulo:
      `${i.intentos} contraseñas equivocadas en la cuenta ${i.email}`.slice(
        0,
        200,
      ),
    texto: [
      '⚠️ *Contraseñas equivocadas en una cuenta de administrador del sistema*',
      '',
      `👤 ${i.email}`,
      `🔢 ${i.intentos} intentos fallidos en 15 minutos`,
      `🌐 Último intento desde IP ${i.ip || 'desconocida'}`,
      `🕒 ${horaLima(i.ahora)}`,
    ].join('\n'),
  };
}

export function alertaDeBloqueo(i: {
  tipo: 'ip' | 'cuenta';
  valor: string;
  intentos: number;
  ahora?: Date;
}): Alerta {
  const quien = i.tipo === 'ip' ? `la IP ${i.valor}` : `la cuenta ${i.valor}`;
  return {
    clave: `bloqueo:${i.tipo}:${i.valor}`,
    titulo: `Bloqueo por intentos fallidos: ${quien}`.slice(0, 200),
    texto: [
      '🚫 *Bloqueo por intentos fallidos de inicio de sesión*',
      '',
      `Se bloqueó ${quien} por 15 minutos tras ${i.intentos} intentos fallidos.`,
      i.tipo === 'cuenta'
        ? 'Intentaron muchas contraseñas sobre la misma cuenta, posiblemente desde varias IP.'
        : 'Puede ser alguien probando contraseñas, o un usuario que olvidó la suya.',
      `🕒 ${horaLima(i.ahora)}`,
    ].join('\n'),
  };
}

/** Destinos de `ALERTAS_TELEFONOS` (o, si no está, los de soporte). */
export function destinosDeAlerta(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const valor = env.ALERTAS_TELEFONOS || env.SOPORTE_AVISO_TELEFONOS || '';
  const vistos = new Set<string>();
  for (const crudo of valor.split(/[,;]+/)) {
    let n = crudo.replace(/\D/g, '');
    if (n.length === 9 && n.startsWith('9')) n = `51${n}`;
    if (n.length >= 10) vistos.add(n);
  }
  return [...vistos];
}

export function correosDeAlerta(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return String(env.ALERTAS_CORREOS || '')
    .split(/[,;\s]+/)
    .map((c) => c.trim())
    .filter((c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c));
}

// ── Puente para lo que vive fuera de Nest (filtro global, middleware, proceso) ──

type Avisador = (a: Alerta) => void;
let avisador: Avisador | null = null;

export function registrarAvisador(fn: Avisador | null) {
  avisador = fn;
}

/** Nunca lanza: un aviso que falla no puede romper la respuesta. */
export function avisarAlEquipo(a: Alerta) {
  try {
    avisador?.(a);
  } catch {
    /* sin aviso */
  }
}
