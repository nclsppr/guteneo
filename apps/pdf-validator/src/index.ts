import { Container } from "@cloudflare/containers";
import { handleRequest, type PdfValidatorEnv } from "./handler";

export class PdfValidatorContainer extends Container<PdfValidatorEnv> {
  defaultPort = 8080;
  sleepAfter = "2m";
  enableInternet = false;
  onError(_error: unknown): never {
    throw new Error("PDF_VALIDATOR_CONTAINER_ERROR");
  }
}

export default {
  fetch(request: Request, env: PdfValidatorEnv): Promise<Response> {
    return handleRequest(request, env);
  },
};
