import { ShalomLatService } from './shalom-lat.service';

const respuesta = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data), headers: new Map([['content-type', 'application/pdf']]), arrayBuffer: async () => new ArrayBuffer(1) });

describe('Shalom: agencias y comprobante contra la forma real de la API', () => {
  const original = global.fetch;
  afterEach(() => { global.fetch = original; });
  const servicio = () => new (ShalomLatService as any)();

  it('muestra el nombre oficial, limpio, y conserva el anterior', async () => {
    global.fetch = jest.fn().mockResolvedValue(respuesta({ data: [
      { ter_id: 108, lugar: 'CARABAYLLO', lugar_over: 'CARABAYLLO ESTABLO', nombre: 'LIMA / LIMA / CARABAYLLO / CARABAYLLO ESTABLO', provincia: 'LIMA', departamento: 'LIMA', zona: 'CARABAYLLO', direccion: 'AV. TUPAC AMARU 441' },
      { ter_id: 14, lugar: null, lugar_over: 'MOYOBAMBA  CO', provincia: 'MOYOBAMBA', departamento: 'SAN MARTIN' },
      { ter_id: 99, lugar: 'SOLO LUGAR', lugar_over: '', provincia: 'X', departamento: 'Y' },
    ] })) as any;
    const { data } = await servicio().getAgencias();
    expect(data[0]).toMatchObject({ nombre: 'CARABAYLLO ESTABLO', label: 'CARABAYLLO ESTABLO - LIMA - LIMA', labelAnterior: 'CARABAYLLO - LIMA - LIMA', direccion: 'AV. TUPAC AMARU 441' });
    expect(data[1].nombre).toBe('MOYOBAMBA CO');
    expect(data[2].nombre).toBe('SOLO LUGAR');
  });

  it('el comprobante pide por ose_id con la cuenta Pro', async () => {
    const f = jest.fn().mockResolvedValue(respuesta({}));
    global.fetch = f as any;
    await servicio().ticketImage('101510298', 'WNMH', 'inst-1', '104982094');
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain('/track/voucher?');
    expect(url).toContain('ose_id=104982094');
    expect(url).toContain('instanceId=inst-1');
    expect(url).not.toContain('orderNumber');
  });

  it('sin ose_id pide por número y clave, con la cuenta Pro', async () => {
    const f = jest.fn().mockResolvedValue(respuesta({}));
    global.fetch = f as any;
    await servicio().ticketImage('101510298', 'WNMH', 'inst-1');
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain('orderNumber=101510298');
    expect(url).toContain('orderCode=WNMH');
    expect(url).toContain('instanceId=inst-1');
  });

  it('un error de Shalom muestra el detalle y no "Bad Request"', async () => {
    global.fetch = jest.fn().mockResolvedValue(respuesta({ error: 'Bad Request', message: 'el detalle real' }, 400)) as any;
    await expect(servicio().ticketImage('1', 'A', 'inst-1')).rejects.toThrow('el detalle real');
  });

  it('sesión vencida pide reconectar la cuenta', async () => {
    global.fetch = jest.fn().mockResolvedValue(respuesta({ error: 'Conflict' }, 409)) as any;
    await expect(servicio().ticketImage('1', 'A', 'inst-1')).rejects.toThrow(/Vuelve a conectarla/);
  });
});
