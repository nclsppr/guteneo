import assert from "node:assert/strict";
import test from "node:test";
import { dmarcEnforcesAllMail } from "../../scripts/email-sender-identity-policy.mjs";

test("BIMI diagnostic recognizes unambiguous full DMARC enforcement", () => {
  for (const record of [
    "v=DMARC1; p=reject",
    "v=DMARC1; p=quarantine; pct=100;",
    "v=DMARC1; p=reject; sp=quarantine; adkim=r; aspf=s",
    "V=DMARC1; P=REJECT; SP=QUARANTINE; ADKIM=R;",
    "v = DMARC1 ; p = reject ; rua=mailto:reports@example.test; extension=value",
  ])
    assert.equal(dmarcEnforcesAllMail([record]), true, record);
});

test("BIMI diagnostic never treats ambiguous or malformed policy as enforcement", () => {
  for (const records of [
    [],
    ["v=DMARC1; p=none;"],
    ["v=DMARC1; p=none; p=reject"],
    ["v=DMARC1; p=reject; P=none"],
    ["v=DMARC1; p=reject; sp=reject; sp=none"],
    ["v=DMARC1; p=reject; pct=1; pct=100"],
    ["v=DMARC1; p=reject; pct=100; extension=a; extension=b"],
    ["v=DMARC1; p=reject", "v=DMARC1; p=quarantine"],
    ["v=dmarc1; p=reject"],
    ["v=DMARC2; p=reject"],
    ["p=reject; v=DMARC1"],
    ["v=DMARC1; extension=value; p=reject"],
    ["v=DMARC1; p=reject; sp=unknown"],
    ["v=DMARC1; p=reject; sp=none"],
    ["v=DMARC1; p=reject; pct=99"],
    ["v=DMARC1; p=reject; pct=100junk"],
    ["v=DMARC1; p=reject; adkim=unknown"],
    ["v=DMARC1; p=reject; broken"],
    ["v=DMARC1; p=reject;;"],
    ["v=DMARC1; p=reject; empty="],
    ["v=DMARC1; p=reject\n; pct=100"],
    [null],
  ])
    assert.equal(dmarcEnforcesAllMail(records), false, JSON.stringify(records));
});
