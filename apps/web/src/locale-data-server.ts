import fr from "./locales/runtime/fr.json";
import en from "./locales/runtime/en.json";
import de from "./locales/runtime/de.json";
import lb from "./locales/runtime/lb.json";
import frDevelopment from "./locales/runtime/development-fr.json";
import enDevelopment from "./locales/runtime/development-en.json";
import deDevelopment from "./locales/runtime/development-de.json";
import lbDevelopment from "./locales/runtime/development-lb.json";
import { getMessageCatalogs } from "./message-catalogs-source";
import belvedereFr from "./locales/runtime/belvedere-fr.json";
import belvedereEn from "./locales/runtime/belvedere-en.json";
import belvedereDe from "./locales/runtime/belvedere-de.json";
import belvedereLb from "./locales/runtime/belvedere-lb.json";
import belvedereSource from "./locales/messages-belvedere.json";
import { englishMessages } from "./message-catalog";
const development = {
  fr: frDevelopment,
  en: enDevelopment,
  de: deDevelopment,
  lb: lbDevelopment,
};
export const localeData = Object.fromEntries(
  Object.entries({ fr, en, de, lb }).map(([locale, data]) => [
    locale,
    {
      ...data,
      messages: {
        ...data.messages,
        ...(import.meta.env.DEV
          ? development[locale as keyof typeof development]
          : {}),
      },
    },
  ]),
);
export const legacyMessages = getMessageCatalogs(import.meta.env.DEV).messages;
export const belvedereLocaleData = {
  fr: belvedereFr,
  en: belvedereEn,
  de: belvedereDe,
  lb: belvedereLb,
};
export const legacyBelvedereMessages = englishMessages(belvedereSource);
