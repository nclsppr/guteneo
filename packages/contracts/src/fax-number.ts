/** Fax destinations currently accepted: France, Luxembourg and Germany. */
const DESTINATION = /^\+(33|352|49)\d{6,12}$/;

/**
 * An international fax number as people type it, in the E.164 form that is
 * prepared, approved and sent. Spaces (including French non-breaking spaces),
 * dots, dashes and parentheses are separators. "(0)" right after the country
 * code is the conventional optional trunk prefix and is dropped; no other
 * digit is ever rewritten.
 */
export function normalizeFaxNumber(value: string): string {
  return value
    .trim()
    .replace(/^\+(33|352|49)[\s.-]*\(0\)/, "+$1")
    .replace(/[\s.()-]/g, "");
}

/**
 * Why a normalized number cannot be prepared, or null when it can. National
 * numbers never start with 0 after these country codes: a kept trunk prefix
 * (+33 06…, +49 030…) is refused with its correction instead of being sent.
 */
export function faxNumberProblem(phone: string): string | null {
  if (/^\+(33|352|49)0/.test(phone))
    return "Retirez le 0 qui suit l’indicatif du pays : +33 1 23 45 67 89, et non +33 01 23 45 67 89.";
  if (!DESTINATION.test(phone))
    return "Numéro international requis, destination FR, LU ou DE.";
  return null;
}
