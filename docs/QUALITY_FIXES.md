# Quality Fixes

This audit records 50 concrete issues found in the project and the fix applied for each one.

| # | Issue found | Fix applied | Evidence |
|---|---|---|---|
| 1 | Blank `TWITTERAPI_IO_KEY` was treated as configured. | Added API key trimming and blank rejection. | `src/validation.ts`, `tests/service.test.ts` |
| 2 | Blank `GETXAPI_KEY` was treated as configured. | Shared key normalization now rejects blank values. | `src/validation.ts`, `tests/tui.test.ts` |
| 3 | Whitespace around API keys was sent to providers. | `createProvider` trims keys before provider construction. | `src/service.ts`, `tests/service.test.ts` |
| 4 | `X_POST_PROVIDER` rejected values with surrounding whitespace. | Provider defaults are trimmed before validation. | `src/validation.ts`, `tests/service.test.ts` |
| 5 | `TwitterAPI.io` style provider names were rejected. | Added dotted/dashed alias normalization. | `src/validation.ts`, `tests/service.test.ts` |
| 6 | `get_xapi` aliases were rejected. | Added `get_xapi` normalization to `getxapi`. | `src/validation.ts`, `tests/service.test.ts` |
| 7 | Auto-selection preferred a blank TwitterAPI key over a valid GetXAPI key. | Auto-selection now checks normalized nonblank keys. | `src/service.ts`, `tests/service.test.ts` |
| 8 | Explicit blank provider keys failed late and unclearly. | Explicit provider creation now rejects blank keys immediately. | `src/service.ts`, `tests/service.test.ts` |
| 9 | Blank search queries could reach a provider. | Search queries are required after trimming. | `src/service.ts`, `tests/service.test.ts` |
| 10 | Search queries were not trimmed. | Search input is normalized before provider calls. | `src/service.ts` |
| 11 | Blank cursors could be forwarded. | Cursor input is normalized and omitted when blank. | `src/service.ts` |
| 12 | Blank `userId` values could be forwarded. | User IDs are trimmed and omitted when blank. | `src/service.ts` |
| 13 | `@@@` could become an empty username and still be used. | Username cleanup now rejects empty post-`@` values. | `src/validation.ts`, `tests/service.test.ts` |
| 14 | Usernames were not consistently normalized across service paths. | Added shared username normalization. | `src/xPostUrl.ts`, `src/service.ts` |
| 15 | GetXAPI `tweets_and_replies` was allowed with only `userId`, although the endpoint needs `userName`. | Provider now rejects that combination before making a request. | `src/providers/getxapi.ts`, `tests/providers.test.ts` |
| 16 | Provider classes could be called directly without user identity for user posts. | Provider-level identity checks were added. | `src/providers/getxapi.ts`, `src/providers/twitterapiIo.ts` |
| 17 | Provider HTTP requests had no timeout. | Added a 30-second abort timeout to all provider fetches. | `src/http.ts` |
| 18 | Network failures surfaced as raw fetch errors. | Network failures are wrapped as `ProviderHttpError`. | `src/http.ts`, `tests/providers.test.ts` |
| 19 | Successful non-JSON provider responses were accepted. | Success responses must parse as JSON. | `src/http.ts`, `tests/providers.test.ts` |
| 20 | String `"true"` pagination flags were normalized as false. | Boolean normalization now accepts `"true"`. | `src/http.ts` |
| 21 | Numeric `1` pagination flags were normalized as false. | Boolean normalization now accepts `1`. | `src/http.ts` |
| 22 | Empty TwitterAPI tweet lookup returned `null`. | Empty tweet detail now throws `ProviderEmptyResultError`. | `src/providers/twitterapiIo.ts` |
| 23 | Empty GetXAPI tweet detail returned `null`. | Empty tweet detail now throws `ProviderEmptyResultError`. | `src/providers/getxapi.ts`, `tests/providers.test.ts` |
| 24 | Empty TwitterAPI user profile returned `null`. | Empty user profile now throws `ProviderEmptyResultError`. | `src/providers/twitterapiIo.ts` |
| 25 | Empty GetXAPI user profile returned `null`. | Empty user profile now throws `ProviderEmptyResultError`. | `src/providers/getxapi.ts` |
| 26 | Malformed search responses without `tweets` were silently treated as empty. | Search normalization now requires a `tweets` array. | `src/http.ts`, `src/providers/getxapi.ts`, `src/providers/twitterapiIo.ts`, `tests/providers.test.ts` |
| 27 | Very old short numeric tweet IDs were rejected. | Tweet ID parsing now accepts 1-30 digits. | `src/xPostUrl.ts`, `tests/xPostUrl.test.ts` |
| 28 | TUI treated blank TwitterAPI key env vars as configured. | TUI status uses shared key normalization. | `src/tui.ts`, `tests/tui.test.ts` |
| 29 | TUI treated blank GetXAPI key env vars as configured. | TUI status uses shared key normalization. | `src/tui.ts`, `tests/tui.test.ts` |
| 30 | TUI displayed provider aliases inconsistently. | TUI normalizes default provider display. | `src/tui.ts`, `tests/tui.test.ts` |
| 31 | TUI box drawing was fragile with mixed-width Chinese text. | Replaced fixed-width box drawing with stable ASCII separators. | `src/tui.ts`, `tests/tui.test.ts` |
| 32 | `.env.example` defaulted to `twitterapi_io`, breaking GetXAPI-only copy/paste setups. | Default provider is now blank with comments. | `.env.example` |
| 33 | `.env.example` did not warn against committing real keys. | Added comments that keys must not be committed. | `.env.example` |
| 34 | Empty `X_MCP_HOME` wrote onboarding state to a relative path. | Empty custom home values are ignored. | `src/onboarding.ts`, `tests/onboarding.test.ts` |
| 35 | Onboarding state writes were not atomic. | State writes now use a temporary file and rename. | `src/onboarding.ts` |
| 36 | Existing onboarding state could contain an invalid preferred provider. | State reads sanitize provider values. | `src/onboarding.ts`, `tests/onboarding.test.ts` |
| 37 | Package had no `main` entry. | Added `main: dist/index.js`. | `package.json` |
| 38 | Package had no type entry. | Added `types: dist/index.d.ts`. | `package.json`, `tsconfig.json` |
| 39 | Package had no `exports` map. | Added ESM export metadata. | `package.json` |
| 40 | Type declarations were not emitted. | Enabled TypeScript declaration output. | `tsconfig.json`, `npm pack --dry-run` |
| 41 | Source maps were not emitted. | Enabled TypeScript source maps. | `tsconfig.json`, `dist/*.js.map` |
| 42 | `npm start` depended on dev build tooling through `prestart`. | Removed `prestart`; packaged starts use built `dist`. | `package.json` |
| 43 | `npm run smoke` could fail after `npm run clean`. | Added `presmoke` build hook. | `package.json` |
| 44 | Package tarball omitted maintenance docs. | Added docs and metadata files to package `files`. | `package.json`, `npm pack --dry-run` |
| 45 | Line endings caused Windows Git churn warnings. | Added `.gitattributes` to normalize text files to LF. | `.gitattributes` |
| 46 | Project had no changelog. | Added `CHANGELOG.md`. | `CHANGELOG.md` |
| 47 | Project had no contribution guide. | Added `CONTRIBUTING.md`. | `CONTRIBUTING.md` |
| 48 | Project had no security policy. | Added `SECURITY.md`. | `SECURITY.md` |
| 49 | Project had no CI verification. | Added GitHub Actions for install, test, build, and smoke. | `.github/workflows/ci.yml` |
| 50 | There was no durable audit trail for the 50-problem pass. | Added this quality fixes document. | `docs/QUALITY_FIXES.md` |
