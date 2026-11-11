import { ForbiddenException } from '@nestjs/common';
import { camposDeMiEmpresa, empresaSinSecretos } from './empresa-mia';

describe('PUT /empresa/mia: qué puede cambiar cada rol', () => {
  it.each([
    'planId',
    'fechaExpiracion',
    'fechaActivacion',
    'brand',
    'producto',
    'ruc',
    'razonSocial',
    'tipoEmpresa',
    'rubroId',
    'usaDemo',
    'billingProvider',
    'billingApiToken',
    'providerToken',
    'usuario',
    'id',
  ])('el administrador no puede cambiar %s', (campo) => {
    expect(
      camposDeMiEmpresa({ [campo]: 1, nombreComercial: 'X' }, 'ADMIN_EMPRESA'),
    ).toEqual({ nombreComercial: 'X' });
  });

  it('un empleado sigue guardando las preferencias del POS', () => {
    const cuerpo = {
      cotizTerminosDefault: 'T',
      usarPrecioLoteFefo: true,
      facturaFormatoConfig: { a: 1 },
    };
    expect(camposDeMiEmpresa(cuerpo, 'USUARIO_EMPRESA')).toEqual(cuerpo);
  });

  it.each(['yapeNumero', 'shalomPassword', 'whatsappPhoneNumberId', 'logo'])(
    'un empleado no puede cambiar %s',
    (campo) => {
      expect(() =>
        camposDeMiEmpresa({ [campo]: 'x' }, 'USUARIO_EMPRESA'),
      ).toThrow(ForbiddenException);
    },
  );

  it('un empleado que manda un campo de sistema no cambia nada', () => {
    expect(camposDeMiEmpresa({ planId: 9 }, 'USUARIO_EMPRESA')).toEqual({});
  });

  it('respeta false, cero, vacío y null para poder apagar o borrar', () => {
    const cuerpo = {
      culqiActivo: false,
      yapeNumero: '',
      whatsappPhoneNumberId: null,
    };
    expect(camposDeMiEmpresa(cuerpo, 'ADMIN_EMPRESA')).toEqual(cuerpo);
  });

  it('un cuerpo vacío no rompe', () => {
    expect(camposDeMiEmpresa(undefined, 'ADMIN_EMPRESA')).toEqual({});
  });
});

describe('empresaSinSecretos', () => {
  const empresa = {
    id: 1,
    usuarioPse: 'visible',
    culqiPublicKey: 'pk',
    contrasenaPse: 's',
    mpAccessToken: 's',
    mpRefreshToken: 's',
    whatsappApiToken: 's',
    instagramToken: 's',
    tiktokToken: 's',
    tiktokRefreshToken: 's',
    facebookPageToken: 's',
    billingApiToken: 's',
    billingApiPassword: 's',
    providerToken: 's',
    takiyAppKey: 's',
    takiyAuthKey: 's',
    culqiSecretKey: 's',
    niubizPassword: 's',
    sunatClientSecret: 's',
    sireClientSecret: 's',
    sireClaveSol: 's',
    shalomPassword: 's',
  };

  it('no deja salir ningún secreto y conserva lo demás', () => {
    const limpia = empresaSinSecretos(empresa);
    expect(JSON.stringify(limpia)).not.toContain('"s"');
    expect(limpia).toMatchObject({
      id: 1,
      usuarioPse: 'visible',
      culqiPublicKey: 'pk',
    });
  });

  it('avisa si hay credenciales sin mostrarlas', () => {
    expect(empresaSinSecretos(empresa)).toMatchObject({
      whatsappApiTokenConfigured: true,
      shalomConfigured: true,
    });
    expect(empresaSinSecretos({ id: 1 })).toMatchObject({
      whatsappApiTokenConfigured: false,
      shalomConfigured: false,
    });
  });

  it('un número conectado por Embedded Signup cuenta como configurado', () => {
    expect(
      empresaSinSecretos({
        whatsappProvider: 'EMPRESA',
        whatsappPhoneNumberId: '123',
      }).whatsappApiTokenConfigured,
    ).toBe(true);
  });
});
