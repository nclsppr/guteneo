/** International fax address accepted by the transport, including short country numbering plans. */
export const FAX_E164 = /^\+[1-9]\d{6,14}$/;

/**
 * An international fax number as people type it, in the E.164 form that is
 * prepared, approved and sent. Spaces (including French non-breaking spaces),
 * dots, dashes and parentheses are separators. "(0)" right after the country
 * codes below denotes a conventional optional trunk prefix and is dropped; no other
 * digit is ever rewritten.
 */
export function normalizeFaxNumber(value: string): string {
  return value
    .trim()
    .replace(/^\+(33|352|44|49)[\s.-]*\(0\)/, "+$1")
    .replace(/[\s.()-]/g, "");
}

/**
 * Why a normalized number cannot be prepared, or null when it can. National
 * numbers never start with 0 after these country codes: a kept trunk prefix
 * (+33 06…, +49 030…) is refused with its correction instead of being sent.
 */
export function faxNumberProblem(phone: string): string | null {
  if (/^\+(33|352|44|49)0/.test(phone))
    return "Remove the 0 after the country code: +33 1 23 45 67 89, rather than +33 01 23 45 67 89.";
  if (!FAX_E164.test(phone))
    return "Enter the international fax number with + and its country calling code.";
  return null;
}
