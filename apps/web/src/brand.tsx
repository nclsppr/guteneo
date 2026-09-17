type BrandVariant = "portrait" | "simple";

export function BrandMark({ variant = "simple" }: { variant?: BrandVariant }) {
  const portrait = variant === "portrait";
  const asset = portrait ? "guteneo-portrait" : "guteneo-mark";
  return (
    <img
      className="brand-mark"
      src={`/brand/${asset}-128.webp`}
      srcSet={
        portrait
          ? `/brand/${asset}-128.webp 128w, /brand/${asset}-192.webp 192w`
          : `/brand/${asset}-128.webp 128w, /brand/${asset}.webp 512w`
      }
      sizes="48px"
      alt=""
      width="128"
      height="128"
      decoding="async"
    />
  );
}

export function Brand({
  app = false,
  href,
  variant = "portrait",
  compact = false,
}: {
  app?: boolean;
  href?: string;
  variant?: BrandVariant;
  compact?: boolean;
}) {
  return (
    <a
      className={`brand${compact ? " brand-compact" : ""}`}
      href={href ?? (app ? "#/app" : "/")}
      aria-label="guteneo, accueil"
    >
      <BrandMark variant={variant} />
      <span className="brand-wordmark">guteneo</span>
    </a>
  );
}
