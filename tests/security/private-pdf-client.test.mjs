import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(
  new URL(
    "../../integrations/guteneo/scripts/upload-private-pdf.py",
    import.meta.url,
  ),
);
function python(source) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import runpy,sys\nsys.dont_write_bytecode=True\nm=runpy.run_path(${JSON.stringify(client)})\n${source}`,
      ],
      { encoding: "utf8", maxBuffer: 200000 },
    ),
  );
}
test("bundled private client source and digest are exact and require no fetched code", async () => {
  const code = await readFile(client, "utf8");
  const projection = JSON.parse(
    await readFile(
      new URL(
        "../../packages/contracts/src/private-upload-client.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(projection.code, code);
  assert.equal(
    projection.sha256,
    createHash("sha256").update(code).digest("hex"),
  );
  assert.equal(projection.language, "python3");
  assert.equal(
    await readFile(
      new URL(
        "../../integrations/claude/plugins/guteneo/scripts/upload-private-pdf.py",
        import.meta.url,
      ),
      "utf8",
    ),
    code,
  );
});
test("private client reads original bytes and denies traversal, symbolic and hard links", () => {
  const result = python(
    `import tempfile,pathlib,os,json\nwith tempfile.TemporaryDirectory() as directory:\n p=pathlib.Path(directory); data=b'%PDF-private-exact-bytes';(p/'original.pdf').write_bytes(data)\n actual,metadata=m['original'](directory,'original.pdf')\n (p/'symbolic.pdf').symlink_to(p/'original.pdf');os.link(p/'original.pdf',p/'hard.pdf')\n denied=[]\n for name in ['../outside.pdf','/etc/passwd','symbolic.pdf','hard.pdf']:\n  try: m['original'](directory,name)\n  except Exception: denied.append(name)\n print(json.dumps({'exact':actual==data,'size':metadata['size'],'denied':len(denied)}))`,
  );
  assert.equal(result.exact, true);
  assert.equal(result.size, 24);
  assert.equal(result.denied, 4);
});
test("private client issues one unchanged binary PUT with only the narrow capability", () => {
  const result = python(
    `import json,hashlib\ndata=b'%PDF-private-exact-bytes';metadata={'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}\nid='upl_11111111-1111-4111-8111-111111111111'\nview={'uploadId':id,'status':'reserved','upload':{'method':'PUT','url':'https://guteneo.com/api/document-uploads/'+id+'/content','capabilityHeader':'X-Guteneo-Upload-Capability','capability':'a'*64}}\nclass Response:\n status=202\n def __enter__(self): return self\n def __exit__(self,*args): pass\n def read(self,n): return json.dumps({'uploadId':id,'status':'received'}).encode()\nclass Opener:\n count=0\n def open(self,request,timeout):\n  self.count+=1;self.exact=request.data==data;self.method=request.method;self.headers=dict(request.header_items());return Response()\no=Opener();receipt=m['upload'](data,metadata,view,o)\nprint(json.dumps({'count':o.count,'exact':o.exact,'method':o.method,'headers':list(o.headers),'receipt':receipt}))`,
  );
  assert.equal(result.count, 1);
  assert.equal(result.exact, true);
  assert.equal(result.method, "PUT");
  assert.deepEqual(
    result.headers.sort(),
    [
      "Accept",
      "Content-length",
      "Content-type",
      "X-guteneo-upload-capability",
    ].sort(),
  );
  assert.equal(result.receipt.binaryAccepted, true);
  assert.equal(JSON.stringify(result.receipt).includes("a".repeat(64)), false);
});
test("private client refuses foreign destinations and never retries an uncertain upload", () => {
  const result = python(
    `import json,hashlib,copy\ndata=b'%PDF-private-exact-bytes';metadata={'size':len(data),'sha256':hashlib.sha256(data).hexdigest()};id='upl_11111111-1111-4111-8111-111111111111'\nview={'uploadId':id,'status':'reserved','upload':{'method':'PUT','url':'https://guteneo.com/api/document-uploads/'+id+'/content','capabilityHeader':'X-Guteneo-Upload-Capability','capability':'b'*64}}\nclass Opener:\n count=0\n def open(self,*args,**kwargs): self.count+=1;raise TimeoutError('never print credentials')\no=Opener();denied=0\nfor url in ['https://guteneo.com.evil.example/api/document-uploads/'+id+'/content',view['upload']['url']+'?token=bad','http://guteneo.com/api/document-uploads/'+id+'/content']:\n bad=copy.deepcopy(view);bad['upload']['url']=url\n try:m['upload'](data,metadata,bad,o)\n except m['UploadError']:denied+=1\ntry:m['upload'](data,metadata,view,o)\nexcept m['UploadError'] as error:code=str(error)\nprint(json.dumps({'denied':denied,'count':o.count,'code':code}))`,
  );
  assert.deepEqual(result, { denied: 3, count: 1, code: "UPLOAD_UNCONFIRMED" });
});
