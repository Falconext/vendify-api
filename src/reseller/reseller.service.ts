import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  Reseller,
  ResellerRecarga,
  ResellerMovimiento,
  EstadoType,
  Prisma,
} from '@prisma/client'; // Import EstadoType
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';
import { SedeService } from 'src/sede/sede.service';
import { S3Service } from 'src/s3/s3.service';
import * as bcrypt from 'bcrypt';
import { resolveBillingProvider } from 'src/common/utils/billing-provider';
import { QpseClient } from 'src/common/utils/qpse.client';
import axios from 'axios';

// Vendify volume-based reseller pricing (cost the platform charges the reseller per active client/month).
// Tiers: [1-5 clients, 6-15 clients, 16-30 clients, 31+ clients]
// Precio mayorista MENSUAL por tramos de volumen (1-5, 6-15, 16-30, 31+).
const VENDIFY_VOLUME_PRICING: Record<
  string,
  [number, number, number, number]
> = {
  Emprendedor: [15, 14, 13, 12],
  Negocio: [30, 29, 28, 27],
  Corporativo: [45, 44, 43, 42],
};

// Precio mayorista ANUAL (plano, 10× base = 2 meses gratis). Sin tramos.
const VENDIFY_ANNUAL_PRICING: Record<string, number> = {
  Emprendedor: 150,
  Negocio: 300,
  Corporativo: 450,
};

function getAnnualPrice(planNombre: string): number | null {
  const normalized = normalizePlanName(planNombre);
  const key = Object.keys(VENDIFY_ANNUAL_PRICING).find(
    (item) => normalizePlanName(item) === normalized,
  );
  return key ? VENDIFY_ANNUAL_PRICING[key] : null;
}

