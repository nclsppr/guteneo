import { useDashboardAppearance } from "./dashboard-appearance";

/** Decorative artwork never replaces a document preview or a delivery state. */
export function DashboardArtwork({
  scene,
}: {
  scene: "atelier" | "documents" | "horizon";
}) {
  const { appearance } = useDashboardAppearance();
  if (appearance !== "v2") return null;
  const heights = { atelier: 853, documents: 960, horizon: 427 };
  return (
    <img
      className={`dashboard-artwork dashboard-artwork-${scene}`}
      src={`/brand/dashboard-v2/${scene}.webp`}
      width="1280"
      height={heights[scene]}
      alt=""
      aria-hidden="true"
      decoding="async"
      loading="lazy"
    />
  );
}
