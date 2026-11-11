import {
  FrenoDeAvisos,
  alertaDeError,
  describirEquipo,
  destinosDeAlerta,
  huellaDeEquipo,
  registrarAvisador,
  rutaGenerica,
} from './alertas';
import { AlertasService, CLAVES_FALLIDAS_PARA_AVISAR } from './alertas.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { BadRequestException } from '@nestjs/common';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('alertas: piezas', () => {
  it('describe el equipo en palabras', () => {
    expect(describirEquipo(CHROME_WIN)).toBe('Chrome en Windows');
    expect(describirEquipo(SAFARI_IPHONE)).toBe('Safari en iPhone');
    expect(describirEquipo(undefined)).toBe('equipo sin identificar');
  });

  it('la misma red y navegador es el mismo equipo; otra red u otro navegador, no', () => {
    const a = huellaDeEquipo(CHROME_WIN, '190.42.10.5');
    expect(huellaDeEquipo(CHROME_WIN, '190.42.10.77')).toBe(a);
    expect(huellaDeEquipo(CHROME_WIN, '181.65.3.2')).not.toBe(a);
    expect(huellaDeEquipo(SAFARI_IPHONE, '190.42.10.5')).not.toBe(a);
  });

  it('la ruta del aviso no lleva ids ni la query', () => {
    expect(rutaGenerica('/api/comprobante/123/pdf?token=abc')).toBe(
      '/api/comprobante/:id/pdf',
    );
  });

  it('el mismo error se avisa una vez; uno distinto sí sale', () => {
    const f = new FrenoDeAvisos(30 * 60 * 1000, 12);
    expect(f.pasar('a', 0)).toBe(0);
    expect(f.pasar('a', 60_000)).toBeNull();
    expect(f.pasar('b', 60_000)).toBe(1); // y cuenta el que se frenó
    expect(f.pasar('a', 31 * 60 * 1000)).toBe(0);
  });

  it('no más de 12 avisos por hora en total', () => {
    const f = new FrenoDeAvisos(30 * 60 * 1000, 12);
    const enviados = Array.from({ length: 20 }, (_, i) =>
      f.pasar(`e${i}`, i * 1000),
    ).filter((x) => x !== null);
    expect(enviados).toHaveLength(12);
    expect(f.pasar('otro', 61 * 60 * 1000)).toBe(8);
  });

  it('destinos: ALERTAS_TELEFONOS, o los de soporte si no está', () => {
    expect(
      destinosDeAlerta({ ALERTAS_TELEFONOS: '999111222, 51988777666' } as any),
    ).toEqual(['51999111222', '51988777666']);
    expect(
      destinosDeAlerta({ SOPORTE_AVISO_TELEFONOS: '977000111' } as any),
    ).toEqual(['51977000111']);
    expect(destinosDeAlerta({} as any)).toEqual([]);
  });

  it('el texto del error dice qué ruta y qué pasó', () => {
    const a = alertaDeError({
      metodo: 'POST',
      url: '/api/comprobante/45',
      status: 500,
      mensaje: 'Cannot read properties of undefined',
      nombre: 'TypeError',
      empresaId: 21,
    });
    expect(a.texto).toContain('POST /api/comprobante/:id');
    expect(a.texto).toContain('TypeError: Cannot read properties of undefined');
    expect(a.texto).toContain('Empresa 21');
  });
});

