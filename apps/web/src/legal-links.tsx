import { msg } from "./messages";
export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label={msg("Informations et assistance")}>
      <a href="/mentions-legales/">{msg("Mentions légales")}</a>
      <a href="/confidentialite/">{msg("Confidentialité")}</a>
      <a href="/conditions/">{msg("Conditions")}</a>
      <a href="/roles/">{msg("Rôles et droits")}</a>
      <a href="/support/">{msg("Assistance")}</a>
      <a href="https://status.guteneo.com/">{msg("État du service")}</a>
    </nav>
  );
}
