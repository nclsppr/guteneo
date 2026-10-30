import { themePreferenceFromCookie } from "../../../packages/contracts/src/theme";

/** A bounded visual preference; never used as identity, access or consent. */
export function standaloneThemeAttributes(request?: Request): string {
  const preference = themePreferenceFromCookie(
    request?.headers.get("Cookie") ?? null,
  );
  return preference === "system" ? "" : ` data-theme="${preference}"`;
}

export const standaloneThemeMetadata =
  '<meta name="theme-color" content="#2450db"><meta name="color-scheme" content="light dark"><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48"><link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?brand=20260917"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">';

const darkTokens = `color-scheme:dark;--paper:#11151e;--surface:#1a202c;--ink:#f0f2f7;--muted:#b3bdce;--line:#384255;--control-line:#6b7891;--blue:#9bb5ff;--warning:#f2c789;--warning-tint:#3a2d1d;--error:#ffb4a8;--focus:#f0f2f7`;
const darkBrand = `:is(.brand,.domain){color:#f6f5ef;background:transparent}`;

/** Self-contained CSS works with script-src none and without any asset request. */
export const standaloneThemeStyles = `
:root{color-scheme:light;--paper:#f6f5ef;--surface:#fffefa;--ink:#181b22;--muted:#64666b;--line:#deded5;--control-line:#8b9082;--blue:#2450db;--action:#2450db;--action-hover:#1b3caa;--warning:#754509;--warning-tint:#f7f0e5;--error:#a12e27;--focus:#181b22;color:var(--ink);background:var(--paper)}
:root[data-theme="dark"]{${darkTokens}}
:root[data-theme="dark"] ${darkBrand}
@media(prefers-color-scheme:dark){:root:not([data-theme]){${darkTokens}}:root:not([data-theme]) ${darkBrand}}
.brand img{background:linear-gradient(#fff,#fff) center/79% 79% no-repeat}
html{background:var(--paper);color:var(--ink);scrollbar-color:var(--control-line) var(--paper)}
::selection{background:var(--blue);color:var(--paper)}
input,textarea{caret-color:var(--blue)}
input::placeholder,textarea::placeholder{color:var(--muted);opacity:1}
input[type=checkbox],input[type=radio]{accent-color:var(--ink)}
select,option{background:var(--surface);color:var(--ink)}
:is(a,button,input,select,textarea,summary):focus-visible{outline:2px solid var(--focus);outline-offset:4px}
iframe{color-scheme:light;background:#fff}
`;
