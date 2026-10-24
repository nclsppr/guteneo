import type { fr } from "./locales/fr";
export { fr } from "./locales/fr";

/** Retain catalog keys and structure while allowing every locale its own copy. */
export type Copy = Widen<typeof fr>;
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : { -readonly [K in keyof T]: Widen<T[K]> };
