/**
 * FORKLIFT HNS, guía T001-25 (03-11): transporte privado con DNI y placa pero
 * sin licencia. Se guardó, se envió y SUNAT la rechazó con el código 2572. El
 * dato que falta tiene que avisarse en el sistema, antes de SUNAT.
 */
import { BadRequestException } from '@nestjs/common';
import { faltaDatoDelConductor } from './datos-conductor';
import { GuiaRemisionService } from './guia-remision.service';

const forklift = () => ({
  tipoGuia: 'REMITENTE',
  modoTransporte: '02',
  vehiculoM1oL: false,
  conductorNumDoc: '43808239',
  conductorNombre: 'DAVID ',
  conductorApellidos: 'SALDAÑA ',
  conductorLicencia: '',
  vehiculoPlaca: 'OQ6897',
});

describe('datos del conductor en transporte privado', () => {
  it('sin licencia avisa qué falta (el caso que SUNAT rechazó con 2572)', () => {
    expect(faltaDatoDelConductor(forklift())).toBe(
      'Para transporte privado SUNAT exige: N° de licencia del conductor.',
    );
  });

  it('junta todo lo que falta en un solo mensaje', () => {
    expect(
      faltaDatoDelConductor({ ...forklift(), conductorNombre: ' ', conductorApellidos: null, vehiculoPlaca: '' }),
    ).toBe('Para transporte privado SUNAT exige: placa del vehículo, nombres del conductor, apellidos del conductor, N° de licencia del conductor.');
  });

  it('con licencia válida pasa', () => {
    expect(faltaDatoDelConductor({ ...forklift(), conductorLicencia: 'Q43808239' })).toBeNull();
    expect(faltaDatoDelConductor({ ...forklift(), conductorLicencia: 'q43808239 ' })).toBeNull();
  });

  it('rechaza una licencia con formato que SUNAT no acepta', () => {
    for (const lic of ['43808', 'Q-43808239', 'Q438082391234']) {
      expect(faltaDatoDelConductor({ ...forklift(), conductorLicencia: lic })).toMatch(/9 o 10 letras y números/);
    }
  });

  it('no exige conductor en transporte público ni en vehículo M1/L', () => {
    expect(faltaDatoDelConductor({ ...forklift(), modoTransporte: '01' })).toBeNull();
    expect(faltaDatoDelConductor({ ...forklift(), vehiculoM1oL: true })).toBeNull();
  });
});

describe('GuiaRemisionService', () => {
  it('no deja guardar la guía sin licencia', () => {
    const servicio = new GuiaRemisionService({} as any, {} as any, {} as any, {} as any);
    expect(() => (servicio as any).validateGuiaRemision(forklift())).toThrow(BadRequestException);
    expect(() => (servicio as any).validateGuiaRemision({ ...forklift(), conductorLicencia: 'Q43808239' })).not.toThrow();
  });

  it('no envía a SUNAT una guía guardada sin licencia', async () => {
    const enviarGuia = jest.fn();
    const prisma: any = {
      guiaRemision: { findFirst: jest.fn().mockResolvedValue({ id: 125, empresaId: 30, estadoSunat: 'PENDIENTE', ...forklift() }) },
      empresa: { findUnique: jest.fn().mockResolvedValue({ usuarioPse: 'u', contrasenaPse: 'p', usaDemo: false }) },
    };
    const servicio = new GuiaRemisionService(prisma, { enviarGuia } as any, {} as any, {} as any);
    jest.spyOn(servicio, 'findOne').mockResolvedValue({ id: 125, empresaId: 30, estadoSunat: 'PENDIENTE', ...forklift() } as any);
    await expect(servicio.enviarSunat(125, 30)).rejects.toThrow(/N° de licencia del conductor\. Edita la guía/);
    expect(enviarGuia).not.toHaveBeenCalled();
  });
});
