import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { buildMcpDocumentUploadResource } from "../../scripts/build-mcp-document-upload.mjs";

const bytes = Buffer.alloc(300 * 1024 + 17, 65);
bytes.write("%PDF-1.7\n");
bytes.write("\n%%EOF", bytes.length - 6);
const expectedSha = createHash("sha256").update(bytes).digest("hex");
const file = {
  name: "fictional-original.pdf",
  mimeType: "application/pdf",
  buffer: bytes,
};
const maximum = Buffer.alloc(10 * 1024 * 1024, 65);
maximum.write("%PDF-1.7\n");
maximum.write("\n%%EOF", maximum.length - 6);
const maximumSha = createHash("sha256").update(maximum).digest("hex");
const titles = {
  en: "Import an original PDF",
  fr: "Importer un PDF original",
  de: "Original-PDF importieren",
  lb: "En Original-PDF importéieren",
};
const conversationLabels = {
  en: "Use in conversation",
  fr: "Utiliser dans la conversation",
  de: "Im Gespräch verwenden",
  lb: "Am Gespréich benotzen",
};

test("official AppBridge preserves a selected original and bounds recovery, cancellation and disclosure", async (t) => {
  const { text: html } = await buildMcpDocumentUploadResource({ check: true });
  const host = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
const settings=new URLSearchParams(location.search),mode=settings.get('mode')??'normal';
const frame=document.querySelector('iframe');window.calls=[];window.contexts=[];window.modelTexts=[];window.chatMessages=[];window.messageAcks=0;window.messageRefusals=0;window.messageWaiting=false;window.overlap=false;window.finished=false;window.appendWaiting=false;
let begin,parts=new Map(),count=0,inflight=0,lost=false,documentReady=false,pendingPart,sameStatusReads=0;
const uploadId='upl_00000000-0000-4000-8000-000000000001';let expiresAt;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),x=>x.toString(16).padStart(2,'0')).join('');
const view=(status='receiving')=>({uploadId,status,expiresAt,partSize:262144,partCount:Math.ceil(begin.size/262144),confirmedParts:[...parts.keys()],receivedBytes:[...parts.values()].reduce((n,x)=>n+x.length,0),remainingCalls:mode==='budget'?2:64-count,nextAction:status==='complete'?'get_document':status==='receiving'?(parts.size===Math.ceil(begin.size/262144)?'finish':'append_part'):status==='finalizing'?'wait':'stop',...(status==='complete'?{document:{id:'doc-fixture-original',status:documentReady?'ready':'quarantined'}}:{})});
const bridge=new AppBridge(null,{name:'synthetic-original-host',version:'1'},{serverTools:{},message:{text:{}},updateModelContext:mode==='textonlycontext'?{text:{}}:{structuredContent:{}}},{hostContext:{locale:settings.get('hostLocale')??'en',theme:settings.get('locale')==='fr'?'dark':'light'}});
bridge.oninitialized=async()=>{await bridge.sendToolInput({arguments:{}});await bridge.sendToolResult({content:[],structuredContent:{ok:true,data:{surface:'guteneo-private-original-v1',...(settings.get('locale')?{locale:settings.get('locale')}:{ }),limits:{maxBytes:10485760,partBytes:262144,maxParts:40,maxCalls:64,expiresWithinSeconds:300}}}});};
bridge.onupdatemodelcontext=async params=>{if(mode==='contextfail')throw Error('Synthetic context unavailable');window.contexts.push(params);if(mode==='textonlycontext')window.modelTexts.push(...(params.content??[]).filter(block=>block.type==='text').map(block=>block.text));return {};};
bridge.onmessage=async params=>{window.chatMessages.push(params);if(mode==='messagepending'){window.messageWaiting=true;await new Promise(resolve=>{window.releaseMessage=resolve;});window.messageWaiting=false;}if(mode==='messagefailure'){window.messageRefusals++;return {isError:true};}window.messageAcks++;return {};};
bridge.oncalltool=async ({name,arguments:args})=>{
 if(++inflight>1)window.overlap=true;count++;window.calls.push({name,keys:Object.keys(args).sort(),...(name==='append_mcp_document_upload'?{partIndex:args.partIndex,sha256:args.sha256,encodedBytes:args.base64.length}:{})});
 try{
  if(name==='begin_mcp_document_upload'){
   if(begin&&JSON.stringify(begin)!==JSON.stringify(args))throw Error('Changed immutable begin');
   begin??=args;expiresAt??=new Date(Date.now()+(mode==='expiry'?100:300000)).toISOString();
   if(begin.size!==(mode==='maximum'?${maximum.length}:${bytes.length})||begin.sha256!==(mode==='maximum'?'${maximumSha}':'${expectedSha}'))throw Error('Wrong whole original');
   if(mode==='beginlost'&&!lost){lost=true;throw Error('Synthetic lost begin response');}
   return {content:[],structuredContent:{ok:true,data:view()}};
  }
  if(args.uploadId!==uploadId)throw Error('Wrong upload identity');
  if(name==='append_mcp_document_upload'){
   const part=Uint8Array.from(atob(args.base64),x=>x.charCodeAt(0));
   if(part.length!==Math.min(262144,begin.size-args.partIndex*262144)||await hash(part)!==args.sha256||btoa(String.fromCharCode(...part.subarray(0,16)))!==btoa(String.fromCharCode(...${JSON.stringify([...bytes.subarray(0, 16)])}))&&args.partIndex===0)throw Error('Changed original part');
   if(mode==='partunknown'&&args.partIndex===0&&!lost){lost=true;pendingPart={bytes:part,sha256:args.sha256};return {content:[],structuredContent:{ok:true,data:{...view('unknown'),errorCode:'APP_PART_UNCONFIRMED'}}};}
   parts.set(args.partIndex,part);
   if(mode==='cancel'||mode==='background'||mode==='expiry'){window.appendWaiting=true;await new Promise(resolve=>{window.releaseAppend=resolve;});}
   if(mode==='lost'&&!lost){lost=true;throw Error('Synthetic lost append response');}
   return {content:[],structuredContent:{ok:true,data:view()}};
  }
  if(name==='get_mcp_document_upload'){
   if(mode==='unknown')return {content:[],structuredContent:{ok:true,data:{...view('unknown'),errorCode:'APP_UPLOAD_UNCONFIRMED'}}};
   if(mode==='partunknown'&&pendingPart){
    if(!window.confirmPendingObject)return {content:[],structuredContent:{ok:true,data:{...view('unknown'),errorCode:'APP_PART_UNCONFIRMED'}}};
    if(await hash(pendingPart.bytes)!==pendingPart.sha256)throw Error('Immutable object did not reconcile');
    window.positiveObjectChecks=(window.positiveObjectChecks??0)+1;parts.set(0,pendingPart.bytes);pendingPart=undefined;
   }
   if(Date.now()>=Date.parse(expiresAt))return {content:[],structuredContent:{ok:true,data:view('expired')}};
   if(window.finished&&(mode!=='textonlycontext'||sameStatusReads++>0))documentReady=true;
   return {content:[],structuredContent:{ok:true,data:view(window.finished?'complete':'receiving')}};
  }
  if(name==='cancel_mcp_document_upload'){window.cancelled=true;return {content:[],structuredContent:{ok:true,data:view('cancelled')}};}
  if(name==='finish_mcp_document_upload'){
   const original=new Uint8Array(begin.size);for(const [index,part]of parts)original.set(part,index*262144);
   window.finalSha=await hash(original);if(window.finalSha!==begin.sha256)throw Error('Changed assembled original');window.finished=true;
   if(mode==='unknown')return {content:[],structuredContent:{ok:true,data:{...view('unknown'),errorCode:'APP_UPLOAD_UNCONFIRMED'}}};
   return {content:[],structuredContent:{ok:true,data:view('complete')}};
  }
  throw Error('Unexpected tool');
 }finally{inflight--;}
};
const transport=new PostMessageTransport(frame.contentWindow,frame.contentWindow);
window.sendLateResponse=()=>transport.send({jsonrpc:'2.0',id:'unmatched-late-response',result:{content:[]}});
await bridge.connect(transport);frame.src='/widget';`,
    },
    bundle: true,
    write: false,
    minify: true,
    format: "esm",
    target: "es2022",
  });
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader("Content-Type", "text/html");
    response.end(
      request.url === "/widget"
        ? html
        : `<!doctype html><iframe sandbox="allow-scripts allow-same-origin" title="Synthetic original import" width="375" height="760"></iframe><script type="module">${host.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const measurements = [];
  async function fixture(mode = "normal", locale = "en") {
    const context = await browser.newContext({
      viewport: { width: 430, height: 900 },
      locale,
    });
    const external = [],
      errors = [];
    await context.addInitScript(() => {
      window.contentReads = 0;
      window.fileSelections = 0;
      document.addEventListener("change", (event) => {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.id === "file"
        )
          window.fileSelections++;
      });
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        window.contentReads++;
        return read.call(this);
      };
    });
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        external.push("unexpected external request");
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", () => errors.push("page error"));
    await page.goto(`${origin}/?mode=${mode}&locale=${locale}`);
    const frame = page.frameLocator("iframe");
    await expect(frame.locator("#file")).toBeEnabled();
    return { context, page, frame, external, errors };
  }
  async function select(f, original = file) {
    await f.frame.locator("#file").setInputFiles(original);
    assert.equal(
      await f.frame.locator("body").evaluate(() => window.contentReads),
      0,
    );
    await expect(f.frame.locator("#import")).toBeDisabled();
    await f.frame.locator("#review").check();
    await f.frame.locator("#import").click();
  }
  async function close(f) {
    assert.deepEqual(f.external, []);
    assert.deepEqual(f.errors, []);
    assert.equal(await f.page.evaluate(() => window.overlap), false);
    await f.context.close();
  }
  for (const locale of Object.keys(titles))
    await t.test(
      `exact original and minimal receipt in ${locale}`,
      async () => {
        const f = await fixture("normal", locale);
        assert.equal(await f.frame.locator("h1").textContent(), titles[locale]);
        assert.equal(
          await f.frame.locator("html").getAttribute("lang"),
          locale,
        );
        measurements.push(
          await f.frame.locator("body").evaluate((body) => ({
            locale: document.documentElement.lang,
            firstUsefulContentObservedMs: performance.now(),
            navigationTransferBytes:
              performance.getEntriesByType("navigation")[0].transferSize,
            encodedBodyBytes:
              performance.getEntriesByType("navigation")[0].encodedBodySize,
            decodedBodyBytes:
              performance.getEntriesByType("navigation")[0].decodedBodySize,
            horizontalOverflow: body.scrollWidth > innerWidth,
          })),
        );
        await select(
          f,
          locale === "fr"
            ? { ...file, mimeType: "application/octet-stream" }
            : file,
        );
        await expect(f.frame.locator("#receipt")).toBeVisible();
        await expect
          .poll(() => f.page.evaluate(() => window.contexts.length))
          .toBe(1);
        await expect(f.frame.locator("#use-conversation")).toBeVisible();
        await expect(f.frame.locator("#use-conversation")).toHaveAccessibleName(
          conversationLabels[locale],
        );
        await expect(f.frame.locator("#use-conversation")).toBeEnabled();
        assert.deepEqual(await f.page.evaluate(() => window.chatMessages), []);
        const initial = await f.page.evaluate(() => ({
          sha: window.finalSha,
          calls: window.calls,
          contexts: window.contexts,
        }));
        assert.equal(initial.sha, expectedSha);
        assert.deepEqual(
          initial.calls.map((x) => x.name),
          [
            "begin_mcp_document_upload",
            "append_mcp_document_upload",
            "append_mcp_document_upload",
            "finish_mcp_document_upload",
          ],
        );
        assert.deepEqual(
          initial.calls
            .filter((x) => x.partIndex !== undefined)
            .map((x) => x.encodedBytes),
          [349528, 60100],
        );
        const receipt = {
          documentId: "doc-fixture-original",
          status: "quarantined",
          size: bytes.length,
          sha256: expectedSha,
        };
        assert.deepEqual(initial.contexts, [
          {
            content: [{ type: "text", text: JSON.stringify(receipt) }],
            structuredContent: receipt,
          },
        ]);
        await f.frame.locator("#check").click();
        await expect
          .poll(() => f.page.evaluate(() => window.contexts.length))
          .toBe(2);
        assert.equal(
          await f.page.evaluate(
            () => window.contexts[1].structuredContent.status,
          ),
          "ready",
        );
        assert.deepEqual(await f.page.evaluate(() => window.chatMessages), []);
        assert.equal(
          await f.frame.locator("body").evaluate(() => window.contentReads),
          1,
        );
        if (locale === "en" || locale === "fr") {
          await mkdir(
            new URL("../../reports/mcp-document-upload/", import.meta.url),
            { recursive: true },
          );
          await f.page.screenshot({
            path: new URL(
              `../../reports/mcp-document-upload/${locale}.png`,
              import.meta.url,
            ).pathname,
          });
        }
        await close(f);
      },
    );
  let maximumFixtureMs;
  await t.test(
    "the 10 MiB boundary uses forty bounded parts and forty-two server calls",
    async () => {
      const f = await fixture("maximum");
      const started = performance.now();
      await select(f, {
        name: "fictional-maximum.pdf",
        mimeType: "application/pdf",
        buffer: maximum,
      });
      await expect(f.frame.locator("#receipt")).toBeVisible();
      maximumFixtureMs = performance.now() - started;
      const result = await f.page.evaluate(() => ({
        sha: window.finalSha,
        calls: window.calls,
        contexts: window.contexts,
      }));
      assert.equal(result.sha, maximumSha);
      assert.equal(result.calls.length, 42);
      assert.deepEqual(
        result.calls
          .filter((x) => x.partIndex !== undefined)
          .map((x) => x.partIndex),
        Array.from({ length: 40 }, (_, index) => index),
      );
      assert.equal(
        result.calls
          .filter((x) => x.partIndex !== undefined)
          .every((x) => x.encodedBytes === 349528),
        true,
      );
      assert.equal(result.contexts[0].structuredContent.size, maximum.length);
      await close(f);
    },
  );
  await t.test(
    "size, type and exclusion review block content reads",
    async () => {
      const f = await fixture();
      await f.frame.locator("#file").setInputFiles({
        name: "oversized.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      });
      await expect(f.frame.locator("#review")).toBeDisabled();
      await f.frame.locator("#file").setInputFiles({
        name: "wrong.txt",
        mimeType: "text/plain",
        buffer: bytes,
      });
      await expect(f.frame.locator("#review")).toBeDisabled();
      await f.frame.locator("#file").setInputFiles(file);
      await expect(f.frame.locator("#import")).toBeDisabled();
      assert.equal(
        await f.frame.locator("body").evaluate(() => window.contentReads),
        0,
      );
      assert.deepEqual(await f.page.evaluate(() => window.calls), []);
      await close(f);
    },
  );
  for (const mode of ["lost", "beginlost"])
    await t.test(
      `${mode} requires explicit same-session recovery`,
      async () => {
        const f = await fixture(mode);
        await select(f);
        await expect(f.frame.locator("#check")).toBeEnabled();
        const before = await f.page.evaluate(() =>
          window.calls.map((x) => x.name),
        );
        assert.equal(
          before.filter((x) => x === "append_mcp_document_upload").length,
          mode === "lost" ? 1 : 0,
        );
        await f.frame.locator("#check").click();
        await expect(f.frame.locator("#resume")).toBeVisible();
        assert.equal(await f.page.evaluate(() => window.finished), false);
        await f.frame.locator("#resume").click();
        await expect(f.frame.locator("#receipt")).toBeVisible();
        const after = await f.page.evaluate(() => window.calls);
        assert.deepEqual(
          after
            .filter((x) => x.partIndex !== undefined)
            .map((x) => x.partIndex),
          [0, 1],
        );
        assert.equal(
          after.filter((x) => x.name === "begin_mcp_document_upload").length,
          mode === "beginlost" ? 2 : 1,
        );
        assert.equal(await f.page.evaluate(() => window.finalSha), expectedSha);
        await close(f);
      },
    );
  await t.test(
    "an unconfirmed part resumes only after a positive immutable-object status and explicit action",
    async () => {
      const f = await fixture("partunknown");
      await select(f);
      await expect(f.frame.locator("#check")).toBeEnabled();
      assert.deepEqual(
        await f.page.evaluate(() => window.calls.map((x) => x.name)),
        ["begin_mcp_document_upload", "append_mcp_document_upload"],
      );
      await expect(f.frame.locator("#resume")).toBeHidden();
      await f.frame.locator("#check").click();
      await expect(f.frame.locator("#resume")).toBeHidden();
      assert.equal(
        await f.page.evaluate(
          () => window.calls.filter((x) => x.partIndex !== undefined).length,
        ),
        1,
      );
      await f.page.evaluate(() => {
        window.confirmPendingObject = true;
      });
      await expect(f.frame.locator("#check")).toBeEnabled();
      await f.frame.locator("#check").click();
      await expect(f.frame.locator("#resume")).toBeVisible();
      assert.equal(await f.page.evaluate(() => window.positiveObjectChecks), 1);
      assert.equal(await f.page.evaluate(() => window.finished), false);
      assert.equal(
        await f.page.evaluate(
          () => window.calls.filter((x) => x.partIndex !== undefined).length,
        ),
        1,
      );
      await f.frame.locator("#resume").click();
      await expect(f.frame.locator("#receipt")).toBeVisible();
      assert.equal(await f.page.evaluate(() => window.finalSha), expectedSha);
      assert.deepEqual(
        await f.page.evaluate(() =>
          window.calls
            .filter((x) => x.partIndex !== undefined)
            .map((x) => x.partIndex),
        ),
        [0, 1],
      );
      assert.equal(
        await f.frame.locator("body").evaluate(() => window.fileSelections),
        1,
      );
      assert.equal(
        await f.frame.locator("body").evaluate(() => window.contentReads),
        1,
      );
      assert.equal(
        await f.page.evaluate(
          () =>
            window.calls.filter((x) => x.name === "begin_mcp_document_upload")
              .length,
        ),
        1,
      );
      await close(f);
    },
  );
  await t.test(
    "terminal pipeline uncertainty never enables replay",
    async () => {
      const f = await fixture("unknown");
      await select(f);
      await expect(f.frame.locator("#check")).toBeEnabled();
      await f.frame.locator("#check").click();
      await expect(f.frame.locator("#resume")).toBeHidden();
      assert.equal(
        await f.page.evaluate(
          () => window.calls.filter((x) => x.partIndex !== undefined).length,
        ),
        2,
      );
      assert.deepEqual(await f.page.evaluate(() => window.contexts), []);
      await close(f);
    },
  );
  await t.test(
    "cancel waits for the in-flight part and never finalizes",
    async () => {
      const f = await fixture("cancel");
      await select(f);
      await expect
        .poll(() => f.page.evaluate(() => window.appendWaiting))
        .toBe(true);
      await f.frame.locator("#cancel").click();
      await f.page.evaluate(() => window.releaseAppend());
      await expect
        .poll(() => f.page.evaluate(() => window.cancelled))
        .toBe(true);
      assert.equal(await f.page.evaluate(() => window.finished), false);
      assert.deepEqual(await f.page.evaluate(() => window.contexts), []);
      await close(f);
    },
  );
  await t.test(
    "backgrounding pauses and requires a status-confirmed resume",
    async () => {
      const f = await fixture("background");
      await select(f);
      await expect
        .poll(() => f.page.evaluate(() => window.appendWaiting))
        .toBe(true);
      await f.frame.locator("body").evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await f.page.evaluate(() => window.releaseAppend());
      await expect(f.frame.locator("#check")).toBeEnabled();
      assert.equal(
        await f.page.evaluate(
          () => window.calls.filter((x) => x.partIndex !== undefined).length,
        ),
        1,
      );
      await f.frame.locator("body").evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(f.frame.locator("#resume")).toBeHidden();
      await f.frame.locator("#check").click();
      await expect(f.frame.locator("#resume")).toBeVisible();
      await close(f);
    },
  );
  await t.test(
    "expired grants and exhausted call budgets stop content",
    async () => {
      const f = await fixture("expiry");
      await select(f);
      await expect
        .poll(() => f.page.evaluate(() => window.appendWaiting))
        .toBe(true);
      await f.frame.locator("#status").filter({ hasText: "expired" }).waitFor();
      await f.page.evaluate(() => window.releaseAppend());
      await expect(f.frame.locator("#resume")).toBeHidden();
      assert.equal(await f.page.evaluate(() => window.finished), false);
      await close(f);
      const b = await fixture("budget");
      await select(b);
      await expect(b.frame.locator("#status")).toContainText("cannot continue");
      assert.deepEqual(
        await b.page.evaluate(() => window.calls.map((x) => x.name)),
        ["begin_mcp_document_upload"],
      );
      await close(b);
    },
  );
  await t.test(
    "a failed context update preserves the registered receipt",
    async () => {
      const f = await fixture("contextfail");
      await select(f);
      await expect(f.frame.locator("#context")).toBeVisible();
      assert.equal(
        await f.frame.locator("#document").textContent(),
        "doc-fixture-original",
      );
      assert.equal(
        await f.page.evaluate(
          () =>
            window.calls.filter((x) => x.name === "begin_mcp_document_upload")
              .length,
        ),
        1,
      );
      await close(f);
    },
  );
  for (const documentStatus of ["quarantined", "ready"])
    await t.test(
      `a late unmatched SDK response preserves the ${documentStatus} receipt and disables bridge actions`,
      async () => {
        const f = await fixture();
        await select(f);
        await expect(f.frame.locator("#receipt")).toBeVisible();
        await expect
          .poll(() => f.page.evaluate(() => window.contexts.length))
          .toBe(1);
        await expect(f.frame.locator("#check")).toBeEnabled();
        if (documentStatus === "ready") {
          await f.frame.locator("#check").click();
          await expect
            .poll(() => f.page.evaluate(() => window.contexts.length))
            .toBe(2);
        }
        const expectedStatus =
          documentStatus === "ready"
            ? "Original registered and ready."
            : "Original registered. Document checks are still running.";
        await expect(f.frame.locator("#status")).toHaveText(expectedStatus);
        await expect(f.frame.locator("main")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        const before = await f.page.evaluate(() => ({
          calls: window.calls,
          contexts: window.contexts,
        }));
        assert.equal(before.calls.length, documentStatus === "ready" ? 5 : 4);
        assert.equal(
          before.contexts.at(-1).structuredContent.status,
          documentStatus,
        );
        await f.page.evaluate(() => window.sendLateResponse());
        await expect(f.frame.locator("#check")).toBeDisabled();
        await expect(f.frame.locator("#receipt")).toBeVisible();
        await expect(f.frame.locator("#document")).toHaveText(
          "doc-fixture-original",
        );
        await expect(f.frame.locator("#status")).toHaveText(expectedStatus);
        for (const id of [
          "choose-file",
          "import",
          "resume",
          "cancel",
          "use-conversation",
        ])
          await expect(f.frame.locator(`#${id}`)).toBeDisabled();
        assert.deepEqual(
          await f.page.evaluate(() => ({
            calls: window.calls,
            contexts: window.contexts,
          })),
          before,
        );
        assert.equal(
          await f.frame.locator("body").evaluate(() => window.contentReads),
          1,
        );
        await close(f);
      },
    );
  await t.test(
    "a text-only model receives the minimal receipt once per document status",
    async () => {
      const f = await fixture("textonlycontext");
      await select(f);
      await expect(f.frame.locator("#receipt")).toBeVisible();
      assert.equal(await f.page.evaluate(() => window.contexts.length), 1);
      await expect
        .poll(() => f.page.evaluate(() => window.modelTexts.length))
        .toBe(1);
      const expectedReceipt = (status) => ({
        documentId: "doc-fixture-original",
        status,
        size: bytes.length,
        sha256: expectedSha,
      });
      const registered = await f.page.evaluate(() => ({
        contexts: window.contexts,
        modelTexts: window.modelTexts,
      }));
      assert.deepEqual(
        JSON.parse(registered.modelTexts[0]),
        expectedReceipt("quarantined"),
      );
      assert.deepEqual(registered.contexts, [
        {
          content: [{ type: "text", text: registered.modelTexts[0] }],
          structuredContent: expectedReceipt("quarantined"),
        },
      ]);
      await f.frame.locator("#check").click();
      await expect(f.frame.locator("main")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expect(f.frame.locator("#status")).toHaveText(
        "Original registered. Document checks are still running.",
      );
      assert.equal(await f.page.evaluate(() => window.calls.length), 5);
      assert.deepEqual(
        await f.page.evaluate(() => ({
          contexts: window.contexts,
          modelTexts: window.modelTexts,
        })),
        registered,
      );
      await expect(f.frame.locator("#check")).toBeEnabled();
      await f.frame.locator("#check").click();
      await expect
        .poll(() => f.page.evaluate(() => window.modelTexts.length))
        .toBe(2);
      await expect(f.frame.locator("#status")).toHaveText(
        "Original registered and ready.",
      );
      await expect(f.frame.locator("main")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      const ready = await f.page.evaluate(() => ({
        calls: window.calls,
        contexts: window.contexts,
        modelTexts: window.modelTexts,
      }));
      assert.deepEqual(
        ready.modelTexts.map((text) => JSON.parse(text)),
        [expectedReceipt("quarantined"), expectedReceipt("ready")],
      );
      assert.deepEqual(ready.contexts, [
        registered.contexts[0],
        {
          content: [{ type: "text", text: ready.modelTexts[1] }],
          structuredContent: expectedReceipt("ready"),
        },
      ]);
      assert.deepEqual(
        ready.calls.map((call) => call.name),
        [
          "begin_mcp_document_upload",
          "append_mcp_document_upload",
          "append_mcp_document_upload",
          "finish_mcp_document_upload",
          "get_mcp_document_upload",
          "get_mcp_document_upload",
        ],
      );
      await expect(f.frame.locator("#check")).toBeEnabled();
      await f.page.evaluate(() => window.sendLateResponse());
      await expect(f.frame.locator("#check")).toBeDisabled();
      await expect(f.frame.locator("#receipt")).toBeVisible();
      await expect(f.frame.locator("#document")).toHaveText(
        "doc-fixture-original",
      );
      await expect(f.frame.locator("#status")).toHaveText(
        "Original registered and ready.",
      );
      assert.deepEqual(
        await f.page.evaluate(() => ({
          calls: window.calls,
          contexts: window.contexts,
          modelTexts: window.modelTexts,
        })),
        ready,
      );
      assert.equal(
        await f.frame.locator("body").evaluate(() => window.contentReads),
        1,
      );
      await close(f);
    },
  );
  await t.test(
    "conversation handoff requires a click and accepts one acknowledged message per receipt",
    async () => {
      const f = await fixture("messagepending");
      await select(f);
      await expect(f.frame.locator("#receipt")).toBeVisible();
      await expect(f.frame.locator("#use-conversation")).toBeEnabled();
      const before = await f.page.evaluate(() => ({
        calls: window.calls,
        contexts: window.contexts,
      }));
      assert.deepEqual(await f.page.evaluate(() => window.chatMessages), []);
      const expectedMessage = (status) => ({
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              documentId: "doc-fixture-original",
              status,
              size: bytes.length,
              sha256: expectedSha,
            }),
          },
        ],
      });
      const forceDuplicateClick = async () => {
        await f.frame.locator("#use-conversation").evaluate((button) => {
          button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          return new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        });
      };
      await f.frame.locator("#use-conversation").click();
      await expect
        .poll(() => f.page.evaluate(() => window.messageWaiting))
        .toBe(true);
      await expect(f.frame.locator("#use-conversation")).toHaveText(
        "Sending receipt…",
      );
      await expect(f.frame.locator("#use-conversation")).toBeDisabled();
      await expect(f.frame.locator("#check")).toBeDisabled();
      await f.frame.locator("#check").evaluate((button) => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await forceDuplicateClick();
      assert.deepEqual(await f.page.evaluate(() => window.chatMessages), [
        expectedMessage("quarantined"),
      ]);
      assert.equal(await f.page.evaluate(() => window.messageAcks), 0);
      await f.page.evaluate(() => window.releaseMessage());
      await expect(f.frame.locator("#use-conversation")).toHaveText(
        "Conversation updated",
      );
      await expect(f.frame.locator("#use-conversation")).toBeDisabled();
      await forceDuplicateClick();
      assert.deepEqual(
        await f.page.evaluate(() => ({
          calls: window.calls,
          contexts: window.contexts,
        })),
        before,
      );
      assert.deepEqual(await f.page.evaluate(() => window.chatMessages), [
        expectedMessage("quarantined"),
      ]);
      assert.equal(await f.page.evaluate(() => window.messageAcks), 1);
      await f.frame.locator("#check").click();
      await expect(f.frame.locator("#status")).toHaveText(
        "Original registered and ready.",
      );
      await expect(f.frame.locator("#use-conversation")).toHaveText(
        conversationLabels.en,
      );
      await expect(f.frame.locator("#use-conversation")).toBeEnabled();
      assert.equal(await f.page.evaluate(() => window.chatMessages.length), 1);
      await f.frame.locator("#use-conversation").click();
      await expect
        .poll(() => f.page.evaluate(() => window.messageWaiting))
        .toBe(true);
      await forceDuplicateClick();
      assert.deepEqual(await f.page.evaluate(() => window.chatMessages), [
        expectedMessage("quarantined"),
        expectedMessage("ready"),
      ]);
      await f.page.evaluate(() => window.releaseMessage());
      await expect(f.frame.locator("#use-conversation")).toHaveText(
        "Conversation updated",
      );
      await forceDuplicateClick();
      assert.equal(await f.page.evaluate(() => window.messageAcks), 2);
      const accepted = await f.page.evaluate(() => ({
        calls: window.calls,
        contexts: window.contexts,
        chatMessages: window.chatMessages,
        messageAcks: window.messageAcks,
      }));
      assert.equal(accepted.calls.length, 5);
      assert.equal(accepted.contexts.length, 2);
      assert.deepEqual(
        accepted.contexts.map((context) => JSON.parse(context.content[0].text)),
        accepted.chatMessages.map((message) =>
          JSON.parse(message.content[0].text),
        ),
      );
      await expect(f.frame.locator("#check")).toBeEnabled();
      await f.page.evaluate(() => window.sendLateResponse());
      await expect(f.frame.locator("#check")).toBeDisabled();
      await expect(f.frame.locator("#use-conversation")).toBeDisabled();
      await expect(f.frame.locator("#receipt")).toBeVisible();
      await expect(f.frame.locator("#document")).toHaveText(
        "doc-fixture-original",
      );
      await expect(f.frame.locator("#status")).toHaveText(
        "Original registered and ready.",
      );
      assert.deepEqual(
        await f.page.evaluate(() => ({
          calls: window.calls,
          contexts: window.contexts,
          chatMessages: window.chatMessages,
          messageAcks: window.messageAcks,
        })),
        accepted,
      );
      assert.equal(
        await f.frame.locator("body").evaluate(() => window.contentReads),
        1,
      );
      await close(f);
    },
  );
  await t.test(
    "a refused conversation handoff preserves registration and never resends the same receipt",
    async () => {
      const f = await fixture("messagefailure");
      await select(f);
      await expect(f.frame.locator("#receipt")).toBeVisible();
      await expect(f.frame.locator("#use-conversation")).toBeEnabled();
      assert.deepEqual(await f.page.evaluate(() => window.chatMessages), []);
      const before = await f.page.evaluate(() => ({
        calls: window.calls,
        contexts: window.contexts,
      }));
      await f.frame.locator("#use-conversation").click();
      await expect(f.frame.locator("#use-conversation")).toHaveText(
        "Conversation handoff unconfirmed",
      );
      await expect(f.frame.locator("#use-conversation")).toBeDisabled();
      await f.frame.locator("#use-conversation").evaluate((button) => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      const refused = await f.page.evaluate(() => ({
        calls: window.calls,
        contexts: window.contexts,
        chatMessages: window.chatMessages,
        messageAcks: window.messageAcks,
        messageRefusals: window.messageRefusals,
      }));
      assert.deepEqual(
        { calls: refused.calls, contexts: refused.contexts },
        before,
      );
      assert.equal(refused.messageAcks, 0);
      assert.equal(refused.messageRefusals, 1);
      assert.deepEqual(refused.chatMessages, [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify(before.contexts[0].structuredContent),
            },
          ],
        },
      ]);
      await expect(f.frame.locator("#receipt")).toBeVisible();
      await expect(f.frame.locator("#document")).toHaveText(
        "doc-fixture-original",
      );
      await expect(f.frame.locator("#status")).toHaveText(
        "Original registered. Document checks are still running.",
      );
      await f.page.evaluate(() => window.sendLateResponse());
      await expect(f.frame.locator("#check")).toBeDisabled();
      await expect(f.frame.locator("#use-conversation")).toBeDisabled();
      await expect(f.frame.locator("#status")).toHaveText(
        "Original registered. Document checks are still running.",
      );
      assert.deepEqual(
        await f.page.evaluate(() => ({
          calls: window.calls,
          contexts: window.contexts,
          chatMessages: window.chatMessages,
          messageAcks: window.messageAcks,
          messageRefusals: window.messageRefusals,
        })),
        refused,
      );
      assert.equal(
        await f.frame.locator("body").evaluate(() => window.contentReads),
        1,
      );
      await close(f);
    },
  );
  assert.equal(
    measurements.every((x) => !x.horizontalOverflow),
    true,
  );
  await mkdir(new URL("../../reports/mcp-document-upload/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL(
      "../../reports/mcp-document-upload/browser-measurements.private.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        environment:
          "Local Chromium, official SDK AppBridge, synthetic File and server, loopback; no native chooser, actual host, scanner or physical device",
        resourceBytes: Buffer.byteLength(html),
        gzipBytes: gzipSync(html).length,
        brotliBytes: brotliCompressSync(html).length,
        originalBytes: bytes.length,
        originalSha256: expectedSha,
        maximumOriginalBytes: maximum.length,
        maximumOriginalSha256: maximumSha,
        maximumFixtureMs,
        maximumServerCalls: 42,
        maximumParts: 40,
        widgetResourceRequests: requests.filter((x) => x === "/widget").length,
        externalRequests: 0,
        measurements,
      },
      null,
      2,
    ) + "\n",
  );
});
