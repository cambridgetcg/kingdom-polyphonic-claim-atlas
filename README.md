# KINGDOM Polyphonic Claim Atlas

This repository is the standalone Phase-0 producer for `kingdom.truth-relations/0.1`.

It builds a closed, static and synthetic teaching atlas in which expression, interpretation, claim, evidence, reasoning, narrative, provenance, institutional status, assessment and correction remain different types. The atlas does not decide truth for live claims or people. It has no model, network, runtime, submission surface, score, action or downstream adapter.

## Public handoff

The only public artifacts are:

- `/truth/polyphonic-claim-atlas-2026-08-26.json`
- `/truth/schemas/v0.1/public-snapshot.schema.json`
- `/POLYPHONIC-CLAIM-ATLAS-v0.1.md`

They are dated, immutable historical artifacts. There is no alias or page.

## Local verification

Node.js 20 or newer is sufficient; there are no dependencies and no install step.

```sh
npm test
npm run validate
npm run build
npm run build:check
npm run check
npm run overview
```

`build` may write only the three public files above. No command accepts an output path or performs network or external publication work.
