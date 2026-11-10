import { number } from "./belvedere-data";
import { bmsg } from "./belvedere-i18n";

export type BelvedereCountKind =
  | "results"
  | "members"
  | "workshops"
  | "deliveries"
  | "connections"
  | "authorizations";

/** Labels are complete messages so each language controls number and grammar. */
export function belvedereCount(
  kind: BelvedereCountKind,
  count: number,
): string {
  switch (kind) {
    case "members":
      return count === 1
        ? bmsg("1 member")
        : bmsg("{0} members", number(count));
    case "workshops":
      return count === 1
        ? bmsg("1 workshop")
        : bmsg("{0} workshops", number(count));
    case "deliveries":
      return count === 1
        ? bmsg("1 dispatch")
        : bmsg("{0} dispatches", number(count));
    case "connections":
      return count === 1
        ? bmsg("1 connection")
        : bmsg("{0} connections", number(count));
    case "authorizations":
      return count === 1
        ? bmsg("1 session or authorization")
        : bmsg("{0} sessions and authorizations", number(count));
    default:
      return count === 1
        ? bmsg("1 result")
        : bmsg("{0} results", number(count));
  }
}
