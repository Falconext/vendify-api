import { HttpException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';

const DEFAULT_QPSE_BASE_URL = 'https://cpe.qpse.pe';
const DEFAULT_QPSE_PANEL_BASE_URL = 'https://cpanel.qpse.pe';
const DEFAULT_QPSE_DEMO_BASE_URL = 'https://demo-cpe.qpse.pe';
const DEFAULT_QPSE_AUTH_BASE_URL = 'https://cpe.qpse.pe';

export interface QpseSignResponse {
  success?: boolean;
  external_id?: string;
  message?: string;
  xml?: string;
  hash?: string;
  estado?: number;
  mensaje?: string;
  codigo_hash?: string;
}

export interface QpseSendResponse {
  success?: boolean;
  connection?: boolean;
  sunat_success?: boolean | null;
  state_label?: string | null;
  code?: string | number | null;
  message?: string | null;
  notes?: string[] | null;
  errors?: string[] | null;
  cdr?: string | null;
  ticket?: string | null;
  date_reception?: string | null;
  time?: number | null;
  estado?: number;
  mensaje?: string | null;
  observaciones?: string[] | null;
  errores?: string[] | null;
}

export interface QpseCancelResponse {
  success?: boolean;
  connection?: boolean;
  code?: string | number | null;
  message?: string | null;
  mensaje?: string | null;
  state_label?: string | null;
  notes?: string[] | null;
  errors?: string[] | null;
  observaciones?: string[] | null;
  errores?: string[] | null;
}

export interface QpseAccessTokenResponse {
  token_acceso?: string;
  access_token?: string;
  expira_en?: string | number;
  expires_in?: string | number;
}

export interface QpseCrearEmpresaResponse {
  success?: boolean;
  message?: string;
  username?: string;
  password?: string;
  external_id?: string;
}

export interface QpseEmpresaListItem {
  external_id: string;
  ruc: string;
  name?: string;
  environment?: 'demo' | 'production' | string;
  soap_type_id?: string;
  username?: string;
  password?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface QpsePasarProduccionResponse {
  success?: boolean;
  message?: string;
  data?: {
    external_id?: string;
    ruc?: string;
    environment?: string;
    soap_type_id?: string;
    plan_type?: string;
  };
}

@Injectable()
export class QpseClient {
  private readonly logger = new Logger(QpseClient.name);
  private readonly baseUrl = (
    process.env.QPSE_BASE_URL || DEFAULT_QPSE_BASE_URL
  ).replace(/\/+$/, '');
  private readonly panelBaseUrl = (
    process.env.QPSE_PANEL_BASE_URL || DEFAULT_QPSE_PANEL_BASE_URL
  ).replace(/\/+$/, '');
  private readonly demoBaseUrl = (
    process.env.QPSE_DEMO_BASE_URL || DEFAULT_QPSE_DEMO_BASE_URL
  ).replace(/\/+$/, '');
  private readonly authBaseUrl = (
    process.env.QPSE_AUTH_BASE_URL || DEFAULT_QPSE_AUTH_BASE_URL
  ).replace(/\/+$/, '');
  private readonly integrationToken = process.env.QPSE_ACCESS_TOKEN;
  private readonly client: AxiosInstance;
  private readonly panelClient: AxiosInstance;
  private readonly demoClient: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.panelClient = axios.create({
      baseURL: this.panelBaseUrl,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    this.demoClient = axios.create({
      baseURL: this.demoBaseUrl,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  private getClient(usaDemo?: boolean): AxiosInstance {
    return usaDemo ? this.demoClient : this.client;
  }

  /** URL base efectiva para una empresa según su flag usaDemo (para validar coherencia de entorno). */
  getResolvedBaseUrl(usaDemo?: boolean): string {
    return usaDemo ? this.demoBaseUrl : this.baseUrl;
  }

  private getAuthBaseUrlForDemo(usaDemo?: boolean): string {
    return usaDemo ? this.demoBaseUrl : this.authBaseUrl;
  }

  async obtenerTokenAcceso(input: {
    username: string;
    password: string;
    usaDemo?: boolean;
  }): Promise<QpseAccessTokenResponse> {
    const username = input.username.trim();
    const password = input.password.trim();
    const url = `${this.getAuthBaseUrlForDemo(input.usaDemo)}/api/auth/cpe/token`;

    try {
      console.log(`[QPSE] Intentando token_acceso en: ${url}`);
      console.log(
        `[QPSE] Auth user: ${username} | passwordLength: ${password.length}`,
      );

      const { data } = await axios.post<QpseAccessTokenResponse>(
        url,
        {
          username,
          password,
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const token = data?.token_acceso || data?.access_token;
      if (!token) {
        throw new HttpException('QPSE no devolvió token_acceso', 502);
      }

      return {
        ...data,
        token_acceso: token,
        expira_en: data?.expira_en ?? data?.expires_in,
      };
    } catch (error) {
      throw this.wrapError('obtener token_acceso QPSE', error);
    }
  }

  async firmarXML(input: {
    accessToken: string;
    xmlFilename: string;
    xmlContentBase64: string;
    usaDemo?: boolean;
  }): Promise<QpseSignResponse> {
    try {
      const { data } = await this.getClient(
        input.usaDemo,
      ).post<QpseSignResponse>(
        '/api/cpe/generar',
        {
          xml_filename: input.xmlFilename,
          xml_content_base64: input.xmlContentBase64,
        },
        {
          headers: this.buildAccessHeaders(input.accessToken),
        },
      );
      return data;
    } catch (error) {
      throw this.wrapError('firmar XML', error);
    }
  }

  async enviarXML(input: {
    accessToken: string;
    xmlFilename: string;
    externalId?: string;
    xmlSignedBase64?: string;
    usaDemo?: boolean;
  }): Promise<QpseSendResponse> {
    try {
      const { data } = await this.getClient(
        input.usaDemo,
      ).post<QpseSendResponse>(
        '/api/cpe/enviar',
        {
          xml_filename: input.xmlFilename,
          ...(input.externalId ? { external_id: input.externalId } : {}),
          ...(input.xmlSignedBase64
            ? { xml_signed_base64: input.xmlSignedBase64 }
            : {}),
        },
        {
          headers: this.buildAccessHeaders(input.accessToken),
          // Las boletas son síncronas: QPSE espera el CDR de SUNAT dentro de
          // esta misma llamada. El CDR SOLO viaja en esta respuesta (QPSE no lo
          // guarda para reconsulta), así que si cortamos antes de tiempo el CDR
          // se pierde de forma irrecuperable. Damos margen amplio a SUNAT.
          timeout: 90000,
        },
      );
      return data;
    } catch (error) {
      throw this.wrapError('enviar XML a SUNAT', error);
    }
  }

  async anularComprobante(input: {
    accessToken: string;
    externalId: string;
    motivo: string;
    usaDemo?: boolean;
  }): Promise<QpseCancelResponse> {
    try {
      const { data } = await this.getClient(
        input.usaDemo,
      ).post<QpseCancelResponse>(
        '/api/cpe/anular',
        {
          external_id: input.externalId,
          reason: input.motivo,
          motivo: input.motivo,
        },
        {
          headers: this.buildAccessHeaders(input.accessToken),
        },
      );
      return data;
    } catch (error) {
      throw this.wrapError('anular comprobante en QPSE', error);
    }
  }

  async consultarTicket(
    identifier: string,
    accessToken: string,
    usaDemo?: boolean,
  ): Promise<QpseSendResponse> {
    try {
      const safeIdentifier = encodeURIComponent(identifier);
      const { data } = await this.getClient(usaDemo).get<QpseSendResponse>(
        `/api/cpe/consultar/${safeIdentifier}`,
        {
          headers: this.buildAccessHeaders(accessToken),
        },
      );
      return data;
    } catch (error) {
      throw this.wrapError('consultar ticket QPSE', error);
    }
  }

  /**
   * Aprovisiona una empresa en la cuenta maestra de QPSE usando el token de
   * integración (api_token). QPSE consulta la razón social en SUNAT por el RUC
   * y devuelve el usuario/clave (SOAP) que esa empresa usará para autenticarse.
   * La empresa nace en entorno DEMO; pasar a producción es un paso aparte
   * (requiere certificado digital y es irreversible).
   *
   * Doc: POST {url}/api/empresa/crear  ·  Bearer {api_token}
   *      body { ruc, tipo_de_plan }  →  { success, username, password }
   */
  async crearEmpresa(input: {
    ruc: string;
    tipoDePlan?: '01' | '02';
    usaDemo?: boolean;
  }): Promise<QpseCrearEmpresaResponse> {
    if (!this.integrationToken) {
      throw new HttpException(
        'QPSE: falta QPSE_ACCESS_TOKEN (token maestro) para aprovisionar empresas',
        500,
      );
    }
    const base = this.getAuthBaseUrlForDemo(input.usaDemo);
    const url = `${base}/api/empresa/crear`;
    try {
      console.log(`[QPSE] Crear empresa en: ${url} | RUC: ${input.ruc}`);
      const { data } = await axios.post<QpseCrearEmpresaResponse>(
        url,
        { ruc: String(input.ruc).trim(), tipo_de_plan: input.tipoDePlan || '01' },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.integrationToken}`,
          },
          timeout: 30000,
        },
      );
      if (!data?.username || !data?.password) {
        throw new HttpException(
          'QPSE no devolvió credenciales (username/password) al crear la empresa',
          502,
        );
      }
      return data;
    } catch (error) {
      throw this.wrapError('crear empresa QPSE', error);
    }
  }

  /**
   * Lista todas las empresas de la cuenta maestra (autenticación por api_token).
   * Devuelve external_id, environment (demo/production), y las credenciales SOAP
   * (username/password) de cada empresa. Útil para recuperar credenciales de una
   * empresa ya registrada y para obtener el external_id necesario para pasarla a
   * producción.
   *
   * Doc: GET {url}/api/empresas  ·  Bearer {api_token}
   */
  async listarEmpresas(usaDemo?: boolean): Promise<QpseEmpresaListItem[]> {
    if (!this.integrationToken) {
      throw new HttpException(
        'QPSE: falta QPSE_ACCESS_TOKEN (token maestro) para listar empresas',
        500,
      );
    }
    const base = this.getAuthBaseUrlForDemo(usaDemo);
    const url = `${base}/api/empresas`;
    try {
      const { data } = await axios.get<{ data?: QpseEmpresaListItem[] }>(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.integrationToken}`,
        },
        timeout: 30000,
      });
      return Array.isArray(data?.data) ? data.data : [];
    } catch (error) {
      throw this.wrapError('listar empresas QPSE', error);
    }
  }

  /** Busca en la cuenta maestra la empresa cuyo RUC coincide. */
  async buscarEmpresaPorRuc(
    ruc: string,
    usaDemo?: boolean,
  ): Promise<QpseEmpresaListItem | undefined> {
    const objetivo = String(ruc).trim();
    const empresas = await this.listarEmpresas(usaDemo);
    return empresas.find((e) => String(e.ruc).trim() === objetivo);
  }

  /**
   * Migra una empresa de demo a producción (acción IRREVERSIBLE). Requiere que la
   * empresa ya tenga certificado digital + OSE configurados en QPSE. Autenticación
   * por api_token.
   *
   * Doc: POST {url}/api/empresa/produccion  ·  Bearer {api_token}
   *      body { external_id, plan_type }  →  { success, message, data:{ environment } }
   */
  async pasarAProduccion(input: {
    externalId: string;
    planType?: '01' | '02';
    usaDemo?: boolean;
  }): Promise<QpsePasarProduccionResponse> {
    if (!this.integrationToken) {
      throw new HttpException(
        'QPSE: falta QPSE_ACCESS_TOKEN (token maestro) para pasar a producción',
        500,
      );
    }
    const base = this.getAuthBaseUrlForDemo(input.usaDemo);
    const url = `${base}/api/empresa/produccion`;
    try {
      console.log(
        `[QPSE] Pasar a producción en: ${url} | external_id: ${input.externalId}`,
      );
      const { data } = await axios.post<QpsePasarProduccionResponse>(
        url,
        {
          external_id: input.externalId,
          plan_type: input.planType || '01',
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.integrationToken}`,
          },
          timeout: 30000,
        },
      );
      return data;
    } catch (error) {
      throw this.wrapError('pasar empresa a producción QPSE', error);
    }
  }

  getIntegrationToken(): string | undefined {
    return this.integrationToken;
  }

  private buildAccessHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }

  private wrapError(action: string, error: unknown): HttpException {
    const axiosError = error as AxiosError<any>;
    const requestUrl = axiosError.config?.url || '';
    const fullUrl = requestUrl.startsWith('http')
      ? requestUrl
      : `${this.baseUrl}${requestUrl.startsWith('/') ? '' : '/'}${requestUrl}`;
    const providerMessage =
      axiosError.response?.data?.message ||
      axiosError.response?.data?.mensaje ||
      axiosError.response?.data?.error ||
      axiosError.message ||
      `Error al ${action} en QPSE`;

    console.log(`[QPSE] Error request URL: ${fullUrl}`);
    this.logger.error(
      `Error al ${action}`,
      axiosError.response?.data || axiosError.message,
    );
    return new HttpException(
      `QPSE: ${providerMessage}`,
      axiosError.response?.status || 502,
    );
  }
}