function normalizePlanName(planNombre: string): string {
  return String(planNombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getVolumeTierPrice(
  planNombre: string,
  clientesActivos: number,
): number | null {
  const normalized = normalizePlanName(planNombre);
  const key = Object.keys(VENDIFY_VOLUME_PRICING).find(
    (item) => normalizePlanName(item) === normalized,
  );
  const prices = key ? VENDIFY_VOLUME_PRICING[key] : undefined;
  if (!prices) return null;
  if (clientesActivos <= 5) return prices[0];
  if (clientesActivos <= 15) return prices[1];
  if (clientesActivos <= 30) return prices[2];
  return prices[3];
}

@Injectable()
export class ResellerService {
  constructor(
    private prisma: PrismaService,
    private readonly notificacionesService: NotificacionesService,
    private readonly sedeService: SedeService,
    private readonly s3: S3Service,
    private readonly qpseClient: QpseClient,
  ) {}

  async uploadLogo(
    resellerId: number,
    file: Express.Multer.File,
  ): Promise<string> {
    const ct = file.mimetype || 'image/jpeg';
    const ext = ct.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const key = `logos/reseller-${resellerId}/logo-${Date.now()}.${ext}`;
    return this.s3.uploadImage(file.buffer, key, ct);
  }

  private calculatePlanCostWithDiscount(planCost: number, discount: number) {
    return planCost * (1 - discount / 100);
  }

  private resolveClientCost(
    planNombre: string,
    planCosto: number,
    porcentajeDescuento: number,
    clientesActivos: number,
    ciclo: string = 'MENSUAL',
  ): number {
    // Ciclo ANUAL: precio plano (sin tramos de volumen).
    if (String(ciclo).toUpperCase() === 'ANUAL') {
      const annual = getAnnualPrice(planNombre);
      if (annual !== null) return annual;
      // Fallback: 10× el costo mensual estimado (2 meses gratis).
      const monthly =
        getVolumeTierPrice(planNombre, clientesActivos) ??
        this.calculatePlanCostWithDiscount(planCosto, porcentajeDescuento);
      return Math.round(monthly * 10 * 100) / 100;
    }
    const tierPrice = getVolumeTierPrice(planNombre, clientesActivos);
    if (tierPrice !== null) return tierPrice;
    return this.calculatePlanCostWithDiscount(planCosto, porcentajeDescuento);
  }

  // Días a extender el vencimiento según el ciclo.
  private getCicloDias(ciclo: string): number {
    return String(ciclo).toUpperCase() === 'ANUAL' ? 365 : 30;
  }

  /**
   * Aprovisiona (o re-aprovisiona) las credenciales QPSE de una empresa usando
   * el token maestro de la plataforma. Idempotente: si ya tiene credenciales,
   * no vuelve a crear. Reutilizado tanto en la activación de cliente como en la
   * acción manual "Generar credenciales QPSE" del detalle.
   */
  async provisionarQpse(
    empresaId: number,
    opts?: { forzar?: boolean },
  ): Promise<{ ok: boolean; message: string; provisionado?: boolean }> {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        id: true,
        ruc: true,
        usaDemo: true,
        billingProvider: true,
        usuarioPse: true,
        contrasenaPse: true,
      },
    });
    if (!empresa) return { ok: false, message: 'Empresa no encontrada' };
    if (String(empresa.billingProvider).toUpperCase() !== 'QPSE') {
      return { ok: false, message: 'El proveedor de la empresa no es QPSE' };
    }
    if (!this.qpseClient.getIntegrationToken()) {
      return {
        ok: false,
        message: 'La plataforma no tiene configurado el token maestro de QPSE',
      };
    }
    if (empresa.usuarioPse && empresa.contrasenaPse && !opts?.forzar) {
      return {
        ok: true,
        message: 'La empresa ya tiene credenciales QPSE configuradas',
        provisionado: false,
      };
    }
    try {
      const prov = await this.qpseClient.crearEmpresa({
        ruc: empresa.ruc,
        usaDemo: Boolean(empresa.usaDemo),
      });
      await this.prisma.empresa.update({
        where: { id: empresaId },
        data: { usuarioPse: prov.username, contrasenaPse: prov.password },
      });
      console.log(
        `[QPSE] Empresa aprovisionada: ${empresa.ruc} → usuario ${prov.username}`,
      );
      return {
        ok: true,
        message: 'Credenciales QPSE generadas correctamente',
        provisionado: true,
      };
    } catch (e) {
      const message = (e as Error)?.message || 'Error al aprovisionar en QPSE';
      console.error(
        `[QPSE] Auto-aprovisionamiento falló para ${empresa.ruc}: ${message}`,
      );
      return { ok: false, message };
    }
  }

  /** Valida que la empresa pertenezca al reseller y aprovisiona QPSE. */
  async aprovisionarQpseCliente(
    resellerId: number,
    empresaId: number,
    opts?: { forzar?: boolean },
  ) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, resellerId },
      select: { id: true },
    });
    if (!empresa) {
      throw new BadRequestException(
        'El cliente no pertenece a este distribuidor.',
      );
    }
    return this.provisionarQpse(empresaId, opts);
  }

  // Normaliza el precio que el reseller cobra al cliente. Null/0/negativo => null
  // (se usará el precio de lista del plan como estimado de ingreso).
  private normalizePrecioClienteFinal(
    value: number | string | null | undefined,
  ): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.round(num * 100) / 100;
  }

  // Ingreso mensual del reseller por un cliente: el precio que le cobra, o si no
  // lo definió, el precio de lista del plan (supuesto: revende a precio de lista).
  private computeIngresoCliente(
    precioClienteFinal: Prisma.Decimal | number | null | undefined,
    planCosto: Prisma.Decimal | number,
  ): { ingreso: number; esEstimado: boolean } {
    const precio = this.normalizePrecioClienteFinal(
      precioClienteFinal === null || precioClienteFinal === undefined
        ? null
        : Number(precioClienteFinal),
    );
    if (precio !== null) return { ingreso: precio, esEstimado: false };
    return { ingreso: Number(planCosto) || 0, esEstimado: true };
  }

  private getTierLabel(clientesActivos: number): string {
    if (clientesActivos <= 5) return '1-5 clientes';
    if (clientesActivos <= 15) return '6-15 clientes';
    if (clientesActivos <= 30) return '16-30 clientes';
    return '31+ clientes';
  }

  private getRenewalPolicy() {
    const graceDays = Math.max(
      0,
      Number(process.env.RESELLER_RENEWAL_GRACE_DAYS ?? 3),
    );
    const maxRetries = Math.max(
      1,
      Number(process.env.RESELLER_RENEWAL_MAX_RETRIES ?? 3),
    );
    return { graceDays, maxRetries };
  }

  private normalizeUbigeo(value: unknown): string | null {
    if (Array.isArray(value)) {
      const last = value.filter(Boolean).at(-1);
      return last ? String(last).trim() : null;
    }
    const text = String(value ?? '').trim();
    return text || null;
  }

  private async notifyResellerUsers(
    tx: Prisma.TransactionClient,
    resellerId: number,
    payload: {
      tipo: 'INFO' | 'WARNING' | 'CRITICAL';
      titulo: string;
      mensaje: string;
      empresaId?: number;
    },
  ) {
    const users = await tx.usuario.findMany({
      where: { resellerId, rol: 'RESELLER', estado: 'ACTIVO' },
      select: { id: true },
    });

    for (const user of users) {
      await this.notificacionesService.crearNotificacion({
        usuarioId: user.id,
        empresaId: payload.empresaId,
        tipo: payload.tipo,
        titulo: payload.titulo,
        mensaje: payload.mensaje,
      });
    }
  }

  async validateResellerAccess(
    userId: number,
    role: string,
    resellerId: number,
  ) {
    if (role === 'ADMIN_SISTEMA') return;

    if (role !== 'RESELLER') {
      throw new ForbiddenException(
        'No tiene permisos para acceder a este recurso.',
      );
    }

    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { resellerId: true },
    });

    if (!user?.resellerId || user.resellerId !== resellerId) {
      throw new ForbiddenException('No tiene acceso a este distribuidor.');
    }
  }

  // Dominio base de la plataforma (para subdominios de reseller *.vendify.pe).
  private readonly BASE_DOMAIN = process.env.APP_BASE_DOMAIN || 'vendify.pe';
  // Subdominios reservados: no se pueden asignar a un reseller.
  private readonly SUBDOMINIOS_RESERVADOS = new Set([
    'app', 'www', 'api', 'admin', 'mail', 'ftp', 'smtp', 'pop', 'imap',
    'ns', 'ns1', 'ns2', 'blog', 'shop', 'tienda', 'pay', 'pagos',
    'staging', 'stage', 'dev', 'test', 'demo', 'soporte', 'support',
    'vendify', 'root', 'system', 'sistema', 'panel', 'dashboard',
    'cdn', 'assets', 'static', 'status', 'docs', 'help', 'ayuda',
    'account', 'cuenta', 'billing', 'facturacion', 'login', 'auth',
  ]);

  /**
   * Normaliza un dominio a host limpio (sin protocolo, www, puerto ni ruta).
   */
  private normalizarDominio(raw?: string | null): string {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split(':')[0];
  }

  /**
   * Valida el dominio/subdominio de un reseller. Acepta:
   *  - Subdominio directo de la plataforma: `<label>.vendify.pe` (label válido y no reservado).
   *  - Dominio propio del reseller: `misistema.com` (formato de host válido).
   * Lanza BadRequestException si es inválido o reservado. Vacío = permitido (sin dominio).
   */
  private validarDominioReseller(dominio: string): void {
    if (!dominio) return;
    if (!/^[a-z0-9.-]+$/.test(dominio) || dominio.includes('..')) {
      throw new BadRequestException('El dominio contiene caracteres inválidos.');
    }
    if (dominio === this.BASE_DOMAIN) {
      throw new BadRequestException(
        `No puedes usar el dominio principal ${this.BASE_DOMAIN}.`,
      );
    }
    const sufijo = `.${this.BASE_DOMAIN}`;
    if (dominio.endsWith(sufijo)) {
      const label = dominio.slice(0, -sufijo.length);
      if (label.includes('.')) {
        throw new BadRequestException(
          `Solo se permite un subdominio directo (ej: micliente.${this.BASE_DOMAIN}).`,
        );
      }
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
        throw new BadRequestException(
          'El subdominio debe tener 1-63 caracteres: letras, números y guiones (sin empezar ni terminar en guion).',
        );
      }
      if (this.SUBDOMINIOS_RESERVADOS.has(label)) {
        throw new BadRequestException(
          `El subdominio "${label}" está reservado. Elige otro.`,
        );
      }
    }
    // else: dominio propio del reseller → formato básico ya validado.
  }

  /**
   * Chequea si un dominio/subdominio está disponible para un reseller.
   * Devuelve un resultado estructurado (no lanza) para feedback en vivo en la UI.
   */
  async checkDominioDisponible(
    dominioRaw: string,
    excludeId?: number,
  ): Promise<{ disponible: boolean; motivo?: string; dominio: string }> {
    const dominio = this.normalizarDominio(dominioRaw);
    if (!dominio) {
      return { disponible: false, motivo: 'Ingresa un dominio.', dominio };
    }
    try {
      this.validarDominioReseller(dominio);
    } catch (e: any) {
      const msg =
        e instanceof BadRequestException
          ? ((e.getResponse() as any)?.message ?? e.message)
          : 'Dominio inválido.';
      return { disponible: false, motivo: msg, dominio };
    }
    const existing = await this.prisma.reseller.findFirst({
      where: {
        dominioPersonalizado: dominio,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      return {
        disponible: false,
        motivo: 'Ese dominio ya está en uso por otro reseller.',
        dominio,
      };
    }
    return { disponible: true, dominio };
  }

  async create(data: {
    nombre: string;
    email: string;
    codigo: string;
    telefono?: string;
    representante?: string;
    dominioPersonalizado?: string;
    whiteLabelNombre?: string;
    whiteLabelLogoUrl?: string;
    whiteLabelLogoWhiteUrl?: string;
    whiteLabelFaviconUrl?: string;
    whiteLabelColorPrimario?: string;
    whiteLabelColorSecundario?: string;
    whiteLabelWebsite?: string;
    whiteLabelEmail?: string;
    whiteLabelTelefono?: string;
    whiteLabelWhatsapp?: string;
  }) {
    const dominioPersonalizado = this.normalizarDominio(
      data.dominioPersonalizado,
    );
    this.validarDominioReseller(dominioPersonalizado);

    const existing = await this.prisma.reseller.findFirst({
      where: {
        OR: [
          { email: data.email },
          { codigo: data.codigo },
          ...(dominioPersonalizado ? [{ dominioPersonalizado }] : []),
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('El email o código ya existe.');
    }

    // Transaction to create Reseller AND User
    return this.prisma.$transaction(async (tx) => {
      const reseller = await tx.reseller.create({
        data: {
          ...data,
          dominioPersonalizado: dominioPersonalizado || null,
        },
      });

      // Create User for Login
      // Must have role RESELLER
      // Check if user exists first? Email matches Reseller email.
      const userExists = await tx.usuario.findUnique({
        where: { email: data.email },
      });
      if (userExists) {
        // If user exists, we might need to update role or throw error?
        // For simplicity, assume new user for now or throw
        throw new BadRequestException(
          'El usuario con este email ya existe en el sistema.',
        );
      }

      // Generate temp password (or default) - In production use email service
      const hashedPassword = await bcrypt.hash('123456', 10);

      await tx.usuario.create({
        data: {
          nombre: data.nombre,
          email: data.email,
          password: hashedPassword,
          rol: 'RESELLER',
          estado: 'ACTIVO',
          dni: data.codigo || '00000000', // Placeholder or use code
          celular: data.telefono || '-', // Placeholder
          resellerId: reseller.id, // LINK USER TO RESELLER
          // empresaId is null for Resellers? Or we create a placeholder company?
          // Auth logic expects company status for non-system admin.
          // IMPORTANT: AuthService:111 Checks company status if NOT system admin.
          // We need to bypass this for RESELLER in Auth Service or make Reseller a System Admin type?
          // Schema says: rol can be RESELLER.
        },
      });

      return reseller;
    });
  }

  async update(id: number, data: any) {
    return this.prisma.$transaction(async (tx) => {
      const reseller = await tx.reseller.findUnique({
        where: { id },
        select: { id: true, email: true },
      });

      if (!reseller) {
        throw new NotFoundException('Reseller no encontrado');
      }

      const nextEmail =
        typeof data?.email === 'string' ? data.email.trim() : undefined;
      const shouldUpdateUserEmail = !!nextEmail && nextEmail !== reseller.email;
      const nextDomainRaw =
        typeof data?.dominioPersonalizado === 'string'
          ? data.dominioPersonalizado
          : undefined;
      const nextDomain =
        nextDomainRaw !== undefined
          ? this.normalizarDominio(nextDomainRaw)
          : undefined;
      if (nextDomain) this.validarDominioReseller(nextDomain);

      if (shouldUpdateUserEmail) {
        const existingUser = await tx.usuario.findFirst({
          where: {
            email: nextEmail,
            NOT: { resellerId: id },
          },
          select: { id: true },
        });

        if (existingUser) {
          throw new BadRequestException(
            'El correo ya está en uso por otro usuario del sistema.',
          );
        }

        await tx.usuario.updateMany({
          where: { resellerId: id, rol: 'RESELLER' },
          data: { email: nextEmail },
        });
      }

      if (nextDomain !== undefined) {
        const existingDomain = await tx.reseller.findFirst({
          where: {
            dominioPersonalizado: nextDomain || null,
            NOT: { id },
          },
          select: { id: true },
        });
        if (existingDomain) {
          throw new BadRequestException(
            'El dominio personalizado ya está en uso por otro reseller.',
          );
        }
        data.dominioPersonalizado = nextDomain || null;
      }

      return tx.reseller.update({
        where: { id },
        data,
      });
    });
  }

  // Lectura de la config de marca blanca del propio reseller (para el panel
  // self-service). Devuelve solo los campos de branding.
  async getBranding(id: number) {
    const reseller = await this.prisma.reseller.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        codigo: true,
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
    if (!reseller) throw new NotFoundException('Reseller no encontrado');
    return { ...reseller, baseDomain: this.BASE_DOMAIN };
  }

  // Actualización self-service de la marca blanca del reseller. A diferencia de
  // update() (admin, campo libre), aquí se filtran los campos permitidos para
  // que el reseller no pueda tocar saldo, descuento ni estado.
  async updateBranding(
    id: number,
    data: {
      dominioPersonalizado?: string | null;
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
  ) {
    return this.prisma.$transaction(async (tx) => {
      const reseller = await tx.reseller.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!reseller) throw new NotFoundException('Reseller no encontrado');

      const update: Prisma.ResellerUpdateInput = {};

      if (data.dominioPersonalizado !== undefined) {
        const nextDomain = this.normalizarDominio(data.dominioPersonalizado);
        if (nextDomain) {
          this.validarDominioReseller(nextDomain);
          const existingDomain = await tx.reseller.findFirst({
            where: { dominioPersonalizado: nextDomain, NOT: { id } },
            select: { id: true },
          });
          if (existingDomain) {
            throw new BadRequestException(
              'El dominio personalizado ya está en uso por otro distribuidor.',
            );
          }
        }
        update.dominioPersonalizado = nextDomain || null;
      }

      const textFields: Array<keyof typeof data> = [
        'whiteLabelNombre',
        'whiteLabelLogoUrl',
        'whiteLabelLogoWhiteUrl',
        'whiteLabelFaviconUrl',
        'whiteLabelColorPrimario',
        'whiteLabelColorSecundario',
        'whiteLabelWebsite',
        'whiteLabelEmail',
        'whiteLabelTelefono',
        'whiteLabelWhatsapp',
      ];
      for (const field of textFields) {
        if (data[field] !== undefined) {
          const value = String(data[field] ?? '').trim();
          (update as any)[field] = value || null;
        }
      }

      await tx.reseller.update({ where: { id }, data: update });
      return this.getBranding(id);
    });
  }

  async toggleActiveStatus(id: number, activo: boolean) {
    const reseller = await this.prisma.reseller.findUnique({ where: { id } });
    if (!reseller) throw new NotFoundException('Reseller no encontrado');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reseller.update({
        where: { id },
        data: { activo },
      });

      await tx.usuario.updateMany({
        where: { resellerId: id, rol: 'RESELLER' },
        data: { estado: activo ? 'ACTIVO' : 'INACTIVO' },
      });

      return updated;
    });
  }

  async findAll() {
    return this.prisma.reseller.findMany({
      include: {
        _count: {
          select: { empresas: true },
        },
      },
    });
  }

  async findOne(id: number) {
    const reseller = await this.prisma.reseller.findUnique({
      where: { id },
      include: {
        empresas: {
          where: { estado: { not: EstadoType.ELIMINADO } },
          include: {
            plan: true,
            usuarios: {
              where: { rol: 'ADMIN_EMPRESA' },
              take: 1,
              select: { id: true, email: true, nombre: true },
            },
          },
        },
        recargas: {
          orderBy: { fecha: 'desc' },
          take: 10,
        },
        movimientos: {
          orderBy: { fecha: 'desc' },
          take: 10,
        },
      },
    });

    if (!reseller) throw new NotFoundException('Reseller no encontrado');
    return reseller;
  }

  async recargarSaldo(
    resellerId: number,
    monto: number,
    usuarioId: number,
    referencia?: string,
  ) {
    if (monto <= 0) throw new BadRequestException('El monto debe ser positivo');

    // La recarga SOLO agrega saldo. El descuento del reseller es únicamente por
    // volumen de clientes (tramos en getVolumeTierPrice) — la recarga NUNCA
    // modifica el porcentaje de descuento.

    return this.prisma.$transaction(async (tx) => {
      // 1. Crear registro de recarga
      await tx.resellerRecarga.create({
        data: {
          resellerId,
          monto,
          usuarioId,
          referencia,
          medioPago: 'MANUAL',
        },
      });

      // 2. Actualizar saldo del reseller (sin tocar el descuento)
      const reseller = await tx.reseller.update({
        where: { id: resellerId },
        data: {
          saldo: { increment: monto },
        },
      });

      // 3. Registrar movimiento (Ingreso)
      await tx.resellerMovimiento.create({
        data: {
          resellerId,
          tipo: 'RECARGA',
          monto: monto,
          descripcion: `Recarga de saldo Ref: ${referencia || 'S/N'}`,
        },
      });

      return reseller;
    });
  }

  async createClient(
    resellerId: number,
    data: {
      rut: string;
      razonSocial: string;
      nombreComercial?: string;
      direccion?: string;
      logo?: string | null;
      departamento?: string;
      provincia?: string;
      distrito?: string;
      ubigeo?: string | string[];
      rubroId?: number | string | null;
      usaCodigoBarrasManual?: boolean;
      usaDemo?: boolean;
      precioClienteFinal?: number | string | null;
      esWhiteLabel?: boolean;
      cicloFacturacion?: string;
      email: string;
      password?: string;
      representa?: string;
      celular?: string;
      planId?: number | string;
      billingProvider?: 'QPSE' | 'APISUNAT' | 'JAMBLE';
      billingApiBaseUrl?: string;
      billingApiDemoBaseUrl?: string;
      billingApiToken?: string;
      billingApiUser?: string;
      billingApiPassword?: string;
      providerId?: string;
      providerToken?: string;
      usuarioPse?: string;
      contrasenaPse?: string;
      series?: Array<{
        tipoDoc: string;
        serie: string;
        correlativo?: number;
        activo?: boolean;
      }>;
    },
  ) {
    const inputRuc = String(data.rut || '').trim();
    const inputEmail = String(data.email || '')
      .trim()
      .toLowerCase();
    const inputUbigeo = this.normalizeUbigeo(data.ubigeo);
    if (!inputRuc) throw new BadRequestException('El RUC es obligatorio.');
    if (!inputEmail) throw new BadRequestException('El email es obligatorio.');

    const empresa = await this.prisma
      .$transaction(async (tx) => {
        // 1. Fetch Reseller & Check Balance (Locked for safety?)
        const reseller = await tx.reseller.findUnique({
          where: { id: resellerId },
        });
        if (!reseller) throw new NotFoundException('Reseller no encontrado');
        if (!reseller.activo) {
          throw new BadRequestException(
            'El distribuidor está inactivo y no puede registrar nuevos clientes.',
          );
        }

        const [existingEmpresa, existingUser] = await Promise.all([
          tx.empresa.findUnique({
            where: { ruc: inputRuc },
            select: { id: true },
          }),
          tx.usuario.findUnique({
            where: { email: inputEmail },
            select: { id: true },
          }),
        ]);
        if (existingEmpresa) {
          throw new BadRequestException(
            'Ya existe una empresa registrada con ese RUC.',
          );
        }
        if (existingUser) {
          throw new BadRequestException(
            'Ya existe un usuario registrado con ese email.',
          );
        }

        // 2. Determine Plan
        const planId = data.planId ? Number(data.planId) : null;
        let plan;
        if (!planId) {
          const defaultPlan = await tx.plan.findFirst();
          if (!defaultPlan) throw new Error('No hay planes configurados');
          plan = defaultPlan;
        } else {
          plan = await tx.plan.findUnique({ where: { id: planId } });
          if (!plan) throw new NotFoundException('Plan no encontrado');
        }

        // 3. Calculate Cost (volume-based, percentage-based otherwise)
        const planCosto = Number(plan.costo);
        const descuento = Number((reseller as any).porcentajeDescuento) || 0;
        const clientesActuales = await tx.empresa.count({
          where: { resellerId, estado: 'ACTIVO' },
        });
        const clientesConNuevo = clientesActuales + 1;
        const ciclo =
          String((data as any).cicloFacturacion || 'MENSUAL').toUpperCase() ===
          'ANUAL'
            ? 'ANUAL'
            : 'MENSUAL';
        const costoFinal = this.resolveClientCost(
          plan.nombre,
          planCosto,
          descuento,
          clientesConNuevo,
          ciclo,
        );

        if (Number(reseller.saldo) < costoFinal) {
          throw new BadRequestException(
            `Saldo insuficiente. El plan cuesta S/${costoFinal.toFixed(2)} y tienes S/${Number(reseller.saldo).toFixed(2)}`,
          );
        }

        // 4. Deduct Balance
        await tx.reseller.update({
          where: { id: resellerId },
          data: { saldo: { decrement: costoFinal } },
        });

        const usaPrecioPorVolumen =
          getVolumeTierPrice(plan.nombre, clientesConNuevo) !== null;
        const cicloLabel = ciclo === 'ANUAL' ? 'Anual' : 'Mensual';
        const descripcionActivacion = usaPrecioPorVolumen
          ? `Activación cliente: ${data.razonSocial} - Plan: ${plan.nombre} (${cicloLabel}${ciclo === 'ANUAL' ? '' : ` · Tier ${this.getTierLabel(clientesConNuevo)}`})`
          : `Activación cliente: ${data.razonSocial} - Plan: ${plan.nombre} (${cicloLabel} · ${descuento}% Off)`;

        await tx.resellerMovimiento.create({
          data: {
            resellerId,
            tipo: 'ACTIVACION',
            monto: -costoFinal,
            descripcion: descripcionActivacion,
          },
        });

        const unidadMedida = await tx.unidadMedida.findFirst();
        if (!unidadMedida) {
          throw new BadRequestException(
            'No hay unidades de medida disponibles en el sistema',
          );
        }

        const requestedProvider = String(
          data.billingProvider || '',
        ).toUpperCase();
        const billingProvider =
          requestedProvider === 'QPSE' ||
          requestedProvider === 'APISUNAT' ||
          requestedProvider === 'JAMBLE'
            ? requestedProvider
            : 'QPSE';

        if (billingProvider === 'APISUNAT') {
          if (!data.providerId || !data.providerToken) {
            throw new BadRequestException(
              'Para APISUNAT debes enviar providerId y providerToken.',
            );
          }
        }

        // QPSE ya no exige credenciales manuales: si la plataforma tiene token
        // maestro se auto-aprovisionan tras crear la empresa; si no, quedan
        // vacías y se pueden completar luego desde el detalle del cliente. Por
        // eso NO se lanza error aquí para el proveedor QPSE.

        if (billingProvider === 'JAMBLE') {
          const hasToken = !!String(data.billingApiToken || '').trim();
          const hasBasicAuth =
            !!String(data.billingApiUser || '').trim() &&
            !!String(data.billingApiPassword || '').trim();
          const selectedBaseUrl = data.usaDemo
            ? String(
                data.billingApiDemoBaseUrl || data.billingApiBaseUrl || '',
              ).trim()
            : String(data.billingApiBaseUrl || '').trim();
          if (!selectedBaseUrl || (!hasToken && !hasBasicAuth)) {
            throw new BadRequestException(
              'Para JAMBLE debes enviar la URL API del entorno seleccionado y token o usuario/clave API.',
            );
          }
        }

        // 5. Create Empresa
        const empresa = await tx.empresa.create({
          data: {
            ruc: inputRuc, // RUC logic
            razonSocial: data.razonSocial,
            nombreComercial: data.nombreComercial || data.razonSocial,
            direccion: data.direccion || '-',
            logo: data.logo || null,
            departamento: data.departamento || null,
            provincia: data.provincia || null,
            distrito: data.distrito || null,
            ubigeo: inputUbigeo,
            empresaUbigeo: inputUbigeo,
            rubroId: data.rubroId ? Number(data.rubroId) : null,
            usaCodigoBarrasManual: Boolean(data.usaCodigoBarrasManual),
            fechaActivacion: new Date(),
            fechaExpiracion: new Date(
              new Date().setDate(new Date().getDate() + this.getCicloDias(ciclo)),
            ), // +30 (mensual) o +365 (anual)
            cicloFacturacion: ciclo,
            planId: plan.id,
            resellerId: resellerId,
            billingProvider: billingProvider as any,
            billingApiBaseUrl: data.billingApiBaseUrl || null,
            billingApiDemoBaseUrl: data.billingApiDemoBaseUrl || null,
            billingApiToken: data.billingApiToken || null,
            billingApiUser: data.billingApiUser || null,
            billingApiPassword: data.billingApiPassword || null,
            providerId: data.providerId || null,
            providerToken: data.providerToken || null,
            usuarioPse: data.usuarioPse || null,
            contrasenaPse: data.contrasenaPse || null,
            usaDemo:
              data.usaDemo !== undefined
                ? Boolean(data.usaDemo)
                : billingProvider === 'APISUNAT',
            slugTienda: inputRuc + Math.floor(Math.random() * 1000), // Temp slug
            costoActivacionReseller: costoFinal,
            precioClienteFinal: this.normalizePrecioClienteFinal(
              data.precioClienteFinal,
            ),
            esWhiteLabel: Boolean(data.esWhiteLabel),
            clientes: {
              create: {
                nombre: 'CLIENTES VARIOS',
                nroDoc: '10000000',
                estado: 'ACTIVO',
                tipoDocumento: { connect: { codigo: '1' } },
              },
            },
            productos: {
              create: [
                {
                  codigo: 'DGD',
                  descripcion: 'Descuento global',
                  unidadMedidaId: unidadMedida.id,
                  precioUnitario: 0,
                  valorUnitario: 0,
                  igvPorcentaje: 0,
                  stock: 0,
                  tipoAfectacionIGV: '10',
                  estado: 'INACTIVO',
                },
                {
                  codigo: 'IPM',
                  descripcion: 'Interes por mora',
                  unidadMedidaId: unidadMedida.id,
                  precioUnitario: 0,
                  valorUnitario: 0,
                  igvPorcentaje: 0,
                  stock: 0,
                  tipoAfectacionIGV: '10',
                  estado: 'INACTIVO',
                },
                {
                  codigo: 'PLD',
                  descripcion: 'Penalidad',
                  unidadMedidaId: unidadMedida.id,
                  precioUnitario: 0,
                  valorUnitario: 0,
                  igvPorcentaje: 0,
                  stock: 0,
                  tipoAfectacionIGV: '10',
                  estado: 'INACTIVO',
                },
              ],
            },
          } as any,
        });

        // 6. Create User (Admin Empresa)
        const hashedPassword = await bcrypt.hash(data.password || '123456', 10);
        await tx.usuario.create({
          data: {
            nombre: data.representa || 'Administrador',
            email: inputEmail,
            password: hashedPassword,
            rol: 'ADMIN_EMPRESA',
            empresaId: empresa.id,
            dni: '-',
            celular: data.celular || '-',
          },
        });

        const validTipos = new Set([
          '01',
          '03',
          '07',
          '08',
          'TICKET',
          'NV',
          'RH',
          'CP',
          'NP',
          'OT',
          'COT',
        ]);
        const series = (data.series || [])
          .map((item) => ({
            tipoDoc: String(item.tipoDoc || '')
              .trim()
              .toUpperCase(),
            serie: String(item.serie || '')
              .trim()
              .toUpperCase(),
            correlativo: Math.max(1, Number(item.correlativo || 1)),
            activo: item.activo !== false,
          }))
          .filter(
            (item) => validTipos.has(item.tipoDoc) && item.serie.length >= 2,
          );
        if (series.length) {
          await tx.empresaSerie.createMany({
            data: series.map((item) => ({ empresaId: empresa.id, ...item })),
            skipDuplicates: true,
          });
        }

        return empresa;
      })
      .catch((error: unknown) => {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new BadRequestException(
            'No se pudo crear el cliente porque ya existe un dato único (RUC, email o slug).',
          );
        }
        throw error;
      });

    // Auto-aprovisionamiento QPSE (fuera de la transacción para no bloquearla
    // con la llamada HTTP). Si el proveedor es QPSE, no hay credenciales
    // manuales y la plataforma tiene token maestro, creamos la empresa en QPSE
    // (que consulta la razón social en SUNAT por el RUC) y guardamos el
    // usuario/clave generados. Si falla, la empresa queda creada igual y se
    // puede re-aprovisionar luego desde el panel de sistema.
    if (empresa.billingProvider === 'QPSE') {
      // No bloquea la activación: si falla, la empresa queda creada y se puede
      // re-aprovisionar desde el detalle del cliente.
      await this.provisionarQpse(empresa.id);
    }

    const sedePrincipal = await this.sedeService.create(
      {
        nombre: 'Sede Principal',
        direccion: empresa.direccion || '-',
        codigo: '001',
        esPrincipal: true,
        activo: true,
      },
      empresa.id,
    );

    const adminEmpresa = await this.prisma.usuario.findFirst({
      where: { empresaId: empresa.id, rol: 'ADMIN_EMPRESA' },
      select: { id: true },
    });
    if (adminEmpresa && sedePrincipal?.id) {
      await this.prisma.usuarioSede.upsert({
        where: {
          usuarioId_sedeId: {
            usuarioId: adminEmpresa.id,
            sedeId: sedePrincipal.id,
          },
        },
        create: { usuarioId: adminEmpresa.id, sedeId: sedePrincipal.id },
        update: {},
      });
    }

    return empresa;
  }

  async consultarDocumento(numero: string, tipo: string) {
    const cleanNumero = String(numero || '').replace(/\D/g, '');
    const cleanTipo = String(tipo || '').toUpperCase();
    if (cleanTipo !== 'DNI' && cleanTipo !== 'RUC') {
      throw new BadRequestException(
        'La consulta automática solo está disponible para DNI y RUC.',
      );
    }
    if (cleanTipo === 'DNI' && cleanNumero.length !== 8) {
      throw new BadRequestException('El DNI debe tener 8 dígitos.');
    }
    if (cleanTipo === 'RUC' && cleanNumero.length !== 11) {
      throw new BadRequestException('El RUC debe tener 11 dígitos.');
    }

    const token = process.env.RENIEC_TOKEN;
    if (!token)
      throw new BadRequestException('RENIEC_TOKEN no está configurado.');

    const url =
      cleanTipo === 'DNI'
        ? 'https://apiperu.dev/api/dni'
        : 'https://apiperu.dev/api/ruc';
    const body =
      cleanTipo === 'DNI' ? { dni: cleanNumero } : { ruc: cleanNumero };
    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data?.data;
  }

  async getProfitabilityOverview(days = 30) {
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - Math.max(1, days));

    const [resellers, rejectedRenewals, appliedRenewals] = await Promise.all([
      this.prisma.reseller.findMany({
        include: {
          empresas: {
            where: { estado: 'ACTIVO' },
            select: {
              id: true,
              plan: { select: { costo: true } },
            },
          },
        },
        orderBy: { creadoEn: 'desc' },
      }),
      this.prisma.resellerMovimiento.findMany({
        where: {
          tipo: 'MENSUALIDAD',
          estado: 'RECHAZADO',
          fecha: { gte: periodStart },
          empresaId: { not: null },
        },
        select: {
          resellerId: true,
          empresaId: true,
        },
      }),
      this.prisma.resellerMovimiento.groupBy({
        by: ['resellerId'],
        where: {
          tipo: 'MENSUALIDAD',
          estado: 'APLICADO',
          fecha: { gte: periodStart },
        },
        _sum: { monto: true },
        _count: { _all: true },
      }),
    ]);

    const rejectedMap = new Map<number, Set<number>>();
    for (const item of rejectedRenewals) {
      if (!item.empresaId) continue;
      if (!rejectedMap.has(item.resellerId)) {
        rejectedMap.set(item.resellerId, new Set<number>());
      }
      rejectedMap.get(item.resellerId)!.add(item.empresaId);
    }

    const appliedMap = new Map(
      appliedRenewals.map((item) => [
        item.resellerId,
        {
          totalCobrado: Math.abs(Number(item._sum.monto ?? 0)),
          renovacionesAplicadas: item._count._all,
        },
      ]),
    );

    return resellers.map((reseller) => {
      const clientesActivos = reseller.empresas.length;
      const mrrBruto = reseller.empresas.reduce(
        (acc, empresa) => acc + Number(empresa.plan.costo),
        0,
      );
      const descuento = Number(reseller.porcentajeDescuento) || 0;
      const mrrNeto = this.calculatePlanCostWithDiscount(mrrBruto, descuento);
      const margenMensual = mrrBruto - mrrNeto;
      const margenPct = mrrBruto > 0 ? (margenMensual / mrrBruto) * 100 : 0;

      const clientesPerdidos30d = rejectedMap.get(reseller.id)?.size ?? 0;
      const baseCartera = clientesActivos + clientesPerdidos30d;
      const churn30dPct =
        baseCartera > 0 ? (clientesPerdidos30d / baseCartera) * 100 : 0;

      const applied = appliedMap.get(reseller.id) ?? {
        totalCobrado: 0,
        renovacionesAplicadas: 0,
      };

      return {
        resellerId: reseller.id,
        clientesActivos,
        mrrBruto,
        mrrNeto,
        margenMensual,
        margenPct,
        churn30dPct,
        clientesPerdidos30d,
        renovacionesAplicadas30d: applied.renovacionesAplicadas,
        cobradoRenovaciones30d: applied.totalCobrado,
      };
    });
  }

  async processMonthlyRenewals() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const { graceDays, maxRetries } = this.getRenewalPolicy();

    const vencidas = await this.prisma.empresa.findMany({
      where: {
        resellerId: { not: null },
        fechaExpiracion: { lte: now },
        estado: { in: ['ACTIVO', 'INACTIVO'] },
      },
      select: {
        id: true,
        razonSocial: true,
        fechaExpiracion: true,
        resellerId: true,
        cicloFacturacion: true,
        plan: { select: { id: true, nombre: true, costo: true } },
      },
      orderBy: { fechaExpiracion: 'asc' },
    });

    let renovadas = 0;
    let suspendidas = 0;

    for (const empresa of vencidas) {
      if (!empresa.resellerId) continue;

      await this.prisma.$transaction(async (tx) => {
        const movimientoHoy = await tx.resellerMovimiento.findFirst({
          where: {
            resellerId: empresa.resellerId!,
            empresaId: empresa.id,
            tipo: 'MENSUALIDAD',
            fecha: { gte: startOfDay },
          },
        });

        if (movimientoHoy) return;

        const ultimoIntento = await tx.resellerMovimiento.findFirst({
          where: {
            resellerId: empresa.resellerId!,
            empresaId: empresa.id,
            tipo: 'MENSUALIDAD',
          },
          orderBy: { fecha: 'desc' },
          select: { intento: true },
        });

        const intentoActual = (ultimoIntento?.intento ?? 0) + 1;

        const reseller = await tx.reseller.findUnique({
          where: { id: empresa.resellerId! },
          select: { id: true, saldo: true, porcentajeDescuento: true },
        });

        if (!reseller) return;

        const planCosto = Number(empresa.plan.costo);
        const descuento = Number(reseller.porcentajeDescuento) || 0;
        const clientesActivos = await tx.empresa.count({
          where: { resellerId: reseller.id, estado: 'ACTIVO' },
        });
        const cicloEmpresa =
          String((empresa as any).cicloFacturacion || 'MENSUAL').toUpperCase() ===
          'ANUAL'
            ? 'ANUAL'
            : 'MENSUAL';
        const costoFinal = this.resolveClientCost(
          empresa.plan.nombre,
          planCosto,
          descuento,
          clientesActivos,
          cicloEmpresa,
        );
        const saldoActual = Number(reseller.saldo);
        const diasVencida = Math.max(
          0,
          Math.floor(
            (now.getTime() - empresa.fechaExpiracion.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );
        const enGracia = diasVencida <= graceDays;

        if (saldoActual >= costoFinal) {
          const baseFecha =
            empresa.fechaExpiracion > now
              ? new Date(empresa.fechaExpiracion)
              : new Date(now);
          const nuevaFechaExpiracion = new Date(baseFecha);
          nuevaFechaExpiracion.setDate(
            nuevaFechaExpiracion.getDate() + this.getCicloDias(cicloEmpresa),
          );

          await tx.reseller.update({
            where: { id: reseller.id },
            data: { saldo: { decrement: costoFinal } },
          });

          await tx.empresa.update({
            where: { id: empresa.id },
            data: {
              fechaExpiracion: nuevaFechaExpiracion,
              estado: 'ACTIVO',
            },
          });

          await tx.resellerMovimiento.create({
            data: {
              resellerId: reseller.id,
              empresaId: empresa.id,
              tipo: 'MENSUALIDAD',
              monto: -costoFinal,
              estado: 'APLICADO',
              intento: intentoActual,
              descripcion:
                cicloEmpresa === 'ANUAL'
                  ? `Renovación anual cliente: ${empresa.razonSocial} - Plan: ${empresa.plan.nombre}`
                  : getVolumeTierPrice(empresa.plan.nombre, clientesActivos) !==
                      null
                    ? `Renovación mensual cliente: ${empresa.razonSocial} - Plan: ${empresa.plan.nombre} (Tier ${this.getTierLabel(clientesActivos)})`
                    : `Renovación mensual cliente: ${empresa.razonSocial} - Plan: ${empresa.plan.nombre} (${descuento}% Off)`,
            },
          });

          await this.notifyResellerUsers(tx, reseller.id, {
            empresaId: empresa.id,
            tipo: 'INFO',
            titulo: 'Renovación aplicada',
            mensaje: `Se renovó ${empresa.razonSocial} por S/${costoFinal.toFixed(2)}. Nuevo vencimiento: ${nuevaFechaExpiracion.toLocaleDateString('es-PE')}.`,
          });

          renovadas += 1;
          return;
        }

        if (enGracia && intentoActual <= maxRetries) {
          await tx.resellerMovimiento.create({
            data: {
              resellerId: reseller.id,
              empresaId: empresa.id,
              tipo: 'MENSUALIDAD',
              monto: 0,
              estado: 'PENDIENTE',
              intento: intentoActual,
              motivo: 'SALDO_INSUFICIENTE',
              descripcion: `Renovación pendiente por saldo insuficiente: ${empresa.razonSocial}. Intento ${intentoActual}/${maxRetries}.`,
            },
          });

          await this.notifyResellerUsers(tx, reseller.id, {
            empresaId: empresa.id,
            tipo: 'WARNING',
            titulo: 'Renovación pendiente',
            mensaje: `No se pudo renovar ${empresa.razonSocial} por saldo insuficiente. Intento ${intentoActual}/${maxRetries}. Días de gracia restantes: ${Math.max(0, graceDays - diasVencida)}.`,
          });

          return;
        }

        await tx.empresa.update({
          where: { id: empresa.id },
          data: { estado: 'INACTIVO' },
        });

        await tx.resellerMovimiento.create({
          data: {
            resellerId: reseller.id,
            empresaId: empresa.id,
            tipo: 'MENSUALIDAD',
            monto: 0,
            estado: 'RECHAZADO',
            intento: intentoActual,
            motivo: 'SALDO_INSUFICIENTE',
            descripcion: `No renovado por saldo insuficiente: ${empresa.razonSocial} - Plan: ${empresa.plan.nombre}. Cliente suspendido.`,
          },
        });

        await this.notifyResellerUsers(tx, reseller.id, {
          empresaId: empresa.id,
          tipo: 'CRITICAL',
          titulo: 'Cliente suspendido por falta de saldo',
          mensaje: `${empresa.razonSocial} fue suspendido por no renovar dentro del periodo de gracia o por superar intentos de cobro.`,
        });

        suspendidas += 1;
      });
    }

    return {
      totalEvaluadas: vencidas.length,
      renovadas,
      suspendidas,
    };
  }

  async getDashboardStats(resellerId: number) {
    const reseller = await this.prisma.reseller.findUnique({
      where: { id: resellerId },
      select: {
        saldo: true,
        preciosPlan: true,
        _count: {
          select: { empresas: true },
        },
      },
    });

    if (!reseller) throw new NotFoundException('Reseller no encontrado');

    // Count suspended vs active clients if needed
    const clientesActivos = await this.prisma.empresa.count({
      where: { resellerId, estado: 'ACTIVO' },
    });

    const clientesSuspendidos = await this.prisma.empresa.count({
      where: {
        resellerId,
        estado: { in: [EstadoType.INACTIVO, EstadoType.PLACEHOLDER] },
      },
    });

    const totalClientes = await this.prisma.empresa.count({
      where: { resellerId, estado: { not: EstadoType.ELIMINADO } },
    });

    // Resumen de ganancia mensual real (ingreso cobrado − costo plataforma).
    const earnings = await this.buildEarnings(resellerId);

    return {
      saldo: reseller.saldo,
      totalClientes,
      clientesActivos,
      clientesSuspendidos,
      // Inteligencia de ganancias
      ingresoMensual: earnings.resumen.ingresoMensual,
      costoMensual: earnings.resumen.costoMensual,
      gananciaMensual: earnings.resumen.gananciaMensual,
      margenPct: earnings.resumen.margenPct,
      clientesWhiteLabel: earnings.resumen.clientesWhiteLabel,
      clientesEstandar: earnings.resumen.clientesEstandar,
      preciosPlan: reseller.preciosPlan ?? null,
    };
  }

  /**
   * Guarda el precio de venta que el reseller cobra por plan. Formato:
   * { "Emprendedor": 25, "Negocio": 60, "Corporativo": 120 }. Valores <= 0 o
   * inválidos se descartan.
   */
  async updatePreciosPlan(
    resellerId: number,
    precios: Record<string, unknown>,
  ) {
    const clean: Record<string, number> = {};
    for (const [plan, valor] of Object.entries(precios || {})) {
      const num = Number(valor);
      if (Number.isFinite(num) && num > 0) {
        clean[String(plan).trim()] = Math.round(num * 100) / 100;
      }
    }
    await this.prisma.reseller.update({
      where: { id: resellerId },
      data: { preciosPlan: clean as any },
    });
    return { ok: true, preciosPlan: clean };
  }

  // Núcleo de inteligencia de ganancias del reseller: por cada cliente activo
  // calcula ingreso (precio a cliente, o precio de lista si no se definió),
  // costo (lo que paga a la plataforma) y ganancia. Reutilizado por dashboard
  // y proyección.
  private async buildEarnings(resellerId: number) {
    const reseller = await this.prisma.reseller.findUnique({
      where: { id: resellerId },
      select: { porcentajeDescuento: true },
    });
    if (!reseller) throw new NotFoundException('Reseller no encontrado');

    const descuento = Number(reseller.porcentajeDescuento) || 0;

    const empresas = await this.prisma.empresa.findMany({
      where: { resellerId, estado: 'ACTIVO' },
      select: {
        id: true,
        razonSocial: true,
        estado: true,
        fechaExpiracion: true,
        precioClienteFinal: true,
        esWhiteLabel: true,
        logo: true,
        plan: { select: { id: true, nombre: true, costo: true } },
      },
      orderBy: { fechaExpiracion: 'asc' },
    });

    const clientesActivos = empresas.length;

    let ingresoMensual = 0;
    let costoMensual = 0;
    let clientesConPrecio = 0;
    let clientesEstimados = 0;
    let clientesWhiteLabel = 0;

    const clientes = empresas.map((empresa) => {
      const planCosto = Number(empresa.plan.costo);
      const costo = this.resolveClientCost(
        empresa.plan.nombre,
        planCosto,
        descuento,
        clientesActivos,
      );
      const { ingreso, esEstimado } = this.computeIngresoCliente(
        empresa.precioClienteFinal,
        planCosto,
      );
      const ganancia = ingreso - costo;

      ingresoMensual += ingreso;
      costoMensual += costo;
      if (esEstimado) clientesEstimados += 1;
      else clientesConPrecio += 1;
      if (empresa.esWhiteLabel) clientesWhiteLabel += 1;

      return {
        empresaId: empresa.id,
        razonSocial: empresa.razonSocial,
        logo: empresa.logo,
        plan: empresa.plan.nombre,
        esWhiteLabel: empresa.esWhiteLabel,
        fechaExpiracion: empresa.fechaExpiracion,
        precioClienteFinal:
          empresa.precioClienteFinal !== null
            ? Number(empresa.precioClienteFinal)
            : null,
        ingreso: Math.round(ingreso * 100) / 100,
        costo: Math.round(costo * 100) / 100,
        ganancia: Math.round(ganancia * 100) / 100,
        ingresoEsEstimado: esEstimado,
      };
    });

    const gananciaMensual = ingresoMensual - costoMensual;
    const margenPct =
      ingresoMensual > 0 ? (gananciaMensual / ingresoMensual) * 100 : 0;

    return {
      resumen: {
        clientesActivos,
        ingresoMensual: Math.round(ingresoMensual * 100) / 100,
        costoMensual: Math.round(costoMensual * 100) / 100,
        gananciaMensual: Math.round(gananciaMensual * 100) / 100,
        margenPct: Math.round(margenPct * 100) / 100,
        clientesConPrecio,
        clientesEstimados,
        clientesWhiteLabel,
        clientesEstandar: clientesActivos - clientesWhiteLabel,
      },
      clientes,
    };
  }

  // Proyección del próximo mes: ganancia recurrente esperada + renovaciones que
  // vencen en los próximos 30 días (con lo que costará renovar y días restantes).
  async getProyeccion(resellerId: number) {
    const { resumen, clientes } = await this.buildEarnings(resellerId);

    const now = new Date();
    const en30dias = new Date(now);
    en30dias.setDate(en30dias.getDate() + 30);

    const proximasRenovaciones = clientes
      .filter((c) => {
        const fecha = new Date(c.fechaExpiracion);
        return fecha <= en30dias;
      })
      .map((c) => {
        const fecha = new Date(c.fechaExpiracion);
        const diasRestantes = Math.ceil(
          (fecha.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          empresaId: c.empresaId,
          razonSocial: c.razonSocial,
          plan: c.plan,
          esWhiteLabel: c.esWhiteLabel,
          fechaExpiracion: c.fechaExpiracion,
          diasRestantes,
          vencida: diasRestantes < 0,
          costo: c.costo,
          ingreso: c.ingreso,
          ganancia: c.ganancia,
        };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes);

    const costoRenovacionesProximas = proximasRenovaciones.reduce(
      (acc, r) => acc + r.costo,
      0,
    );

    return {
      resumen: {
        ...resumen,
        // Proyección del próximo mes = ganancia recurrente actual (asume que la
        // cartera activa se mantiene y renueva).
        ingresoProyectadoProximoMes: resumen.ingresoMensual,
        costoProyectadoProximoMes: resumen.costoMensual,
        gananciaProyectadaProximoMes: resumen.gananciaMensual,
        costoRenovacionesProximas:
          Math.round(costoRenovacionesProximas * 100) / 100,
        clientesPorRenovar: proximasRenovaciones.length,
      },
      clientes,
      proximasRenovaciones,
    };
  }

  async getRenewalMovements(resellerId: number, estado?: string) {
    const where: any = {
      resellerId,
      tipo: 'MENSUALIDAD',
    };

    if (estado && ['APLICADO', 'PENDIENTE', 'RECHAZADO'].includes(estado)) {
      where.estado = estado;
    }

    const movimientos = await this.prisma.resellerMovimiento.findMany({
      where,
      include: {
        empresa: {
          select: {
            id: true,
            razonSocial: true,
            ruc: true,
            fechaExpiracion: true,
            estado: true,
          },
        },
      },
      orderBy: { fecha: 'desc' },
      take: 100,
    });

    const [aplicados, pendientes, rechazados] = await Promise.all([
      this.prisma.resellerMovimiento.count({
        where: { resellerId, tipo: 'MENSUALIDAD', estado: 'APLICADO' },
      }),
      this.prisma.resellerMovimiento.count({
        where: { resellerId, tipo: 'MENSUALIDAD', estado: 'PENDIENTE' },
      }),
      this.prisma.resellerMovimiento.count({
        where: { resellerId, tipo: 'MENSUALIDAD', estado: 'RECHAZADO' },
      }),
    ]);

    return {
      movimientos,
      resumen: {
        aplicados,
        pendientes,
        rechazados,
        total: aplicados + pendientes + rechazados,
      },
    };
  }

  async getEstadoCuenta(
    resellerId: number,
    filtros?: {
      desde?: string;
      hasta?: string;
      tipo?: string;
      estado?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const reseller = await this.prisma.reseller.findUnique({
      where: { id: resellerId },
      select: {
        id: true,
        nombre: true,
        codigo: true,
        saldo: true,
      },
    });

    if (!reseller) throw new NotFoundException('Reseller no encontrado');

    const now = new Date();
    const desdeDate = filtros?.desde
      ? new Date(`${filtros.desde}T00:00:00.000Z`)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const hastaDate = filtros?.hasta
      ? new Date(`${filtros.hasta}T23:59:59.999Z`)
      : now;
    if (
      Number.isNaN(desdeDate.getTime()) ||
      Number.isNaN(hastaDate.getTime())
    ) {
      throw new BadRequestException('Rango de fechas inválido.');
    }

    const page =
      Number.isFinite(Number(filtros?.page)) && Number(filtros?.page) > 0
        ? Number(filtros?.page)
        : 1;
    const limitRaw =
      Number.isFinite(Number(filtros?.limit)) && Number(filtros?.limit) > 0
        ? Number(filtros?.limit)
        : 50;
    const limit = Math.min(limitRaw, 200);
    const skip = (page - 1) * limit;

    const allowedTypes = new Set([
      'RECARGA',
      'ACTIVACION',
      'MENSUALIDAD',
      'DEVOLUCION',
    ]);
    const allowedStatus = new Set(['APLICADO', 'PENDIENTE', 'RECHAZADO']);
    const tipo = String(filtros?.tipo || '').toUpperCase();
    const estado = String(filtros?.estado || '').toUpperCase();

    const whereMov: Prisma.ResellerMovimientoWhereInput = {
      resellerId,
      fecha: {
        gte: desdeDate,
        lte: hastaDate,
      },
    };

    if (tipo && allowedTypes.has(tipo)) whereMov.tipo = tipo;
    if (estado && allowedStatus.has(estado)) whereMov.estado = estado;

    const [movimientos, totalMovimientos, recargas, resumenRaw] =
      await Promise.all([
        this.prisma.resellerMovimiento.findMany({
          where: whereMov,
          include: {
            empresa: {
              select: {
                id: true,
                ruc: true,
                razonSocial: true,
                estado: true,
                plan: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
              },
            },
          },
          orderBy: { fecha: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.resellerMovimiento.count({ where: whereMov }),
        this.prisma.resellerRecarga.findMany({
          where: {
            resellerId,
            fecha: {
              gte: desdeDate,
              lte: hastaDate,
            },
          },
          orderBy: { fecha: 'desc' },
          take: 200,
        }),
        this.prisma.resellerMovimiento.groupBy({
          by: ['tipo', 'estado'],
          where: {
            resellerId,
            fecha: {
              gte: desdeDate,
              lte: hastaDate,
            },
          },
          _sum: {
            monto: true,
          },
          _count: {
            _all: true,
          },
        }),
      ]);

    const resumen = {
      recargas: {
        total: 0,
        cantidad: 0,
      },
      activaciones: {
        cobrado: 0,
        cantidad: 0,
      },
      mensualidades: {
        cobrado: 0,
        aplicadas: 0,
        pendientes: 0,
        rechazadas: 0,
      },
      devoluciones: {
        total: 0,
        cantidad: 0,
      },
    };

    for (const row of resumenRaw) {
      const sum = Number(row._sum.monto || 0);
      const count = Number(row._count._all || 0);
      if (row.tipo === 'RECARGA') {
        resumen.recargas.total += sum;
        resumen.recargas.cantidad += count;
      }
      if (row.tipo === 'ACTIVACION') {
        resumen.activaciones.cobrado += Math.abs(sum);
        resumen.activaciones.cantidad += count;
      }
      if (row.tipo === 'MENSUALIDAD') {
        if (row.estado === 'APLICADO') {
          resumen.mensualidades.cobrado += Math.abs(sum);
          resumen.mensualidades.aplicadas += count;
        } else if (row.estado === 'PENDIENTE') {
          resumen.mensualidades.pendientes += count;
        } else if (row.estado === 'RECHAZADO') {
          resumen.mensualidades.rechazadas += count;
        }
      }
      if (row.tipo === 'DEVOLUCION') {
        resumen.devoluciones.total += sum;
        resumen.devoluciones.cantidad += count;
      }
    }

    const totalCobrado =
      resumen.activaciones.cobrado + resumen.mensualidades.cobrado;
    const flujoNeto =
      resumen.recargas.total + resumen.devoluciones.total - totalCobrado;

    return {
      reseller: {
        id: reseller.id,
        nombre: reseller.nombre,
        codigo: reseller.codigo,
        saldoActual: Number(reseller.saldo),
      },
      periodo: {
        desde: desdeDate,
        hasta: hastaDate,
      },
      resumen: {
        ...resumen,
        totalCobrado,
        flujoNeto,
      },
      paginacion: {
        page,
        limit,
        total: totalMovimientos,
        totalPages: Math.max(1, Math.ceil(totalMovimientos / limit)),
      },
      movimientos: movimientos.map((mov) => ({
        id: mov.id,
        tipo: mov.tipo,
        estado: mov.estado,
        monto: Number(mov.monto),
        fecha: mov.fecha,
        intento: mov.intento,
        motivo: mov.motivo,
        descripcion: mov.descripcion,
        empresa: mov.empresa,
      })),
      recargas: recargas.map((recarga) => ({
        id: recarga.id,
        fecha: recarga.fecha,
        monto: Number(recarga.monto),
        medioPago: recarga.medioPago,
        referencia: recarga.referencia,
        observacion: recarga.observacion,
      })),
    };
  }

  async getClientDetails(resellerId: number, empresaId: number) {
    // Verify ownership
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, resellerId },
      include: {
        plan: true,
        usuarios: {
          where: { rol: 'ADMIN_EMPRESA' },
          take: 1,
        },
      },
    });

    if (!empresa)
      throw new NotFoundException(
        'Cliente no encontrado o no pertenece a este distribuidor',
      );

    return empresa;
  }

  async toggleClientStatus(
    resellerId: number,
    empresaId: number,
    nuevoEstado: 'ACTIVO' | 'INACTIVO',
  ) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, resellerId },
    });

    if (!empresa) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.empresa.update({
      where: { id: empresaId },
      data: { estado: nuevoEstado as EstadoType },
    });
  }

  async deleteDemoClient(resellerId: number, empresaId: number) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, resellerId },
      select: {
        id: true,
        razonSocial: true,
        usaDemo: true,
        estado: true,
      },
    });

    if (!empresa || empresa.estado === EstadoType.ELIMINADO) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (!empresa.usaDemo) {
      throw new BadRequestException(
        'Solo puedes eliminar clientes en modo demo. En producción usa inactivar/suspender.',
      );
    }

    return this.prisma.empresa.update({
      where: { id: empresaId },
      data: {
        estado: EstadoType.ELIMINADO,
        usuarios: {
          updateMany: {
            where: {},
            data: { estado: EstadoType.INACTIVO },
          },
        },
      },
      select: {
        id: true,
        razonSocial: true,
        estado: true,
        usaDemo: true,
      },
    });
  }

  async updateClientConfig(
    resellerId: number,
    empresaId: number,
    data: {
      billingProvider?: 'QPSE' | 'APISUNAT' | 'JAMBLE';
      billingApiBaseUrl?: string | null;
      billingApiDemoBaseUrl?: string | null;
      billingApiToken?: string | null;
      billingApiUser?: string | null;
      billingApiPassword?: string | null;
      providerId?: string | null;
      providerToken?: string | null;
      usuarioPse?: string | null;
      contrasenaPse?: string | null;
      adminNombre?: string;
      adminEmail?: string;
      adminCelular?: string;
      adminPassword?: string;
      usaDemo?: boolean;
    },
  ) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, resellerId },
      include: {
        usuarios: {
          where: { rol: 'ADMIN_EMPRESA' },
          take: 1,
        },
      },
    });

    if (!empresa) {
      throw new NotFoundException(
        'Cliente no encontrado o no pertenece a este distribuidor',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updateEmpresa: Prisma.EmpresaUpdateInput = {};

      if (data.billingProvider !== undefined) {
        const provider = String(data.billingProvider || '').toUpperCase();
        if (!['QPSE', 'APISUNAT', 'JAMBLE'].includes(provider)) {
          throw new BadRequestException('billingProvider inválido.');
        }
        updateEmpresa.billingProvider = provider as any;
        if (provider === 'APISUNAT') {
          updateEmpresa.usaDemo = true;
        }
      }

      if (data.billingApiBaseUrl !== undefined)
        updateEmpresa.billingApiBaseUrl = data.billingApiBaseUrl || null;
      if (data.billingApiDemoBaseUrl !== undefined)
        updateEmpresa.billingApiDemoBaseUrl =
          data.billingApiDemoBaseUrl || null;
      if (data.billingApiToken !== undefined)
        updateEmpresa.billingApiToken = data.billingApiToken || null;
      if (data.billingApiUser !== undefined)
        updateEmpresa.billingApiUser = data.billingApiUser || null;
      if (data.billingApiPassword !== undefined)
        updateEmpresa.billingApiPassword = data.billingApiPassword || null;
      if (data.providerId !== undefined)
        updateEmpresa.providerId = data.providerId || null;
      if (data.providerToken !== undefined)
        updateEmpresa.providerToken = data.providerToken || null;
      if (data.usuarioPse !== undefined)
        updateEmpresa.usuarioPse = data.usuarioPse || null;
      if (data.contrasenaPse !== undefined)
        updateEmpresa.contrasenaPse = data.contrasenaPse || null;
      if (data.usaDemo !== undefined)
        updateEmpresa.usaDemo = Boolean(data.usaDemo);

      const updatedEmpresa = Object.keys(updateEmpresa).length
        ? await tx.empresa.update({
            where: { id: empresaId },
            data: updateEmpresa,
          })
        : empresa;

      const admin = empresa.usuarios?.[0];
      if (
        admin &&
        (data.adminNombre !== undefined ||
          data.adminEmail !== undefined ||
          data.adminCelular !== undefined ||
          data.adminPassword)
      ) {
        const updateAdmin: Prisma.UsuarioUpdateInput = {};
        if (data.adminNombre !== undefined)
          updateAdmin.nombre = data.adminNombre;
        if (data.adminEmail !== undefined) updateAdmin.email = data.adminEmail;
        if (data.adminCelular !== undefined)
          updateAdmin.celular = data.adminCelular;
        if (data.adminPassword)
          updateAdmin.password = await bcrypt.hash(data.adminPassword, 10);

        await tx.usuario.update({
          where: { id: admin.id },
          data: updateAdmin,
        });
      }

      const finalProvider = resolveBillingProvider(updatedEmpresa as any);
      if (
        finalProvider === 'APISUNAT' &&
        (!updatedEmpresa.providerId || !updatedEmpresa.providerToken)
      ) {
        throw new BadRequestException(
          'APISUNAT requiere providerId y providerToken.',
        );
      }
      if (
        finalProvider === 'QPSE' &&
        (!updatedEmpresa.usuarioPse || !updatedEmpresa.contrasenaPse)
      ) {
        throw new BadRequestException(
          'QPSE requiere usuarioPse y contrasenaPse.',
        );
      }
      if (
        finalProvider === 'JAMBLE' &&
        (!(updatedEmpresa.usaDemo
          ? updatedEmpresa.billingApiDemoBaseUrl ||
            updatedEmpresa.billingApiBaseUrl
          : updatedEmpresa.billingApiBaseUrl) ||
          (!updatedEmpresa.billingApiToken &&
            !(
              updatedEmpresa.billingApiUser && updatedEmpresa.billingApiPassword
            )))
      ) {
        throw new BadRequestException(
          'JAMBLE requiere URL API del entorno seleccionado y token o usuario/clave.',
        );
      }

      return tx.empresa.findUnique({
        where: { id: empresaId },
        include: {
          plan: true,
          usuarios: {
            where: { rol: 'ADMIN_EMPRESA' },
            take: 1,
            select: { id: true, nombre: true, email: true, celular: true },
          },
        },
      });
    });
  }

  async updateClient(
    resellerId: number,
    empresaId: number,
    data: {
      planId?: number;
      telefono?: string;
      razonSocial?: string;
      adminEmail?: string;
      adminPassword?: string;
      nombreComercial?: string;
      direccion?: string;
      logo?: string | null;
      departamento?: string;
      provincia?: string;
      distrito?: string;
      ubigeo?: string | string[];
      rubroId?: number | null;
      usaCodigoBarrasManual?: boolean;
      usaDemo?: boolean;
      precioClienteFinal?: number | string | null;
      esWhiteLabel?: boolean;
    },
  ) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, resellerId },
      include: {
        plan: true,
        usuarios: { where: { rol: 'ADMIN_EMPRESA' }, take: 1 },
      },
    });
    if (!empresa)
      throw new NotFoundException(
        'Cliente no encontrado o no pertenece a este distribuidor',
      );

    return this.prisma.$transaction(async (tx) => {
      const updateEmpresa: Prisma.EmpresaUpdateInput = {};
      if (data.planId !== undefined) {
        const planId = Number(data.planId);
        if (!Number.isInteger(planId) || planId <= 0)
          throw new BadRequestException('Plan inválido.');
        if (planId !== empresa.planId) {
          const plan = await tx.plan.findUnique({
            where: { id: planId },
            select: { id: true },
          });
          if (!plan)
            throw new BadRequestException('El plan seleccionado no existe.');
          (updateEmpresa as any).planId = planId;
        }
      }
      if (data.razonSocial !== undefined)
        updateEmpresa.razonSocial = data.razonSocial;
      if (data.nombreComercial !== undefined)
        updateEmpresa.nombreComercial = data.nombreComercial || null;
      if (data.direccion !== undefined)
        updateEmpresa.direccion = data.direccion || '-';
      if (data.logo !== undefined) updateEmpresa.logo = data.logo || null;
      if (data.departamento !== undefined)
        updateEmpresa.departamento = data.departamento || null;
      if (data.provincia !== undefined)
        updateEmpresa.provincia = data.provincia || null;
      if (data.distrito !== undefined)
        updateEmpresa.distrito = data.distrito || null;
      if (data.ubigeo !== undefined) {
        const inputUbigeo = this.normalizeUbigeo(data.ubigeo);
        updateEmpresa.ubigeo = inputUbigeo;
        if (inputUbigeo) {
          const ubigeo = await tx.ubigeo.findUnique({
            where: { codigo: inputUbigeo },
            select: { codigo: true },
          });
          if (!ubigeo)
            throw new BadRequestException('El ubigeo seleccionado no existe.');
        }
        (updateEmpresa as any).empresaUbigeo = inputUbigeo || null;
      }
      if (data.rubroId !== undefined) {
        const rubroId =
          data.rubroId === null ||
          data.rubroId === undefined ||
          data.rubroId === 0
            ? null
            : Number(data.rubroId);
        if (rubroId !== null && (!Number.isInteger(rubroId) || rubroId <= 0))
          throw new BadRequestException('Rubro inválido.');
        if (rubroId !== null) {
          const rubro = await tx.rubro.findUnique({
            where: { id: rubroId },
            select: { id: true },
          });
          if (!rubro)
            throw new BadRequestException('El rubro seleccionado no existe.');
        }
        (updateEmpresa as any).rubroId = rubroId;
      }
      if (data.usaCodigoBarrasManual !== undefined)
        updateEmpresa.usaCodigoBarrasManual = Boolean(
          data.usaCodigoBarrasManual,
        );
      if (data.usaDemo !== undefined)
        updateEmpresa.usaDemo = Boolean(data.usaDemo);
      if (data.precioClienteFinal !== undefined)
        (updateEmpresa as any).precioClienteFinal =
          this.normalizePrecioClienteFinal(data.precioClienteFinal);
      if (data.esWhiteLabel !== undefined)
        (updateEmpresa as any).esWhiteLabel = Boolean(data.esWhiteLabel);
      if (data.telefono !== undefined)
        updateEmpresa.whatsappTienda = data.telefono;

      if (Object.keys(updateEmpresa).length) {
        await tx.empresa.update({
          where: { id: empresaId },
          data: updateEmpresa,
        });
      }

      const admin = empresa.usuarios?.[0];
      if (admin) {
        const updateAdmin: Prisma.UsuarioUpdateInput = {};
        if (data.adminEmail !== undefined) updateAdmin.email = data.adminEmail;
        if (data.telefono !== undefined) updateAdmin.celular = data.telefono;
        if (data.adminPassword)
          updateAdmin.password = await bcrypt.hash(data.adminPassword, 10);
        if (Object.keys(updateAdmin).length) {
          await tx.usuario.update({
            where: { id: admin.id },
            data: updateAdmin,
          });
        }
      }

      return tx.empresa.findUnique({
        where: { id: empresaId },
        include: {
          plan: true,
          rubro: true,
          usuarios: {
            where: { rol: 'ADMIN_EMPRESA' },
            take: 1,
            select: { id: true, nombre: true, email: true, celular: true },
          },
        },
      });
    });
  }

  async updateClientAmbiente(
    resellerId: number,
    empresaId: number,
    usaDemo: boolean,
  ) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, resellerId },
      select: { id: true },
    });
    if (!empresa)
      throw new NotFoundException(
        'Cliente no encontrado o no pertenece a este distribuidor',
      );
    return this.prisma.empresa.update({
      where: { id: empresaId },
      data: { usaDemo: Boolean(usaDemo) },
      select: { id: true, ruc: true, razonSocial: true, usaDemo: true },
    });
  }

  async getClientSeries(resellerId: number, empresaId: number) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, resellerId },
      select: { id: true },
    });
    if (!empresa)
      throw new NotFoundException(
        'Cliente no encontrado o no pertenece a este distribuidor',
      );

    return this.prisma.empresaSerie.findMany({
      where: { empresaId },
      orderBy: [{ tipoDoc: 'asc' }, { serie: 'asc' }],
    });
  }

  async upsertClientSeries(
    resellerId: number,
    empresaId: number,
    series: Array<{
      tipoDoc: string;
      serie: string;
      correlativo?: number;
      activo?: boolean;
    }>,
  ) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, resellerId },
      select: { id: true },
    });
    if (!empresa)
      throw new NotFoundException(
        'Cliente no encontrado o no pertenece a este distribuidor',
      );

    const validTipos = new Set([
      '01',
      '03',
      '07',
      '08',
      'TICKET',
      'NV',
      'RH',
      'CP',
      'NP',
      'OT',
      'COT',
    ]);
    const cleanSeries = series
      .map((item) => ({
        tipoDoc: String(item.tipoDoc || '')
          .trim()
          .toUpperCase(),
        serie: String(item.serie || '')
          .trim()
          .toUpperCase(),
        correlativo: Math.max(1, Number(item.correlativo || 1)),
        activo: item.activo !== false,
      }))
      .filter((item) => validTipos.has(item.tipoDoc) && item.serie.length >= 2);

    if (!cleanSeries.length)
      throw new BadRequestException('Debes enviar al menos una serie válida.');

    await this.prisma.$transaction(async (tx) => {
      await tx.empresaSerie.deleteMany({ where: { empresaId } });
      await tx.empresaSerie.createMany({
        data: cleanSeries.map((s) => ({ empresaId, ...s })),
      });
    });

    return this.getClientSeries(resellerId, empresaId);
  }
}
