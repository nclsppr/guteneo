import { observePrivateFetch } from "../../../packages/observability/src/index";
import { Container } from "@cloudflare/containers";
import { handleRequest } from "./handler";

export class ClamAvContainer extends Container<ScannerEnv> {
  defaultPort = 8080;
  sleepAfter = "2m";
  enableInternet = false;
  // The SDK also has a separate proxy-error logger. Persistence stays disabled until
  // that path can be qualified; this hook alone does not sanitize the whole SDK.
  onError(_error: unknown): never {
    throw new Error("SCANNER_CONTAINER_ERROR");
  }
}

export default {
  fetch(request: Request, env: ScannerEnv) {
    return observePrivateFetch(request, env, "scanner", () =>
      handleRequest(request, env),
    );
  },
};
