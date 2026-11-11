import portrait128 from "../../../web/public/brand/guteneo-portrait-128.webp";
import portrait192 from "../../../web/public/brand/guteneo-portrait-192.webp";
import { Link } from "../router";
import { useT } from "../i18n";

/**
 * The one mandatory element of the identity: the official halftone portrait
 * stamp, served from the product's own source file, beside the lowercase
 * wordmark. Its geometry, colors and transparency are never altered.
 */
export function BrandStamp({ size = 44 }: { size?: number }) {
  return (
    <span className="brand-stamp" style={{ width: size, height: size }}>
      <img
        src={portrait128}
        srcSet={`${portrait128} 128w, ${portrait192} 192w`}
        sizes={`${size}px`}
        alt=""
        width="128"
        height="128"
        decoding="async"
      />
    </span>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  const t = useT();
  return (
    <Link className="brand" href={href} aria-label={t("brand.home")}>
      <BrandStamp />
      <span className="brand-wordmark">guteneo</span>
    </Link>
  );
}
