# Gutenberg / Guteneo archive audit

Read-only **3 October 2026** audit of `/workspace/guteneo`, without generation or
source mutation. Paths below are relative to that historical source unless stated.

## Volume and Git strategy

Final archival decision: **ordinary Git**. Initial LFS recommendation below was
superseded after endpoint authentication refusal; no LFS media transferred.
Normal blobs retain exact quality/bytes; clone retrieves all data. Six historical
files >16 MiB are segmented under media-parts for Git API request limits;
`tools/restore_large_media.py`/large-media.json reconstruct exactly.

- 491 files,1,142,285,277 bytes (~1.142 GB/1.064 GiB).
- One >50 MiB: `production/deliverables/Guteneo-Pixar2-kit-production.zip`,59,954,205 bytes/~57.18 MiB; none>100 MiB.
- Initial recommendation was LFS for MP4/WAV/MP3/PNG/JPG/WebP/ZIP, normal Git for text/code/JSON/CSV/VTT/HTML/JS. Few individually large files do not remove total-history volume.
- Two pyc files 47,698 bytes/35 caches 2,240 bytes are regenerable; exclusions must be inventoried.
- Four strict duplicate groups add 8,224,695 bytes. Stable paths aid reproducibility; LFS content IDs would deduplicate.

| Extension | Files | Bytes |
|---|---:|---:|
| `.cache` | 35 | 2240 |
| `.csv` | 1 | 396 |
| `.html` | 1 | 48795 |
| `.jpg` | 93 | 9971671 |
| `.js` | 1 | 763770 |
| `.json` | 68 | 564481 |
| `.md` | 1 | 3122 |
| `.mp3` | 15 | 1949859 |
| `.mp4` | 41 | 425630600 |
| `.png` | 182 | 554352412 |
| `.py` | 5 | 40361 |
| `.pyc` | 2 | 47698 |
| `.txt` | 5 | 8272 |
| `.vtt` | 1 | 1649 |
| `.wav` | 38 | 88769916 |
| `.webp` | 1 | 175830 |
| `.zip` | 1 | 59954205 |

## Temporary URLs and access data

Targeted scan found **18 text files/229 signed-URL or oobCode occurrences**.
Remove access parameters from archival text, retaining generation IDs/local paths/
canonical flow URL. Parameter names are not secret values; none is reproduced here.
No known-format API/private/GitHub/AWS/Bearer secret was detected; targeted patterns
never guarantee every secret format absent. Product captures are public website,
not authenticated native screenshots.

| File | Temporary-access URL occurrences |
|---|---:|
| `project.json` | 1 |
| `verification/stone.json` | 1 |
| `verification/corrections.json` | 2 |
| `verification/final-download.json` | 1 |
| `verification/master-download.json` | 2 |
| `verification/downloads.json` | 4 |
| `production/final-production.json` | 29 |
| `production/state.json` | 50 |
| `production/audio/manifest.json` | 8 |
| `production/audio/final-conclusion-revision-manifest.json` | 4 |
| `production/sfx/manifest.json` | 6 |
| `production/images/scenes-vertical-manifest.json` | 27 |
| `production/images/scenes-manifest.json` | 23 |
| `production/images/pixar-manifest.json` | 4 |
| `production/images/master-manifest.json` | 4 |
| `production/video/final/sync-manifest.json` | 6 |
| `production/video/final/seedance-manifest.json` | 6 |
| `production/images/final/manifest.json` | 51 |

Old ZIP has 31 entries/63,603,820 uncompressed bytes. Text scan found no signed URL/
oobCode/known-secret pattern. Retain historically; its storyboard/prompts precede
seven-place revision and are **not current generation instructions**.

## Portability

Assembly/partial/salvage/check_media scripts resolve from __file__.
Copied `production/product/capture.py` line5 fixed source output path was changed
to `Path(__file__).resolve().parent`. Manifests/QA/download reports/four concat
files preserve historical absolute paths or explicitly map them to archive equivalents.
Assembly manifest is relative but still lists14 old-strategy clips, eight missing/
two rejected, never a validated final manifest.

## Asset classification

**Reuse:** approved proposal2 without copying office into every scene; exact eight
voices; final scene7 reference `07-reference-finale.wav`; generated sfx; actual public
captures; official homepage V8/endcards preserving logo/stamp/postmark/swallows/
Manon; cost-audit JSON/CSV as traceable credits, never actual EUR invoice.
Current scene7 wording remains in the localized script, replacing earlier conclusion.

**Best preview, not final:**34-second V04+V06+V07+official ending excludes monitor
error but keeps old sets; horizontal17-second extract is H07+ending.

**Rejected:** h/v05 Seedance+Sync show UI on monitor rear; preserve for traceability,
never reuse.43-second Instagram extract includes V05; associated QA frames document it.

**Historical/superseded:** root final-named movies/project/verification predate
approved voices/direction; Egypt pilot realistic/imperfect sync; master/01–07
realistic image attempts; final-image selection/storyboard/ZIP predate set4/5/6
revision. A filename containing final proves no approval/completion.

## Inventory limits

Inventory proves listed local-file presence, not all past provider outputs downloaded.
Manifest/generation IDs recover provider-only material. First-message original image
was not confidently identified; distinguish it from included approved proposal2.
Latest seven-scene proposal is recorded separately; no corresponding video exists.
Paid production remains paused for budget review. Git archive/merge authority
never authorizes another credit spend.
