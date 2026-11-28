/** Exact email/postal customer total, including the document services in the signed dispatch. */
export function quotedTotalNanoEur(
  transportNanoEur: number | null | undefined,
  optionsJson: unknown,
): number | null {
  if (
    typeof transportNanoEur !== "number" ||
    !Number.isSafeInteger(transportNanoEur) ||
    transportNanoEur < 0
  )
    return null;
  try {
    const options =
      typeof optionsJson === "string" ? JSON.parse(optionsJson) : optionsJson;
    const hosting =
      options?.emailDeliveryMode === "protected_link"
        ? options.protectedDocument?.hostingFeeMinor
        : 0;
    const sharing =
      options?.secureDistribution === undefined
        ? 0
        : options.secureDistribution?.serviceFeeMinor;
    if (
      (hosting !== 0 && hosting !== 100) ||
      !Number.isSafeInteger(sharing) ||
      sharing < 0
    )
      return null;
    const total = transportNanoEur + (hosting + sharing) * 10_000_000;
    return Number.isSafeInteger(total) ? total : null;
  } catch {
    return null;
  }
}
