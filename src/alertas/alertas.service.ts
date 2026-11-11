import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import {
  Alerta,
  FrenoDeAvisos,
  alertaDeClaveFallida,
  alertaDeEquipoNuevo,
  correosDeAlerta,
  describirEquipo,
  destinosDeAlerta,
  huellaDeEquipo,
  registrarAvisador,
} from './alertas';

/** Contraseñas equivocadas seguidas en una cuenta de administrador del sistema antes de avisar. */
export const CLAVES_FALLIDAS_PARA_AVISAR = 3;
const VENTANA_CLAVES_MS = 15 * 60 * 1000;

/**
 * Envía los avisos al equipo de la plataforma: WhatsApp desde el número de la
 * plataforma (WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID) a
 * `ALERTAS_TELEFONOS` (si no está, a `SOPORTE_AVISO_TELEFONOS`) y correo a
 * `ALERTAS_CORREOS` si está. Sin destinos configurados solo queda en el log.
 */
@Injectable()
export class AlertasService implements OnModuleInit {
  private readonly logger = new Logger('Alertas');
  private readonly freno = new FrenoDeAvisos();
  private readonly fallidas = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly whatsapp?: WhatsAppService,
  ) {}

  onModuleInit() {
    registrarAvisador((a) => void this.avisar(a));
  }

  /** Envía la alerta si el freno lo deja. Nunca lanza. */
  async avisar(a: Alerta): Promise<boolean> {
    try {
      const frenados = this.freno.pasar(a.clave);
      if (frenados === null) return false;
      const texto =
        frenados > 0
          ? `${a.texto}\n\n(+${frenados} aviso${frenados === 1 ? '' : 's'} repetido${frenados === 1 ? '' : 's'} sin enviar en este rato)`
          : a.texto;
      this.logger.warn(`[alerta] ${a.titulo}`);
      const [wsp, correo] = await Promise.allSettled([
        this.porWhatsapp(a.titulo, texto),
        this.porCorreo(a.titulo, texto),
      ]);
      for (const [canal, r] of [
        ['WhatsApp', wsp],
        ['correo', correo],
      ] as const)
        if (r.status === 'rejected')
          this.logger.warn(
            `[alerta] ${canal} no salió: ${(r.reason as any)?.message ?? r.reason}`,
          );
      return true;
    } catch (e: any) {
      this.logger.error(`[alerta] no se pudo enviar: ${e?.message}`);
      return false;
    }
  }

  private async porWhatsapp(titulo: string, texto: string) {
    const destinos = destinosDeAlerta();
    if (!this.whatsapp || destinos.length === 0) return;
    const envios = await Promise.allSettled(
      destinos.map(async (numero) => {
        // Texto libre desde el número de la plataforma. Vendify no tiene envío
        // por plantilla: si la ventana de 24 h de Meta está cerrada, el aviso
        // queda solo en el log (y en el correo, si hay ALERTAS_CORREOS).
        const r = await this.whatsapp!.enviarTexto(numero, texto);
        if (!r.success)
          this.logger.warn(`[alerta] WhatsApp a ${numero}: ${r.error}`);
      }),
    );
    envios.forEach((r, i) => {
      if (r.status === 'rejected')
        this.logger.warn(
          `[alerta] WhatsApp a ${destinos[i]}: ${(r.reason as any)?.message ?? r.reason}`,
        );
    });
  }

  private async porCorreo(titulo: string, texto: string) {
    const para = correosDeAlerta();
    const llave = process.env.RESEND_API_KEY;
    if (!para.length || !llave) return;
    const { Resend } = await import('resend');
    const desde =
      process.env.RESEND_FROM_EMAIL || process.env.MAIL_FROM || 'noreply@vendify.pe';
    const html = texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>');
    const r = await new Resend(llave).emails.send({
      from: desde,
      to: para,
      subject: `[Alerta] ${titulo}`.slice(0, 180),
      html: `<div style="font-family:sans-serif;font-size:14px">${html}</div>`,
    });
    if ((r as any)?.error)
      this.logger.warn(`[alerta] correo: ${(r as any).error?.message}`);
  }

  /**
   * Un administrador del sistema entró bien. Si el equipo (navegador +
   * sistema + red) no estaba registrado, se registra y se avisa.
   */
  async entradaCorrecta(
    usuario: {
      id: number;
      rol?: string;
      nombre?: string | null;
      email: string;
    },
    ua?: string,
    ip?: string,
  ): Promise<void> {
    try {
      if (usuario?.rol !== 'ADMIN_SISTEMA') return;
      this.fallidas.delete(usuario.email.toLowerCase());
      const huella = huellaDeEquipo(ua, ip);
      const previo = await this.prisma.equipoConocido.findUnique({
        where: { usuarioId_huella: { usuarioId: usuario.id, huella } },
        select: { id: true },
      });
      if (previo) {
        await this.prisma.equipoConocido.update({
          where: { id: previo.id },
          data: { ultimoUso: new Date() },
        });
        return;
      }
      await this.prisma.equipoConocido.create({
        data: {
          usuarioId: usuario.id,
          huella,
          descripcion: describirEquipo(ua),
        },
      });
      await this.avisar(
        alertaDeEquipoNuevo({
          nombre: usuario.nombre || usuario.email,
          email: usuario.email,
          ua,
          ip,
        }),
      );
    } catch (e: any) {
      this.logger.warn(`[alerta] equipo nuevo: ${e?.message}`);
    }
  }

  /**
   * Contraseña equivocada. Si la cuenta es de administrador del sistema y van
   * `CLAVES_FALLIDAS_PARA_AVISAR` en 15 minutos, se avisa.
   */
  async claveEquivocada(
    email: unknown,
    ip?: string,
    ahora = Date.now(),
  ): Promise<void> {
    try {
      if (typeof email !== 'string' || !email.trim()) return;
      const correo = email.trim().toLowerCase();
      const u = await this.prisma.usuario.findUnique({
        where: { email: email.trim() },
        select: { rol: true },
      });
      if (u?.rol !== 'ADMIN_SISTEMA') return;
      const lista = (this.fallidas.get(correo) ?? []).filter(
        (t) => ahora - t < VENTANA_CLAVES_MS,
      );
      lista.push(ahora);
      this.fallidas.set(correo, lista);
      if (lista.length >= CLAVES_FALLIDAS_PARA_AVISAR)
        await this.avisar(
          alertaDeClaveFallida({ email: correo, intentos: lista.length, ip }),
        );
    } catch (e: any) {
      this.logger.warn(`[alerta] clave equivocada: ${e?.message}`);
    }
  }
}
