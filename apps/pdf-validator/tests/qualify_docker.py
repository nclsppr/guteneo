"""Local synthetic qualification only; never creates hosted resources."""

import base64
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import uuid

FIXTURES = Path(__file__).parent / "fixtures"
REFERENCES = Path(__file__).parent / "references"
BENCHMARKS = Path(__file__).parent / "benchmark-fixtures"
parser = argparse.ArgumentParser(description="Offline exact-engine qualification at Cloudflare instance resource limits")
parser.add_argument("image", nargs="?", default="guteneo-pdf-validator:local")
parser.add_argument("--instance-type", choices=["lite", "basic", "standard-1", "historical-local"], default="basic")
options = parser.parse_args()
IMAGE = options.image
RESOURCES = {
    "lite": {"cpu": "0.0625", "memory": "256m", "memoryBytes": 256 * 1024**2, "diskGb": 2},
    "basic": {"cpu": "0.25", "memory": "1g", "memoryBytes": 1024**3, "diskGb": 4},
    "standard-1": {"cpu": "0.5", "memory": "4g", "memoryBytes": 4 * 1024**3, "diskGb": 8},
    "historical-local": {"cpu": "1", "memory": "512m", "memoryBytes": 512 * 1024**2, "diskGb": None},
}[options.instance_type]
NAME = "guteneo-pdf-proof-" + uuid.uuid4().hex[:12]


def docker(*arguments, input=None, timeout=60):
    result = subprocess.run(
        ["docker", *arguments], input=input, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=False, timeout=timeout,
    )
    if result.returncode:
        # These are operator commands/synthetic fixture assertions, never engine logs.
        raise RuntimeError("LOCAL_DOCKER_PROOF_FAILED: " + result.stderr.decode("utf-8", "replace")[:2000])
    return result.stdout


script = r'''
import base64, concurrent.futures, http.client, json, sys, time
from pathlib import Path
fixtures=json.load(sys.stdin)
timings=[]
def resource_metrics():
    root=Path("/sys/fs/cgroup")
    cpu=dict(line.split() for line in (root/"cpu.stat").read_text().splitlines())
    return {"cpuMicroseconds":int(cpu["usage_usec"]),"memoryBytes":int((root/"memory.current").read_text()),"peakMemoryBytes":int((root/"memory.peak").read_text())}
def request(path, data=None, media="application/pdf", declared=None):
    before=resource_metrics();started=time.monotonic()
    connection=http.client.HTTPConnection("127.0.0.1",8080,timeout=45)
    headers={"Content-Type":media} if data is not None else {}
    if declared is not None: headers["Content-Length"]=str(declared)
    connection.request("POST" if data is not None else "GET",path,data,headers)
    response=connection.getresponse(); raw=response.read(32769)
    assert len(raw)<=32768
    result=(response.status,json.loads(raw));connection.close()
    after=resource_metrics()
    timings.append({"path":path,"status":response.status,"milliseconds":round((time.monotonic()-started)*1000),"cpuMicroseconds":after["cpuMicroseconds"]-before["cpuMicroseconds"],"peakMemoryBytes":after["peakMemoryBytes"]})
    return result
startup_started=time.monotonic();startup_before=resource_metrics()
deadline=time.monotonic()+30
while True:
    try:
        status,health=request("/health")
        if status==200:break
    except (OSError,http.client.HTTPException):pass
    if time.monotonic()>deadline:raise RuntimeError("LOCAL_ENGINE_NOT_READY")
    time.sleep(0.2)
startup_after=resource_metrics()
results={"health":health,"profiles":{},"rejections":{},"coldHealth":{"milliseconds":round((time.monotonic()-startup_started)*1000),"cpuMicroseconds":startup_after["cpuMicroseconds"]-startup_before["cpuMicroseconds"],"peakMemoryBytes":startup_after["peakMemoryBytes"]}}
assert results["coldHealth"]["milliseconds"]<=45000
data=base64.b64decode(fixtures["synthetic"])
for profile in ["ua1","ua2","1b","2b","3b","4"]:
    status,result=request("/validate?profile="+profile,data)
    assert status==200,(profile,status,result)
    results["profiles"][profile]=result
valid=base64.b64decode(fixtures["compliant"])
status,result=request("/validate?profile=2b",valid)
assert status==200 and result["compliant"] is True
results["compliantPdfa2b"]=result
results["references"]=[]
for fixture in fixtures["references"]:
    reference=base64.b64decode(fixture["base64"])
    for expected in fixture["profiles"]:
        status,result=request("/validate?profile="+expected["profile"],reference)
        assert status==200,(fixture["id"],status,result)
        assert result["sha256"]==fixture["sha256"]
        for key in ("profile","compliant","passedRules","failedRules","failedChecks"):
            assert result[key]==expected[key],(fixture["id"],key,result[key])
        identity=lambda rule:(rule["specification"],rule["clause"],rule["testNumber"])
        assert sorted(result["findings"],key=identity)==sorted(expected["findings"],key=identity),(fixture["id"],"findings")
        assert result["engine"]=={"name":"veraPDF","version":"1.30.2"}
        assert result["truncated"] is False
        assert set(result)=={"sha256","profile","engine","compliant","passedRules","failedRules","failedChecks","truncated","findings"}
        results["references"].append({"id":fixture["id"],"milliseconds":timings[-1]["milliseconds"],"cpuMicroseconds":timings[-1]["cpuMicroseconds"],**result})
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    concurrent_results=list(pool.map(lambda _:request("/validate?profile=2b",valid),range(2)))
assert sorted(status for status,_ in concurrent_results)==[200,503],concurrent_results
assert next(result for status,result in concurrent_results if status==503)=={"code":"VALIDATOR_BUSY"}
results["concurrency"]=[{"status":status,"code":result.get("code")} for status,result in concurrent_results]
status,result=request("/qualification/process-deadline")
assert status==200 and result=={"code":"VALIDATION_TIMEOUT","temporaryDirectories":0},(status,result)
results["syntheticProcessDeadline"]=result
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
results["timings"]=timings
results["resourcesObserved"]=resource_metrics()
print(json.dumps(results,separators=(",",":")))
'''

