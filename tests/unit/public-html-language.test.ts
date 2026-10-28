import { describe, expect, it } from "vitest";
import { publicHtmlLanguage } from "../../packages/contracts/src/public-html-language";

describe("public HTML opening-root language", () => {
  it.each([
    ['<html lang="fr">', "fr"],
    ['<html lang="fr" data-public-locale="fr" data-public-path="/">', "fr"],
    ["<html data-public-path='/' lang='en' data-public-locale='en'>", "en"],
    ["<!doctype html>\n<HTML\n DATA-LOCALE=de LANG = DE >", "de"],
    ["\ufeff \n<!-- <html lang=fr> -->\n<html lang=lb>", "lb"],
    ['<html title=\'fake lang="fr" >\' lang="en">', "en"],
    ["<html lang=en title='fake lang=\"fr\" >'>", "en"],
    [
      '<!DOCTYPE html PUBLIC "fake > <html lang=fr>" "example"><html lang=de>',
      "de",
    ],
    ['<html data-lang="fr" xml:lang="fr" lang="en-GB">', "en-gb"],
    ['<html hidden lang="fr" data-note="a=b">', "fr"],
  ])("reads the actual opening language in %s", (html, expected) => {
    expect(publicHtmlLanguage(html)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "<html>",
    '<html data-lang="fr">',
    "<html title='lang=\"fr\"'>",
    '<!-- <html lang="fr"> -->',
    '<html lang="fr" lang="fr">',
    '<html lang="fr" LANG="en">',
    '<html lang="fr" lang>',
    '<html lang="">',
    "<html lang>",
    '<html lang="fr>',
    '<html title="unfinished lang=fr>',
    '<html lang="fr"id="fake">',
    '<htmlish lang="fr">',
    '<div><html lang="fr">',
    '<script>"<html lang=fr>"</script><html lang=en>',
    '<!-- unfinished <html lang="fr">',
    '<!doctype html PUBLIC "unfinished > <html lang=fr>',
    '<html lang=fr" data-other=x>',
    '<html lang="f&#114;">',
    '<html lang="fr fr">',
    '<html lang="fr"',
  ])("refuses missing, ambiguous or malformed opening markup %s", (html) => {
    expect(publicHtmlLanguage(html)).toBeNull();
  });

  it("never searches beyond its bounded prefix or accepts an unfinished tag", () => {
    expect(
      publicHtmlLanguage(" ".repeat(8192) + '<html lang="fr">'),
    ).toBeNull();
    expect(
      publicHtmlLanguage('<html lang="fr" title="' + "a".repeat(8192) + '">'),
    ).toBeNull();
    expect(publicHtmlLanguage(" ".repeat(8192 - 16) + '<html lang="fr">')).toBe(
      "fr",
    );
  });
});
