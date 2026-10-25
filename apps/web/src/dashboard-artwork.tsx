import { useDashboardAppearance } from "./dashboard-appearance";

/** Decorative artwork never replaces a document preview or a delivery state. */
export function DashboardArtwork({
  scene,
}: {
  scene: "atelier" | "documents" | "pdf-verification";
}) {
  const { appearance } = useDashboardAppearance();
  if (appearance !== "v2") return null;
  const heights = { atelier: 853, documents: 960, "pdf-verification": 427 };
  return (
    <div
      className={`dashboard-artwork dashboard-artwork-${scene}`}
      aria-hidden="true"
    >
      <img
        src={`/brand/dashboard-v2/${scene}.webp`}
        width="1280"
        height={heights[scene]}
        alt=""
        decoding="async"
        loading="lazy"
      />
      <span className="swallow-wingbeat dashboard-artwork-swallow dashboard-artwork-swallow-near" />
      <span className="swallow-wingbeat dashboard-artwork-swallow dashboard-artwork-swallow-far" />
    </div>
  );
}
