import { Container } from "@cloudflare/containers";
import { handleRequest } from "./handler";

export class ClamAvContainer extends Container<ScannerEnv> {
  defaultPort = 8080;
  sleepAfter = "2m";
  enableInternet = false;
}

export default { fetch: handleRequest };
