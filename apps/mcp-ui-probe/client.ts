import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps/app-with-deps";
import { messages } from "./locales/index";

const app = new App({ name: "guteneo-host-diagnostic", version: "1" }, {});
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const bridge = element<HTMLButtonElement>("check"),
  picker = element<HTMLButtonElement>("picker");
const input = element<HTMLInputElement>("file");
let copy: (typeof messages)[keyof typeof messages] = messages.en;
let hostState: keyof typeof copy = "pending";
let bridgeState: keyof typeof copy = "pending";
let pickerState: keyof typeof copy | undefined;
function renderStates() {
  element("host").textContent = copy[hostState];
  element("bridge").textContent = copy[bridgeState];
  element("picker-state").textContent = pickerState ? copy[pickerState] : "";
}
function localize(
  locale = document.documentElement.lang || navigator.language,
) {
  const language = locale
    .toLowerCase()
    .split(/[-_]/)[0] as keyof typeof messages;
  copy = messages[language] ?? messages.en;
  document.documentElement.lang = language in messages ? language : "en";
  for (const node of document.querySelectorAll<HTMLElement>("[data-copy]")) {
    const key = node.dataset.copy as keyof typeof copy;
    node.textContent = copy[key];
  }
  input.setAttribute("aria-label", copy.file);
  const state = (enabled: boolean) => (enabled ? copy.available : copy.absent);
  element("secure").textContent = state(window.isSecureContext === true);
  element("input").textContent = state(input.type === "file");
  element("picker-api").textContent = state(
    typeof input.showPicker === "function",
  );
  renderStates();
}
function hostStyle() {
  const context = app.getHostContext();
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables)
    applyHostStyleVariables(context.styles.variables);
  if (context?.locale) localize(context.locale);
}
localize();
app.onhostcontextchanged = hostStyle;
app.onerror = () => {
  hostState = "failed";
  renderStates();
  bridge.disabled = true;
  picker.disabled = true;
};
bridge.onclick = async () => {
  bridge.disabled = true;
  try {
    const result = await app.callServerTool({
      name: "check_mcp_ui_probe_bridge",
      arguments: {},
    });
    const value = result.structuredContent as
      | {
          ok?: boolean;
          data?: { probe?: string; bridge?: string; contentAccess?: boolean };
        }
      | undefined;
    const passed =
      !result.isError &&
      value?.ok === true &&
      value.data?.probe === "guteneo-mcp-ui-v1" &&
      value.data.bridge === "available" &&
      value.data.contentAccess === false;
    bridgeState = passed ? "connected" : "failed";
    renderStates();
    picker.disabled = !passed || input.type !== "file";
  } catch {
    bridgeState = "failed";
    renderStates();
  }
};
picker.onclick = () => {
  picker.disabled = true;
  try {
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
    pickerState = "requested";
  } catch {
    pickerState = "failed";
  }
  renderStates();
};
input.addEventListener("cancel", () => {
  pickerState = "cancelled";
  renderStates();
});
input.addEventListener("change", () => {
  // Discard without inspecting a file, its metadata or its content.
  input.value = "";
  pickerState = "discarded";
  renderStates();
});
app
  .connect()
  .then(() => {
    hostStyle();
    hostState = "connected";
    bridge.disabled = !app.getHostCapabilities()?.serverTools;
    if (bridge.disabled) bridgeState = "absent";
    renderStates();
  })
  .catch(() => {
    hostState = "failed";
    renderStates();
  });
