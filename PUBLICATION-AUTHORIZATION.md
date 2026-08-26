# Publication authorization boundary

## Local producer write authority

The deterministic local producer is authorized to create or atomically replace only these repository-relative files:

1. `public/truth/polyphonic-claim-atlas-2026-08-26.json`
2. `public/truth/schemas/v0.1/public-snapshot.schema.json`
3. `public/POLYPHONIC-CLAIM-ATLAS-v0.1.md`

No output argument, alias, page, manifest, asset, runtime or additional public file is authorized.

## External publication state

Independent review is complete. External publication is authorized only for the following exact source bytes at the following exact destination paths:

| Source | Destination | Bytes | SHA-256 |
|---|---|---:|---|
| `public/truth/polyphonic-claim-atlas-2026-08-26.json` | `/truth/polyphonic-claim-atlas-2026-08-26.json` | 178016 | `69d68faf0885cecf084bee3ff094c742786e7901f8d1da90fa510cce5194970b` |
| `public/truth/schemas/v0.1/public-snapshot.schema.json` | `/truth/schemas/v0.1/public-snapshot.schema.json` | 62109 | `8244c3428ea810defd98da1ca7c1d0fec6541c0c175e3195b711b89af39cdb27` |
| `public/POLYPHONIC-CLAIM-ATLAS-v0.1.md` | `/POLYPHONIC-CLAIM-ATLAS-v0.1.md` | 9188 | `974cb357ad1f5a23fa3f8798e444bbfb4dc43b1bf8aa1d14609599877ed13126` |

This authorization covers no alias, page, manifest, asset, loader, runtime, API, MCP surface, feed or additional file. It authorizes no semantic change, Git initialization in this producer, tag, mutable release, truth determination, score, classification, recommendation or downstream action. Any byte change voids this authorization and requires a new review and receipt lock.

The machine-readable, non-self-referential lock is `REVIEWED-RECEIPTS.json`. It is not part of the public triplet and does not affect the three receipted byte sequences.
