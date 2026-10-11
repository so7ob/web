# Frozen product contracts

These synthetic fixtures are required by current tests. They are independent expected values captured before the current implementation, not generated from the code under test. Do not regenerate them to make a failure pass. Any intentional behavior change needs a separately reviewed contract change.

| Fixture | Current consumer | Origin / role |
|---|---|---|
| `api-inventory.json` | `tests/e2e/api-inventory.spec.ts`, `role-contracts.spec.ts` | Frozen method/path inventory; OpenAPI correspondence and authorization coverage. Moved byte-for-byte from docs/migration in #77. |
| `legacy-size-ranking.json` | `tools/migration/cms-boundary-smoke.mjs` | Pinned 27-schema ranking and maximum 60-block document byte count; exercises real HTTP, normalization, MariaDB persistence, publish and versions. Moved byte-for-byte in #77. |
| `source-block-contracts.json` | `packages/contracts/src/source-block-parity.test.ts` | Expected defaults, property acceptance and normalized hashes from Website@dddf8cd. The retired source generator is available in Git history only. |
| `../e2e/fixtures/public-content.json` | `tests/e2e/setup.ts` | Bilingual synthetic published CMS/menu/settings data for browser tests. Development initialization constructs the equivalent public sections from the retained ar/en content modules. |
| `../e2e/fixtures/auth-axe-baseline.json` | `tests/e2e/auth-public.spec.ts` | Frozen empty axe violation lists for ar/en at 375/1280. |

Source attribution is data, not a requirement to clone the source. The SQLite DDL fixtures in `packages/server/src/migration/fixtures*` and schema-v1/v2 JSON remain necessary for transfer compatibility tests and data maintenance.

SHA-256 of the unchanged values moved in #77:

- `api-inventory.json`: `c03877355673e6e7968f3edc7aec6e56ab6f8543e53bd7a79becaa4c2b60ec92`.
- `legacy-size-ranking.json`: `cd55c5a84fdbdcb7e61543db5c83a5083b73eb0cb2ef4e1503685daad2f973e2`.
- `source-block-contracts.json`: `11a9e7cb8bc67f89229d9a674679e276420d835230f5b736f3c21e06397ac3f7`.
