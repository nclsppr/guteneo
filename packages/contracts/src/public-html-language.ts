const prefixLimit = 8192;
const space = (character: string | undefined) =>
  character !== undefined && /[\t\n\f\r ]/.test(character);

/** Read one opening-root language, without searching comments or quoted values. */
export function publicHtmlLanguage(
  html: string | null | undefined,
): string | null {
  if (typeof html !== "string") return null;
  const prefix = html.slice(0, prefixLimit);
  let index = prefix.charCodeAt(0) === 0xfeff ? 1 : 0;
  let doctype = false;
  for (;;) {
    while (space(prefix[index])) index += 1;
    if (prefix.startsWith("<!--", index)) {
      const end = prefix.indexOf("-->", index + 4);
      if (end === -1) return null;
      index = end + 3;
      continue;
    }
    if (
      !doctype &&
      prefix.slice(index, index + 9).toLowerCase() === "<!doctype" &&
      space(prefix[index + 9])
    ) {
      doctype = true;
      index += 10;
      let quote: string | null = null;
      for (; index < prefix.length; index += 1) {
        const character = prefix[index]!;
        if (quote) {
          if (character === quote) quote = null;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === ">") break;
      }
      if (index === prefix.length) return null;
      index += 1;
      continue;
    }
    break;
  }
  if (
    prefix.slice(index, index + 5).toLowerCase() !== "<html" ||
    (!space(prefix[index + 5]) && prefix[index + 5] !== ">")
  )
    return null;
  index += 5;
  let language: string | null = null;
  let languageSeen = false;
  while (index < prefix.length) {
    while (space(prefix[index])) index += 1;
    if (prefix[index] === ">") return language;
    const start = index;
    while (
      index < prefix.length &&
      !space(prefix[index]) &&
      !/[\s/=>"'<\u0000]/.test(prefix[index]!)
    )
      index += 1;
    if (index === start) return null;
    const name = prefix.slice(start, index).toLowerCase();
    if (name === "lang") {
      if (languageSeen) return null;
      languageSeen = true;
    }
    while (space(prefix[index])) index += 1;
    let value = "";
    if (prefix[index] === "=") {
      index += 1;
      while (space(prefix[index])) index += 1;
      const quote = prefix[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const end = prefix.indexOf(quote, index);
        if (end === -1) return null;
        value = prefix.slice(index, end);
        index = end + 1;
        if (!space(prefix[index]) && prefix[index] !== ">") return null;
      } else {
        const valueStart = index;
        while (
          index < prefix.length &&
          !space(prefix[index]) &&
          prefix[index] !== ">"
        ) {
          if (/["'`=<\u0000]/.test(prefix[index]!)) return null;
          index += 1;
        }
        if (index === valueStart) return null;
        value = prefix.slice(valueStart, index);
      }
    }
    if (name === "lang") {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value) || value.length > 64)
        return null;
      language = value.toLowerCase();
    }
  }
  return null;
}
