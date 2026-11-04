import { ForbiddenException } from '@nestjs/common';
import { verificarPuedeVenderEnSede } from './puede-vender-en-sede.util';

describe('verificarPuedeVenderEnSede', () => {
  const vendedor = { rol: 'USUARIO_EMPRESA', sedeId: 2, sedesSinVenta: [2] };

  it('bloquea boleta/factura/NV/ticket en una sede sin venta', () => {
    expect(() => verificarPuedeVenderEnSede(vendedor)).toThrow(ForbiddenException);
    expect(() => verificarPuedeVenderEnSede(vendedor, 'NV')).toThrow(ForbiddenException);
    expect(() => verificarPuedeVenderEnSede(vendedor, 'TICKET')).toThrow(ForbiddenException);
  });

  it('deja cotizar, nota de pedido y OT en esa sede', () => {
    for (const t of ['COT', 'NP', 'OT']) {
      expect(() => verificarPuedeVenderEnSede(vendedor, t)).not.toThrow();
    }
    // Un tipo mal escrito no se cuela como "no es venta".
    expect(() => verificarPuedeVenderEnSede(vendedor, 'cot')).toThrow(ForbiddenException);
  });

  it('deja vender en las otras sedes', () => {
    expect(() => verificarPuedeVenderEnSede({ ...vendedor, sedeId: 1 }, 'NV')).not.toThrow();
  });

  it('sin sede en el token mira la del body: no se puede saltar mandándola', () => {
    const sinSede = { ...vendedor, sedeId: null };
    expect(() => verificarPuedeVenderEnSede(sinSede, 'NV', 2)).toThrow(ForbiddenException);
    expect(() => verificarPuedeVenderEnSede(sinSede, 'NV', 1)).not.toThrow();
    expect(() => verificarPuedeVenderEnSede(sinSede, 'NV')).toThrow(ForbiddenException);
  });

  it('con sede en el token, la del body no cuenta (es la que se usa al emitir)', () => {
    expect(() => verificarPuedeVenderEnSede(vendedor, 'NV', 1)).toThrow(ForbiddenException);
  });

  it('el admin de la empresa nunca se restringe', () => {
    expect(() => verificarPuedeVenderEnSede({ ...vendedor, rol: 'ADMIN_EMPRESA' })).not.toThrow();
  });

  it('sin la lista (token viejo) no bloquea', () => {
    expect(() => verificarPuedeVenderEnSede({ rol: 'USUARIO_EMPRESA', sedeId: 2 })).not.toThrow();
  });
});
