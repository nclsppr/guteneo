# Official veraPDF reference corpus

These twelve PDFs are **unmodified upstream reference files**, not customer
documents or Guteneo-generated PDFs. They come from the official
[`veraPDF/veraPDF-corpus`](https://github.com/veraPDF/veraPDF-corpus) repository at
commit `bb75f4f0073d9350dfd058c0162a367e6fadf25e`. Each file's immutable download
URL, original path, SHA-256, expected profile result and attribution appear in
`manifest.json`.

The upstream repository expressly licenses its corpus under **CC BY 4.0** in
its README. That notice is preserved verbatim in `UPSTREAM_README.md`; the full
license is included in `CC-BY-4.0.txt`. Attribution: **veraPDF Corpus, veraPDF
contributors**, licensed CC BY 4.0. Guteneo has renamed the local files for
stable test paths and has not changed their bytes. The license text is the
official Creative Commons text from
[`creativecommons/creativecommons.org`](https://github.com/creativecommons/creativecommons.org/blob/main/docroot/legalcode/by_4.0.txt).

## Observed engine results

All twelve files were run through the actual checksum-verified **veraPDF
Greenfield 1.30.2 CLI** on 3 October 2026. `local-cli-proof.json` records the
observed results, exact file hashes and engine archive hash. The process used a
384 MiB Java heap and a forty-second timeout for each document. This records
local CLI execution; it does not establish container or hosted qualification.

| Profile | Passing file: passed / failed rules | Failing file: passed / failed rules | Expected failed rule |
| --- | ---: | ---: | --- |
| `ua1` | 106 / 0 | 105 / 1 | ISO 14289-1:2014, 7.1, test 3 |
| `ua2` | 1727 / 0 | 1726 / 1 | ISO 14289-2:2024, 5, test 2 |
| `1b` | 129 / 0 | 128 / 1 | ISO 19005-1:2005, 6.2.3.3, test 3 |
| `2b` | 144 / 0 | 143 / 1 | ISO 19005-2:2011, 6.1.2, test 2 |
| `3b` | 146 / 0 | 145 / 1 | ISO 19005-3:2012, 6.8, test 4 |
| `4` | 109 / 0 | 108 / 1 | ISO 19005-4:2020, 6.1.12, test 1 |

The upstream corpus is atomic: a filename marked `pass` describes its targeted
test, rather than automatically certifying the whole document. The passing
fixtures selected here were separately observed to pass **every machine rule**
of their explicit supported profile. `ua2` includes the pinned ISO 32005 tagged
PDF rules. The `ua1` and `3b` negative fixtures each fail two checks of one rule;
the other negatives fail one check. The manifest records these distinctions.

A passing PDF/UA machine report is not proof of full accessibility or legal
compliance. Human assessment remains necessary. None of these references is
published as a Guteneo customer example or included in the public web assets.

The release driver must check file hashes and the complete expected profile
result, including rule identities and counts. Naming alone is not evidence;
unexpected results must stop qualification.
