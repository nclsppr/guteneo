import { escapeEmailText as escape } from "../packages/contracts/src/email-presentation";

export type EmailPreviewEntry = {
  name: string;
  family: "correspondence" | "account";
  variant: string;
  locale: string;
  label: string;
  subject: string;
  sender: string;
  htmlBytes: number;
};

/** A local inspection desk; every iframe points to an offline generated file. */
export function renderEmailPreviewGallery(
  previews: EmailPreviewEntry[],
): string {
  const variants = [
    ...new Map(previews.map((entry) => [entry.variant, entry])).values(),
  ];
  const entries = JSON.stringify(previews).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>guteneo · The correspondence desk</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f5ef;color:#181b22;font:15px/1.5 Arial,Helvetica,sans-serif}button,a{font:inherit}button{cursor:pointer}a{color:#2450db}button:focus-visible,a:focus-visible{outline:2px solid #2450db;outline-offset:4px}header{max-width:1344px;margin:0 auto;padding:36px 32px 28px;display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.wordmark{margin:0 0 12px;font:32px/1 Georgia,serif;color:#181b22}h1{margin:0;font:38px/1.15 Georgia,serif;font-weight:400}header p:last-child{margin:12px 0 0;color:#545761;font-size:14px}.languages{display:flex;gap:4px;flex-wrap:wrap}.languages button,.sizes button{padding:8px 12px;border:1px solid #d4d5cf;border-radius:5px;background:transparent;color:#181b22}.languages button[aria-pressed=true],.sizes button[aria-pressed=true]{background:#181b22;border-color:#181b22;color:#fff}main{max-width:1344px;margin:auto;padding:0 32px 36px;display:grid;grid-template-columns:242px minmax(0,1fr);gap:28px}.variants{padding-top:4px}.variants h2{margin:20px 0 10px;font-size:12px;font-weight:700;line-height:1.5;color:#545761}.variants h2:first-child{margin-top:0}.variants button{display:block;width:100%;margin:0 0 5px;padding:12px 14px;text-align:left;border:1px solid transparent;border-radius:6px;background:transparent;color:#181b22}.variants button:hover{background:#ebeae3}.variants button[aria-pressed=true]{background:#ffffff;border-color:#d4d5cf;font-weight:700}.inspection{min-width:0}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:0 0 16px;flex-wrap:wrap}.sizes{display:flex;gap:5px}.downloads{display:flex;gap:16px}.downloads a{font-size:14px;text-underline-offset:3px}.metadata{padding:18px 22px;background:#fff;border:1px solid #d4d5cf;border-bottom:0}.metadata p{margin:0}.metadata #subject{font-weight:700;font-size:16px;overflow-wrap:anywhere}.metadata #sender{margin-top:5px;color:#545761;font-size:13px}.preview-stage{min-width:0;display:flex;justify-content:center;padding:16px 8px 24px;background:#ebeae3;border:1px solid #d4d5cf}.preview-stage iframe{display:block;border:0;width:100%;max-width:760px;height:980px;background:#f6f5ef}.preview-stage[data-size=mobile] iframe{width:320px;max-width:100%}.notice{margin:16px 0 0;font-size:12px;color:#545761}.notice a{color:inherit}noscript ul{padding:24px}footer{max-width:1344px;margin:0 auto;padding:0 32px 32px;color:#545761;font-size:12px}@media(max-width:900px){header{padding:24px 16px;align-items:flex-start;flex-direction:column}h1{font-size:32px}main{padding:0 16px 24px;grid-template-columns:1fr;gap:18px}.variants{display:flex;flex-wrap:wrap;gap:6px}.variants h2{width:100%;margin:10px 0 2px}.variants button{width:auto;margin:0;padding:9px 11px}.metadata{padding:16px}.preview-stage{padding:10px 0 16px}.downloads{gap:12px}.notice{line-height:1.7}footer{padding:0 16px 24px}}
</style></head><body><header><div><p class="wordmark">guteneo</p><h1>The correspondence desk</h1><p>Fictional letters, real templates. Nothing is sent.</p></div><nav class="languages" aria-label="Example language">${[
    ["fr", "Français"],
    ["en", "English"],
    ["de", "Deutsch"],
    ["lb", "Lëtzebuergesch"],
  ]
    .map(
      ([locale, label]) =>
        `<button type="button" data-locale="${locale}" aria-pressed="${locale === "fr"}">${label}</button>`,
    )
    .join(
      "",
    )}</nav></header><main><nav class="variants" aria-label="Email example">${[
    "correspondence",
    "account",
  ]
    .map(
      (family) =>
        `<h2>${family === "correspondence" ? "Correspondence" : "Your account"}</h2>${variants
          .filter((entry) => entry.family === family)
          .map(
            (entry) =>
              `<button type="button" data-variant="${entry.variant}" aria-pressed="${entry.variant === "my_documents"}">${escape(entry.label)}</button>`,
          )
          .join("")}`,
    )
    .join(
      "",
    )}</nav><section class="inspection" aria-label="Selected email"><div class="toolbar"><div class="sizes" aria-label="Preview width"><button type="button" data-size="desktop" aria-pressed="true">Desktop</button><button type="button" data-size="mobile" aria-pressed="false">320 px</button></div><div class="downloads"><a id="html-link" href="my_documents-fr.html" target="_blank" rel="noopener">Open letter</a><a id="eml-link" href="my_documents-fr.eml" download>Open in Mail</a></div></div><div class="metadata"><p id="subject">${escape(previews[0]?.subject ?? "")}</p><p id="sender">${escape(previews[0]?.sender ?? "")}</p></div><div class="preview-stage" data-size="desktop"><iframe src="my_documents-fr.html" title="Selected email" sandbox="allow-same-origin"></iframe></div><p class="notice">HTML and EML contain only fictional examples. Inline artwork and example attachments are included locally. No provider or account settings are changed.</p></section></main><footer>Mail previews are local rendering evidence. Inbox placement and delivery are separate checks.</footer><noscript><ul>${previews.map((entry) => `<li><a href="${entry.name}.html">${escape(entry.label)} · ${entry.locale}</a> · <a href="${entry.name}.eml">EML</a></li>`).join("")}</ul></noscript><script type="application/json" id="examples">${entries}</script><script>
const examples=JSON.parse(document.querySelector('#examples').textContent);let locale='fr',variant='my_documents';const frame=document.querySelector('iframe');function select(){const entry=examples.find(item=>item.locale===locale&&item.variant===variant)||examples.find(item=>item.locale===locale);if(!entry)return;variant=entry.variant;document.querySelector('#subject').textContent=entry.subject;document.querySelector('#sender').textContent=entry.sender;document.querySelector('#html-link').href=entry.name+'.html';document.querySelector('#eml-link').href=entry.name+'.eml';if(frame.getAttribute('src')!==entry.name+'.html')frame.src=entry.name+'.html';document.querySelectorAll('[data-locale]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.locale===locale)));document.querySelectorAll('[data-variant]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.variant===variant)))}document.querySelectorAll('[data-locale]').forEach(button=>button.addEventListener('click',()=>{locale=button.dataset.locale;select()}));document.querySelectorAll('[data-variant]').forEach(button=>button.addEventListener('click',()=>{variant=button.dataset.variant;select()}));document.querySelectorAll('button[data-size]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('.preview-stage').dataset.size=button.dataset.size;document.querySelectorAll('button[data-size]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)))}));select();
</script></body></html>`;
}
