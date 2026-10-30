# Gutenberg through the ages — recovery dossier

Archive of **3 October 2026** work, decisions and latest scene proposal, separate
from the published [homepage/roles films](../guteneo-film/README.md).
**The complete film is unfinished. Paid generation stays paused until a revised
total budget and ceiling are approved.** Historical authority covered Git archival/
main integration, never restarting old Seedance nodes. No archived media joins the
public catalog.

## Start here

1. [Decisions/current state](DECISIONS_AND_STATUS.md).
2. [Revised storyboard/prompts](STORYBOARD_AND_PROMPTS.md).
3. [Technical handoff](TECHNICAL_HANDOFF.md): files/provider IDs/timing/commands/limits.
4. [Verifiable inventory](inventory.json), [structured handoff](handoff.json), [archive audit](ARCHIVE_AUDIT.md).

Seven new scenes are written proposals, with no new generated/approved images.
Old archived prompts/storyboards/nodes do not supersede them. Open approved
[character proposal2](archive/production/images/Pixar-proposition-2.png),
[34-second preview excluding broken computer](archive/production/deliverables/Guteneo-apercu-court-sans-plan-ordinateur-34s.mp4)
and [credit audit](archive/production/deliverables/cost-audit.json) first. Preview
reuses old fax/web/Guteneo scenes rather than the seven proposed environments.

## Layout and recovery

`archive/production/` holds images/audio/video/sfx/product/finishing/deliverables,
local editing scripts and historical state/final-production manifests.
`archive/brand-reference/` holds official media, `archive/verification/` initial
historical proof; `tools/` archives/verifies without generation.

Media stays **ordinary Git**, no quality reduction/reencoding, approximately
**1.14 GB** checkout. No ElevenLabs/LFS access needed. Six historical files over
16 MiB use8-MiB `media-parts/` chunks plus `large-media.json`; approved character/
voices/34-second preview are directly accessible. Python3.11+:

```sh
python3 videos/guteneo-gutenberg/tools/restore_large_media.py
python3 videos/guteneo-gutenberg/tools/verify_archive.py
```

Inventory tracks source/archive sizes/hashes; verifier detects missing/incomplete
files. LFS and HTTPS Git authentication failed while GitHub API writes worked;
no LFS object transferred. Git API request limits required chunks. Restoration
reconstructs exact original bytes without codecs/services, needs ~207 MB extra
and leaves restored files ignored to prevent duplicates. Future LFS migration is separate.

## Fidelity and evidence boundary

All useful `/workspace/guteneo/` local files, including rejected attempts, were
copied under archive. Only reproducible `.cache`/`__pycache__`/`.pyc` were omitted
and inventoried. Media bytes stay exact. Signed-URL temporary parameters/oobCode
were removed from text copies before public archival; generation IDs remain.
Authorized account access can renew remote links; cleaned URLs promise no anonymous
download. Local viewing/editing needs no authentication token.

Historical absolute paths map to archive equivalents. Editing scripts resolve
from their own location and regenerate concat lists. Copied product/capture.py
output path was made script-relative and recorded in inventory; captured pixels
were untouched. Archive is available local files/manifests, not full conversation
history/every provider-only variation. Essential decisions/latest scenes are
recorded here. First-message original image was not confidently identified;
approved proposal2 is included.

`archive/` is immutable original evidence, including localized narration/prompts/
original comments. Natural narration snapshots in the separate film project also
retain frozen original evidence. English technical wrappers explain those sources;
new instructions remain English under [standards](../../docs/REPOSITORY_STANDARDS.md).

## Product and brand

This archival addition changes no feature/permission/journey/public film/deployment
and requires no feature-map change by itself. Follow [brand identity](../../docs/BRAND_IDENTITY.md)
and [AGENTS](../../AGENTS.md). This project's explicit approved François-Louis
narration/Manon signature override other-film default voice preferences: never
regenerate approved speech to enforce an unrelated default.
