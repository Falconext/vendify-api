/**
 * Límites anti-abuso para cuentas DEMO (empresa.usaDemo = true).
 *
 * Una cuenta demo es gratuita y sirve para que un reseller le muestre el sistema
 * a un cliente antes de pasarlo a producción. Para evitar que se use como sistema
 * gratis permanente (llenándolo de data), se topa la cantidad de comprobantes que
 * puede emitir. Al pasar a producción este tope no aplica.
 *
 * Los productos NO tienen tope: una cuenta demo puede registrar los que necesite.
 */
export const DEMO_MAX_COMPROBANTES = 40;
