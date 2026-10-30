import { useEffect, useState } from "react";
import { useLocale } from "./locale";

/** Local developer fixtures never enable a hosted or production account. */
export const isAdvancedLocalPreview =
  import.meta.env.DEV &&
  import.meta.env.VITE_PUBLIC_PREVIEW === "true" &&
  typeof location !== "undefined" &&
  ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);

export function useLocalBelvedereHref(enabled: boolean): string | undefined {
  const locale = useLocale();
  const [href, setHref] = useState<string>();
  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      import.meta.env.VITE_PUBLIC_PREVIEW !== "true" ||
      !isAdvancedLocalPreview ||
      !enabled
    )
      return;
    let alive = true;
    void import("./preview").then(({ publicPreview }) => {
      const scenario = publicPreview.configuration();
      if (!alive || scenario.account !== "belvedere") return;
      const destination = new URL("http://127.0.0.1:8794/scenario");
      destination.searchParams.set("seed", scenario.seed);
      destination.searchParams.set("lang", locale);
      if (scenario.counts)
        destination.searchParams.set("counts", JSON.stringify(scenario.counts));
      setHref(destination.href);
    });
    return () => {
      alive = false;
    };
  }, [enabled, locale]);
  return enabled ? href : undefined;
}
