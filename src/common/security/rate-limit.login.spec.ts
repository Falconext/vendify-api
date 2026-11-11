import { authRateLimit } from './rate-limit.middleware';

/** Llama al middleware como express: `status` es lo que respondería el login. */
function login(
  mw: ReturnType<typeof authRateLimit>,
  opciones: { ip: string; email?: string; status?: number; conexion?: string },
): number {
  let respondido: number | null = null;
  const finales: (() => void)[] = [];
  const res: any = {
    statusCode: opciones.status ?? 401,
    setHeader: () => undefined,
    status(c: number) {
      respondido = c;
      return this;
    },
    json: () => undefined,
    on: (_: string, cb: () => void) => finales.push(cb),
  };
  mw(
    {
      method: 'POST',
      path: '/api/auth/login',
      headers: { 'x-forwarded-for': opciones.ip },
      ip: opciones.ip,
      socket: { remoteAddress: opciones.conexion ?? '100.64.0.2' },
      body: { email: opciones.email ?? 'ana@tienda.pe', password: 'x' },
    } as any,
    res,
    () => undefined,
  );
  if (respondido !== null) return respondido;
  finales.forEach((cb) => cb());
  return res.statusCode;
}

describe('Límite de login', () => {
  it('muchas IP contra una cuenta: se frena esa cuenta en el intento 31', () => {
    const mw = authRateLimit();
    const email = 'victima@tienda.pe';
    for (let i = 0; i < 30; i += 1) {
      expect(login(mw, { ip: `198.51.100.${i}`, email })).toBe(401);
    }
    expect(login(mw, { ip: '198.51.100.200', email })).toBe(429);
    expect(login(mw, { ip: '198.51.100.201', email: 'VICTIMA@tienda.pe ' })).toBe(429);
  });

  it('una cuenta bajo ataque no afecta a las demás', () => {
    const mw = authRateLimit();
    for (let i = 0; i < 31; i += 1) {
      login(mw, { ip: `198.51.101.${i}`, email: 'atacada@tienda.pe' });
    }
    expect(login(mw, { ip: '198.51.101.200', email: 'otra@tienda.pe', status: 200 })).toBe(200);
  });

  it('entrar bien nunca cuenta, por más veces que entre', () => {
    const mw = authRateLimit();
    for (let i = 0; i < 100; i += 1) {
      expect(login(mw, { ip: '198.51.102.1', email: 'caja@tienda.pe', status: 200 })).toBe(200);
    }
  });

  it('varios usuarios tras la misma IP se siguen limitando como hoy, en 15 fallos', () => {
    const mw = authRateLimit();
    for (let i = 0; i < 15; i += 1) {
      expect(login(mw, { ip: '198.51.103.1', email: `u${i}@tienda.pe` })).toBe(401);
    }
    expect(login(mw, { ip: '198.51.103.1', email: 'nuevo@tienda.pe' })).toBe(429);
  });

  it('decir que se viene de 127.0.0.1 no salta el límite', () => {
    const mw = authRateLimit();
    for (let i = 0; i < 15; i += 1) {
      login(mw, { ip: '127.0.0.1', email: `x${i}@tienda.pe` });
    }
    expect(login(mw, { ip: '127.0.0.1', email: 'y@tienda.pe' })).toBe(429);
  });

  it('en desarrollo, con conexión local de verdad, no se limita', () => {
    const mw = authRateLimit();
    for (let i = 0; i < 40; i += 1) {
      expect(login(mw, { ip: '198.51.104.1', email: 'dev@tienda.pe', conexion: '::1' })).toBe(401);
    }
  });
});
