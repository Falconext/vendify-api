import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PublicBranding = {
  key: string;
  authBrand?: string;
  isWhiteLabel: boolean;
  name: string;
  legalName: string;
  website: string;
  email: string;
  phone: string;
  whatsapp: string;
  logo: string;
  logoWhite: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  socials: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    twitter?: string;
  };
  dashboardUrl: string;
};

// Marca pública para vitrinas (brand strip). Subconjunto seguro de PublicBranding.
type ShowcaseBrand = {
  key: string;
  name: string;
  domain: string;
  website: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
};

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicBranding(inputHost?: string): Promise<PublicBranding> {
    const host = this.normalizeHost(inputHost);
    const defaults = this.getDefaults();

    let reseller = await this.prisma.reseller.findFirst({
      where: {
        activo: true,
        dominioPersonalizado: host,
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        dominioPersonalizado: true,
        whiteLabelNombre: true,
        whiteLabelLogoUrl: true,
        whiteLabelLogoWhiteUrl: true,
        whiteLabelFaviconUrl: true,
        whiteLabelColorPrimario: true,
        whiteLabelColorSecundario: true,
        whiteLabelWebsite: true,
        whiteLabelEmail: true,
        whiteLabelTelefono: true,
        whiteLabelWhatsapp: true,
      },
    });

    // Fallback for rows saved with protocol, www or port (legacy/manual data)
    if (!reseller) {
      const candidates = await this.prisma.reseller.findMany({
        where: {
          activo: true,
          dominioPersonalizado: { not: null },
        },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          dominioPersonalizado: true,
          whiteLabelNombre: true,
          whiteLabelLogoUrl: true,
          whiteLabelLogoWhiteUrl: true,
          whiteLabelFaviconUrl: true,
          whiteLabelColorPrimario: true,
          whiteLabelColorSecundario: true,
          whiteLabelWebsite: true,
          whiteLabelEmail: true,
          whiteLabelTelefono: true,
          whiteLabelWhatsapp: true,
        },
      });

      reseller =
        candidates.find((item) =>
          this.hostMatches(item.dominioPersonalizado || '', host),
        ) || null;
    }

    if (!reseller) {
      return defaults;
    }

    return this.mergeResellerBranding(reseller, defaults, `https://${host}`);
  }

  // Marcas blancas activas para vitrinas públicas (brand strip del landing).
  // Solo campos seguros; excluye resellers sin white-label (usan la marca base).
  async getShowcase(): Promise<ShowcaseBrand[]> {
    const resellers = await this.prisma.reseller.findMany({
      where: {
        activo: true,
        whiteLabelNombre: { not: null },
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        dominioPersonalizado: true,
        whiteLabelNombre: true,
        whiteLabelLogoUrl: true,
        whiteLabelWebsite: true,
        whiteLabelColorPrimario: true,
        whiteLabelColorSecundario: true,
      },
      orderBy: { creadoEn: 'asc' },
    });

    const defaults = this.getDefaults();
    return resellers.map((r) => {
      const website =
        r.whiteLabelWebsite ||
        (r.dominioPersonalizado ? `https://${r.dominioPersonalizado}` : '');
      const domain =
        r.dominioPersonalizado || this.normalizeHost(website) || '';
      return {
        key: r.codigo?.toLowerCase?.() || `reseller-${r.id}`,
        name: r.whiteLabelNombre || r.nombre,
        domain,
        website,
        logo: r.whiteLabelLogoUrl || '',
        primaryColor: r.whiteLabelColorPrimario || defaults.primaryColor,
        secondaryColor: r.whiteLabelColorSecundario || defaults.secondaryColor,
      };
    });
  }

  async getPublicBrandingByResellerId(
    resellerId: number,
  ): Promise<PublicBranding> {
    const defaults = this.getDefaults();

    const reseller = await this.prisma.reseller.findUnique({
      where: { id: resellerId, activo: true },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        dominioPersonalizado: true,
        whiteLabelNombre: true,
        whiteLabelLogoUrl: true,
        whiteLabelLogoWhiteUrl: true,
        whiteLabelFaviconUrl: true,
        whiteLabelColorPrimario: true,
        whiteLabelColorSecundario: true,
        whiteLabelWebsite: true,
        whiteLabelEmail: true,
        whiteLabelTelefono: true,
        whiteLabelWhatsapp: true,
      },
    });

    if (!reseller) return defaults;

    const dashboardUrl = reseller.dominioPersonalizado
      ? `https://${reseller.dominioPersonalizado}`
      : defaults.dashboardUrl;

    return this.mergeResellerBranding(reseller, defaults, dashboardUrl);
  }

  private mergeResellerBranding(
    reseller: {
      id: number;
      codigo?: string | null;
      nombre: string;
      whiteLabelNombre?: string | null;
      whiteLabelLogoUrl?: string | null;
      whiteLabelLogoWhiteUrl?: string | null;
      whiteLabelFaviconUrl?: string | null;
      whiteLabelColorPrimario?: string | null;
      whiteLabelColorSecundario?: string | null;
      whiteLabelWebsite?: string | null;
      whiteLabelEmail?: string | null;
      whiteLabelTelefono?: string | null;
      whiteLabelWhatsapp?: string | null;
    },
    defaults: PublicBranding,
    dashboardUrl: string,
  ): PublicBranding {
    return {
      ...defaults,
      key: reseller.codigo?.toLowerCase?.() || `reseller-${reseller.id}`,
      isWhiteLabel: true,
      name: reseller.whiteLabelNombre || reseller.nombre || defaults.name,
      legalName:
        reseller.whiteLabelNombre || reseller.nombre || defaults.legalName,
      website: reseller.whiteLabelWebsite || defaults.website,
      email: reseller.whiteLabelEmail || defaults.email,
      phone: reseller.whiteLabelTelefono || defaults.phone,
      whatsapp: reseller.whiteLabelWhatsapp || defaults.whatsapp,
      logo: reseller.whiteLabelLogoUrl || defaults.logo,
      logoWhite:
        reseller.whiteLabelLogoWhiteUrl ||
        reseller.whiteLabelLogoUrl ||
        defaults.logoWhite,
      favicon: reseller.whiteLabelFaviconUrl || defaults.favicon,
      primaryColor: reseller.whiteLabelColorPrimario || defaults.primaryColor,
      secondaryColor:
        reseller.whiteLabelColorSecundario || defaults.secondaryColor,
      dashboardUrl,
    };
  }

  private normalizeHost(rawHost?: string): string {
    const source = String(rawHost || '')
      .trim()
      .toLowerCase();
    const stripped = source
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split(':')[0];
    return stripped;
  }

  private normalizeHostCompact(rawHost?: string): string {
    return this.normalizeHost(rawHost).replace(/[^a-z0-9]/g, '');
  }

  private hostMatches(savedHost: string, requestHost: string): boolean {
    const saved = this.normalizeHost(savedHost);
    const requested = this.normalizeHost(requestHost);
    return (
      saved === requested ||
      this.normalizeHostCompact(saved) === this.normalizeHostCompact(requested)
    );
  }

  // Marca base (flagship) de la plataforma: Vendify. Cuando el host coincide con
  // el dominioPersonalizado de un reseller, mergeResellerBranding sobreescribe
  // esto con la marca blanca de ese reseller (logo, nombre, colores).
  private getDefaults(): PublicBranding {
    return {
      key: 'vendify',
      // Marca canónica para autenticación: las empresas se guardan con brand
      // 'default' (marca única neutra), así que el portal debe autenticar como
      // 'default' aunque se muestre como "Vendify".
      authBrand: 'default',
      isWhiteLabel: false,
      name: process.env.APP_BRAND_NAME || 'Vendify',
      legalName: 'Vendify',
      website: 'https://vendify.pe',
      email: 'hola@vendify.pe',
      phone: '',
      whatsapp: '',
      logo: '/svg/vendify.svg',
      logoWhite: '/svg/vendify.svg',
      favicon: '/svg/vendify.svg',
      primaryColor: '#4F46E5',
      secondaryColor: '#312E81',
      socials: {},
      dashboardUrl: 'https://app.vendify.pe',
    };
  }
}
