import { msg } from "./messages";

type LegalLinkId =
  "legal" | "privacy" | "terms" | "roles" | "support" | "status";

export function LegalLinks({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const links: { id: LegalLinkId; href: string; label: string }[] = [
    { id: "legal", href: "/legal/", label: msg("Legal notice") },
    { id: "privacy", href: "/privacy/", label: msg("Privacy") },
    { id: "terms", href: "/terms/", label: msg("Terms") },
    { id: "roles", href: "/roles/", label: msg("Roles and permissions") },
    { id: "support", href: "/support/", label: msg("Support") },
    {
      id: "status",
      href: "https://status.guteneo.com/",
      label: msg("Service status"),
    },
  ];
  const visibleLinks = compact
    ? links.filter(({ id }) => ["privacy", "terms", "support"].includes(id))
    : links;
  return (
    <nav
      className={`legal-links ${className}`.trim()}
      aria-label={msg("Information and support")}
    >
      {visibleLinks.map(({ id, href, label }) => (
        <a href={href} key={id}>
          {label}
        </a>
      ))}
    </nav>
  );
}
