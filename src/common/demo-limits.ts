/**
 * Límites anti-abuso para cuentas DEMO (empresa.usaDemo = true).
 *
 * Una cuenta demo es gratuita y sirve para que un reseller le muestre el sistema
 * a un cliente antes de pasarlo a producción. Para evitar que se use como sistema
 * gratis permanente (llenándolo de data), se topa la cantidad de productos y de
 * comprobantes que puede registrar. Al pasar a producción estos topes no aplican.
 */
export const DEMO_MAX_PRODUCTOS = 20;
export const DEMO_MAX_COMPROBANTES = 40;