describe('AlertasService', () => {
  const previo = {
    t: process.env.ALERTAS_TELEFONOS,
    c: process.env.ALERTAS_CORREOS,
  };
  beforeEach(() => {
    process.env.ALERTAS_TELEFONOS = '999111222';
    delete process.env.ALERTAS_CORREOS;
  });
  afterAll(() => {
    process.env.ALERTAS_TELEFONOS = previo.t;
    process.env.ALERTAS_CORREOS = previo.c;
  });

  const armar = (rol = 'ADMIN_SISTEMA') => {
    const equipos: any[] = [];
    const prisma: any = {
      equipoConocido: {
        findUnique: jest.fn(
          async ({ where }: any) =>
            equipos.find(
              (e) =>
                e.usuarioId === where.usuarioId_huella.usuarioId &&
                e.huella === where.usuarioId_huella.huella,
            ) ?? null,
        ),
        create: jest.fn(async ({ data }: any) => {
          equipos.push({ id: equipos.length + 1, ...data });
        }),
        update: jest.fn(async () => undefined),
      },
      usuario: { findUnique: jest.fn(async () => ({ rol })) },
    };
    const whatsapp: any = {
      enviarTexto: jest.fn(async () => ({
        success: false,
        error: 'ventana cerrada',
      })),
    };
    return {
      svc: new AlertasService(prisma, whatsapp),
      prisma,
      whatsapp,
      equipos,
    };
  };

  const admin = {
    id: 7,
    rol: 'ADMIN_SISTEMA',
    nombre: 'Ana',
    email: 'ana@ejemplo.com',
  };

  it('administrador desde un equipo nuevo: avisa una vez y lo recuerda', async () => {
    const { svc, whatsapp, equipos } = armar();
    await svc.entradaCorrecta(admin, CHROME_WIN, '190.42.10.5');
    expect(equipos).toHaveLength(1);
    expect(whatsapp.enviarTexto).toHaveBeenCalledTimes(1);
    const [numero, texto] = whatsapp.enviarTexto.mock.calls[0];
    expect(numero).toBe('51999111222');
    expect(texto).toContain('Chrome en Windows');
    expect(texto).toContain('ana@ejemplo.com');

    await svc.entradaCorrecta(admin, CHROME_WIN, '190.42.10.99');
    expect(whatsapp.enviarTexto).toHaveBeenCalledTimes(1);
  });

  it('dueños y vendedores no generan aviso de equipo', async () => {
    const { svc, whatsapp, equipos } = armar();
    for (const rol of ['ADMIN_EMPRESA', 'USUARIO_EMPRESA', 'RESELLER'])
      await svc.entradaCorrecta({ ...admin, rol }, CHROME_WIN, '1.2.3.4');
    expect(equipos).toHaveLength(0);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it(`${CLAVES_FALLIDAS_PARA_AVISAR} contraseñas equivocadas en un administrador del sistema: aviso`, async () => {
    const { svc, whatsapp } = armar();
    for (let i = 0; i < CLAVES_FALLIDAS_PARA_AVISAR - 1; i++)
      await svc.claveEquivocada('ana@ejemplo.com', '5.6.7.8', i * 1000);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    await svc.claveEquivocada('ana@ejemplo.com', '5.6.7.8', 5000);
    expect(whatsapp.enviarTexto).toHaveBeenCalledTimes(1);
    expect(whatsapp.enviarTexto.mock.calls[0][1]).toContain(
      '3 intentos fallidos',
    );
  });

  it('contraseñas equivocadas de un vendedor no avisan', async () => {
    const { svc, whatsapp } = armar('USUARIO_EMPRESA');
    for (let i = 0; i < 6; i++)
      await svc.claveEquivocada('cajero@tienda.pe', '5.6.7.8', i);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it('si WhatsApp falla, no rompe el login', async () => {
    const { svc, whatsapp } = armar();
    whatsapp.enviarTexto.mockRejectedValue(new Error('Meta caído'));
    await expect(
      svc.entradaCorrecta(admin, CHROME_WIN, '9.9.9.9'),
    ).resolves.toBeUndefined();
  });

  it('sin teléfonos configurados no intenta enviar', async () => {
    delete process.env.ALERTAS_TELEFONOS;
    const prev = process.env.SOPORTE_AVISO_TELEFONOS;
    delete process.env.SOPORTE_AVISO_TELEFONOS;
    const { svc, whatsapp } = armar();
    await svc.entradaCorrecta(admin, CHROME_WIN, '9.9.9.9');
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    process.env.SOPORTE_AVISO_TELEFONOS = prev;
  });
});

describe('filtro global: avisa los errores 500 y no los 400', () => {
  afterEach(() => registrarAvisador(null));
  const host = (req: any) => {
    const res: any = { status: jest.fn(() => res), json: jest.fn() };
    return {
      res,
      host: {
        switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
      } as any,
    };
  };

  it('un error inesperado sale como aviso', () => {
    const avisos: any[] = [];
    registrarAvisador((a) => avisos.push(a));
    const { host: h, res } = host({
      method: 'GET',
      url: '/api/kardex/9',
      user: { empresaId: 3 },
    });
    new HttpExceptionFilter().catch(new TypeError('x is undefined'), h);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].texto).toContain('GET /api/kardex/:id');
  });

  it('un error de validación (400) no avisa', () => {
    const avisos: any[] = [];
    registrarAvisador((a) => avisos.push(a));
    const { host: h } = host({ method: 'POST', url: '/api/cliente' });
    new HttpExceptionFilter().catch(new BadRequestException('falta el RUC'), h);
    expect(avisos).toHaveLength(0);
  });

  it('si el avisador falla, la respuesta sale igual', () => {
    registrarAvisador(() => {
      throw new Error('roto');
    });
    const { host: h, res } = host({ method: 'GET', url: '/api/x' });
    new HttpExceptionFilter().catch(new Error('boom'), h);
    expect(res.json).toHaveBeenCalled();
  });
});
