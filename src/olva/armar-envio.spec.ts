import {
  armarEnvioOlva,
  categoriaOlva,
  celularOlva,
  nombresRemitenteOlva,
  tallaOlvaParaPeso,
} from './armar-envio';

const base = {
  ruc: '20100000001',
  razonSocial: 'MODA & LINEA S.A.C.',
  celularRemitente: '+51 999 888 777',
  correoRemitente: 'tienda@mail.com',
  documentoDestinatario: '47065472',
  nombreDestinatario: 'CLIENTE PRUEBA',
  celularDestinatario: '991065217',
  sedeOrigenId: '43',
  agenciaOrigen: '7',
  agenciaDestino: '145',
  talla: tallaOlvaParaPeso(1)!,
  contenido: 'Polos',
  valorDeclarado: 80,
};

describe('armarEnvioOlva', () => {
  it('manda los campos que pide el proveedor, no los del contrato viejo', () => {
    const envio: any = armarEnvioOlva(base);
    expect(envio.sender).toEqual({
      documentType: 'ruc',
      documentNumber: '20100000001',
      firstNames: 'MODA Y LINEA',
      lastName: 'SAC',
      phone: '999888777',
      email: 'tienda@mail.com',
    });
    expect(envio.recipient).toMatchObject({
      documentNumber: '47065472',
      documentTypeCode: '4',
      fullName: 'CLIENTE PRUEBA',
    });
    expect(envio.origin).toEqual({ headquarterId: '43' });
    expect(envio.destination).toEqual({ agencyCode: '145' });
    expect(envio.whoPays).toBe('DESTINATION');
    expect(envio.deliveryType).toBe('O');
    expect(envio.service).toBeUndefined();
  });

  it('un RUC de destinatario va con el código 6', () => {
    const envio = armarEnvioOlva({ ...base, documentoDestinatario: '20100000002' });
    expect(envio.recipient.documentTypeCode).toBe('6');
  });

  it('solo pasa una clave de 4 dígitos; si no, la genera Olva', () => {
    expect(armarEnvioOlva({ ...base, clave: '4821' }).pin).toBe('4821');
    expect(armarEnvioOlva({ ...base, clave: '12' }).pin).toBeUndefined();
  });

  it('mantiene el valor declarado en el rango que acepta Olva', () => {
    expect(armarEnvioOlva({ ...base, valorDeclarado: 0 }).package.declaredValue).toBe(1);
    expect(armarEnvioOlva({ ...base, valorDeclarado: 4000 }).package.declaredValue).toBe(1500);
  });

  it('solo pide borrador cuando se indica', () => {
    expect(armarEnvioOlva(base).confirm).toBeUndefined();
    expect(armarEnvioOlva({ ...base, confirmar: false }).confirm).toBe(false);
  });
});

describe('nombresRemitenteOlva', () => {
  it('reparte la razón social sin signos', () => {
    expect(nombresRemitenteOlva('COMERCIAL D´ANA E.I.R.L.')).toEqual({
      firstNames: 'COMERCIAL D ANA',
      lastName: 'EIRL',
    });
  });

  it('con una sola palabra repite el nombre', () => {
    expect(nombresRemitenteOlva('KREZKA')).toEqual({
      firstNames: 'KREZKA',
      lastName: 'KREZKA',
    });
  });
});

describe('tallaOlvaParaPeso', () => {
  it.each([
    [0.3, 'extra-extra-small', 0.5],
    [0.7, 'extra-small', 1],
    [1, 'extra-small', 1],
    [1.3, 'small', 2],
    [10, 'big', 10],
  ])('%s kg usa %s con el peso exacto de la talla', (kg, sizeId, pesoKg) => {
    expect(tallaOlvaParaPeso(kg)).toEqual({ sizeId, pesoKg });
  });

  it('más de 10 kg no tiene talla', () => {
    expect(tallaOlvaParaPeso(10.5)).toBeNull();
  });
});

describe('categoriaOlva', () => {
  it('reconoce el contenido sin importar tildes ni mayúsculas', () => {
    expect(categoriaOlva('COSMÉTICOS varios')).toBe(167);
    expect(categoriaOlva('Cámara de seguridad')).toBe(999);
  });

  it('sin coincidencia va como ropa', () => {
    expect(categoriaOlva('Polos y casacas')).toBe(227);
  });
});

describe('celularOlva', () => {
  it('deja los 9 dígitos', () => {
    expect(celularOlva('+51 991-065-217')).toBe('991065217');
    expect(celularOlva(null)).toBe('');
  });
});
