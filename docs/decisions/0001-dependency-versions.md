# 0001. Zod 4 and Vitest 5

Date: 2026-10-26. Status: accepted.

`npm audit --omit=dev` flagged Zod 3.25.76 (high: memory exhaustion when validating oversized constrained collections, GHSA-mrhx-c7xc-m3w5). Zod validates untrusted imports, so this is directly relevant (I-08). Pinned Zod 4.6.7 instead. Dev-only: Vitest 3.2.7 pulled in vulnerable `tinypool` and `@vitest/mocker`; pinned Vitest 5.0.5.

Defence in depth: `validateProfile` checks collection counts against `LIMITS` before Zod sees the data, and file size is checked before parsing.

CI runs `npm audit --omit=dev`, so a future advisory fails the build.