try:
    docker(
        "run", "-d", "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--memory", RESOURCES["memory"], "--memory-swap", RESOURCES["memory"], "--cpus", RESOURCES["cpu"], "--pids-limit", "128", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--env", "QUALIFICATION_ENABLED=true", "--name", NAME, IMAGE,
    )
    fixtures = {
        "synthetic": base64.b64encode((FIXTURES / "synthetic.pdf").read_bytes()).decode(),
        "compliant": base64.b64encode((FIXTURES / "compliant-2b.pdf").read_bytes()).decode(),
        "references": [],
    }
    manifest = json.loads((REFERENCES / "manifest.json").read_text())
    for fixture in manifest["fixtures"]:
        data = (REFERENCES / fixture["file"]).read_bytes()
        assert hashlib.sha256(data).hexdigest() == fixture["sha256"]
        fixtures["references"].append({
            "id": fixture["id"], "sha256": fixture["sha256"], "profiles": fixture["profiles"],
            "base64": base64.b64encode(data).decode(),
        })
    generator_spec = importlib.util.spec_from_file_location("benchmark_pdf", FIXTURES.parent.parent / "scripts/generate-benchmark-pdf.py")
    generator = importlib.util.module_from_spec(generator_spec)
    generator_spec.loader.exec_module(generator)
    benchmark = json.loads((BENCHMARKS / "manifest.json").read_text())["fixtures"][0]
    large_data = generator.generate_pdf()
    assert len(large_data) == benchmark["sizeBytes"]
    assert hashlib.sha256(large_data).hexdigest() == benchmark["sha256"]
    fixtures["references"].append({"id": benchmark["id"], "sha256": benchmark["sha256"], "profiles": benchmark["profiles"], "base64": base64.b64encode(large_data).decode()})
    # Whole-batch budget includes many separate 40-second engine calls. Each
    # request/process assertion remains unchanged on the smaller CPU allocation.
    results = json.loads(docker("exec", "-i", NAME, "python3", "-B", "-c", script, input=json.dumps(fixtures).encode(), timeout=1800))
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
        "evidence": "local Docker; synthetic and official pinned reference PDFs; no hosted deployment or customer data",
        "imageId": inspection["Image"], "runtimeNetwork": "none", "readOnlyRoot": True,
        "instanceType": options.instance_type,
        "resourceLimits": {"cpu": float(RESOURCES["cpu"]), "memoryBytes": RESOURCES["memoryBytes"], "diskGb": RESOURCES["diskGb"], "swapDisabled": True},
        "cloudflareInstanceSource": "https://developers.cloudflare.com/containers/platform/pricing/",
        "javaOptions": next(value.removeprefix("JAVA_OPTS=") for value in inspection["Config"]["Env"] if value.startswith("JAVA_OPTS=")),
        "imageSizeBytes": json.loads(docker("image", "inspect", IMAGE))[0]["Size"],
        "temporaryFilesRemaining": 0, "containerLogsEmpty": True,
        **results,
    }
    print(json.dumps(proof, indent=2))
except Exception as error:
    # Preserve a failed resource qualification as evidence; it never creates a
    # successful report or loosens the 40/45-second engine/transport budgets.
    print(json.dumps({
        "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "failed", "evidence": "local Docker resource qualification; non-customer PDFs",
        "image": IMAGE, "instanceType": options.instance_type,
        "resourceLimits": {"cpu": float(RESOURCES["cpu"]), "memoryBytes": RESOURCES["memoryBytes"], "diskGb": RESOURCES["diskGb"], "swapDisabled": True},
        "failure": str(error)[:2000],
    }, indent=2))
    raise
finally:
    subprocess.run(["docker", "rm", "-f", NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
