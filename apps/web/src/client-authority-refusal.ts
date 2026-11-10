import { ApiError } from "./api";
import type { ClientActionContext } from "./client-action";

export const isAuthorityRefusal = (error: unknown): error is ApiError =>
  error instanceof ApiError && [401, 403].includes(error.status);

/** A write refusal can invalidate sensitive local fields without logging out
 * an account that still has access to other areas. Departed views stay fenced. */
export function observeAuthorityRefusal<T>(
  request: Promise<T>,
  view: ClientActionContext,
  onRefusal: (error: Error) => void,
): Promise<T> {
  return request.catch((error: unknown) => {
    if (view.ownsView() && isAuthorityRefusal(error)) onRefusal(error);
    throw error;
  });
}
