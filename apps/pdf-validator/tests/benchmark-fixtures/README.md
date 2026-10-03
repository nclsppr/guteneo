# Deterministic PDF close to the upload limit

`manifest.json` describes a **100-page A4 synthetic PDF** of **10,366,823 bytes
(9.887 MiB)**. Each page contains technical labels, a vector table with 96 cells
and its own 200 × 160 RGB noise image. All text, values and pixels were created
for Guteneo qualification; there is no customer content or third-party document.

The generated document is ordinary **PDF 1.7**, deliberately without embedded
fonts, tagging, XMP or an archival output intent. It is expected to fail all six
supported conformance profiles. This is a workload benchmark, not a conformant
reference or an accessibility example. The separate `../references/` corpus
provides actual passing and failing official references.

The large PDF is **not stored in Git**. Reproduce it offline with Python's
standard library:

```sh
python3 -B apps/pdf-validator/scripts/generate-benchmark-pdf.py \
  /tmp/guteneo-synthetic-benchmark.pdf \
  --manifest apps/pdf-validator/tests/benchmark-fixtures/manifest.json
```

The generator uses a specified xorshift32 sequence and explicit stored DEFLATE
blocks with Adler-32. There are no timestamps, environment-dependent values,
compression heuristics or external dependencies. PDF objects, stream lengths,
cross-reference offsets and trailer values are computed from exact bytes. The
manifest pins both the PDF and generator hashes. Two independent generations
matched the reviewed PDF hash:

`d3e4f48e0c7bd3ca3f8739062eac029a0d68d801fa04430dad4d351e96bc391e`

## Actual local baseline

`local-cli-proof.json` records a real run of checksum-verified veraPDF Greenfield
**1.30.2** on 3 October 2026. All six profiles completed under the existing
forty-second per-document limit with a 384 MiB Java heap. The production report
normalizer accepted every report and its complete counts and fixed rule
identities. Observed local CLI times were **1.576–1.902 seconds**; these are not
hosted, restricted-CPU, cold-start or end-to-end timings.

| Profile | Passed rules | Failed rules | Failed checks |
| --- | ---: | ---: | ---: |
| `ua1` | 99 | 7 | 24,105 |
| `ua2` | 1720 | 7 | 13,606 |
| `1b` | 122 | 7 | 13,806 |
| `2b` | 140 | 4 | 13,803 |
| `3b` | 142 | 4 | 13,803 |
| `4` | 102 | 7 | 13,806 |

The manifest includes every expected failed rule and its failed-check count.
Rule ordering is not part of the API contract: compare findings after sorting
by specification, clause and test number, while retaining exact identities,
counts and cardinality. Any unexpected profile outcome, missing or extra rule,
hash mismatch, incomplete report or timeout must fail qualification.

This generated workload covers many pages, text/vector operators, multiple
image streams and transfer close to the size cap. It does not establish limits
for every possible PDF, particularly decompression-heavy or unusually complex
documents. The same fixed forty-second engine and forty-five-second Worker
budgets remain applicable.
