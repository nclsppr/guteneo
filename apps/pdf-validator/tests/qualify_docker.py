"""Local synthetic qualification only; never creates hosted resources."""

import base64
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import uuid

FIXTURES = Path(__file__).parent / "fixtures"
IMAGE = sys.argv[1] if len(sys.argv) > 1 else "guteneo-pdf-validator:local"
NAME = "guteneo-pdf-proof-" + uuid.uuid4().hex[:12]


def docker(*arguments, input=None, timeout=60):
    return subprocess.run(
        ["docker", *arguments], input=input, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=True, timeout=timeout,
    ).stdout


script = r'''
import base64, http.client, json, sys, time
fixtures=json.load(sys.stdin)
def request(path, data=None, media="application/pdf", declared=None):
    connection=http.client.HTTPConnection("127.0.0.1",8080,timeout=45)
    headers={"Content-Type":media} if data is not None else {}
    if declared is not None: headers["Content-Length"]=str(declared)
    connection.request("POST" if data is not None else "GET",path,data,headers)
    response=connection.getresponse(); raw=response.read(32769)
    assert len(raw)<=32768
    result=(response.status,json.loads(raw));connection.close();return result
deadline=time.monotonic()+30
while True:
    try:
        status,health=request("/health")
        if status==200:break
    except (OSError,http.client.HTTPException):pass
    if time.monotonic()>deadline:raise RuntimeError("LOCAL_ENGINE_NOT_READY")
    time.sleep(0.2)
results={"health":health,"profiles":{},"rejections":{}}
data=base64.b64decode(fixtures["synthetic"])
for profile in ["ua1","ua2","1b","2b","3b","4"]:
    status,result=request("/validate?profile="+profile,data)
    assert status==200,(profile,status,result)
    results["profiles"][profile]=result
valid=base64.b64decode(fixtures["compliant"])
status,result=request("/validate?profile=2b",valid)
assert status==200 and result["compliant"] is True
results["compliantPdfa2b"]=result
for label,path,body,media,declared,expected in [
    ("unknownProfile","/validate?profile=unknown",data,"application/pdf",None,400),
    ("urlParameter","/validate?profile=ua1&url=https://example.org",data,"application/pdf",None,400),
    ("wrongMedia","/validate?profile=ua1",data,"text/plain",None,415),
    ("oversizedDeclaration","/validate?profile=ua1",b"%PDF-","application/pdf",10*1024*1024+1,413),
    ("invalidPdf","/validate?profile=ua1",b"synthetic invalid data","application/pdf",None,400),
    ("incompletePdf","/validate?profile=ua1",b"%PDF-1.7\n%%EOF","application/pdf",None,503),
]:
    status,result=request(path,body,media,declared)
    assert status==expected,(label,status,result)
    results["rejections"][label]={"status":status,"code":result["code"]}
print(json.dumps(results,separators=(",",":")))
'''

try:
    docker(
        "run", "-d", "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--memory", "512m", "--cpus", "1", "--pids-limit", "128", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--name", NAME, IMAGE,
    )
    fixtures = {
        "synthetic": base64.b64encode((FIXTURES / "synthetic.pdf").read_bytes()).decode(),
        "compliant": base64.b64encode((FIXTURES / "compliant-2b.pdf").read_bytes()).decode(),
    }
    results = json.loads(docker("exec", "-i", NAME, "python3", "-B", "-c", script, input=json.dumps(fixtures).encode(), timeout=180))
    for profile, result in results["profiles"].items():
        assert result["sha256"] == hashlib.sha256((FIXTURES / "synthetic.pdf").read_bytes()).hexdigest()
        assert result["profile"] == profile
        assert result["engine"] == {"name": "veraPDF", "version": "1.30.2"}
        assert result["compliant"] is False
        assert result["failedRules"] > 0 and result["failedChecks"] > 0
        assert all(set(rule) == {"specification", "clause", "testNumber", "failedChecks"} for rule in result["findings"])
    assert results["compliantPdfa2b"]["sha256"] == hashlib.sha256((FIXTURES / "compliant-2b.pdf").read_bytes()).hexdigest()
    assert results["compliantPdfa2b"]["passedRules"] == 144
    assert results["compliantPdfa2b"]["failedRules"] == 0
    remaining = json.loads(docker("exec", NAME, "python3", "-B", "-c", "import glob,json;print(json.dumps(glob.glob('/tmp/guteneo-pdf-*')))"))
    assert remaining == []
    assert docker("logs", NAME) == b""
    inspection = json.loads(docker("inspect", NAME))[0]
    assert inspection["HostConfig"]["NetworkMode"] == "none"
    assert inspection["HostConfig"]["ReadonlyRootfs"] is True
    proof = {
        "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "evidence": "local Docker; synthetic PDFs; no hosted deployment or customer data",
        "imageId": inspection["Image"], "runtimeNetwork": "none", "readOnlyRoot": True,
        "temporaryFilesRemaining": 0, "containerLogsEmpty": True,
        **results,
    }
    print(json.dumps(proof, indent=2))
finally:
    subprocess.run(["docker", "rm", "-f", NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
