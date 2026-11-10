# HouseMap Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Thai-language static web app on GitHub Pages where a friend group records houses/land as pins on a Chiang Mai map, shared through a Supabase database behind a group code.

**Architecture:** Plain HTML + ES modules, no build step. Pure logic (units, validation, filter/sort, import merge) lives in testable modules with no DOM; `api.js` is the only file that talks to Supabase, and only through RPC functions (tables are locked, RLS on, no policies). Leaflet + OSM tiles render the map; UI modules wire map, list and form together.

**Tech Stack:** HTML/CSS/JS (ES modules), Leaflet 1.9.4 (cdnjs), `@supabase/supabase-js` 2.x (jsdelivr, pinned), Supabase free plan (Postgres + pgcrypto), GitHub Pages + GitHub Actions, `node:test` for unit tests, headless Edge via the `web-verify-edge` skill for UI checks.

**Spec:** `D:\CLAUDE CODE\99-Unsorted\HouseMap\docs\2026-11-10-housemap-design.md`

## Global Constraints

- UI language Thai; usable at phone width (friends open it on phones).
- No build step, no installs needed to use or update; no credit card, no cost.
- Map: Leaflet + standard OpenStreetMap tiles with attribution; initial view Chiang Mai (18.7883, 98.9853), zoom 11; no province lock in code.
- One group only; group code stored only as a hash in the database, never in the repo; typed at runtime and remembered in the browser (`localStorage`).
- Repo is public: only the Supabase URL and anon key appear in `js/config.js`; tables have RLS enabled with no policies; all access via RPC functions that verify the code hash.
- Area stored canonically in square metres; entered/shown as ตร.ม. / ตร.วา (1 ตร.วา = 4 ตร.ม.) / ไร่ (1 ไร่ = 1600 ตร.ม.).
- Price is a single total in baht (integer, nullable). One parcel = one point (lat/lng). No photos.
- One row per parcel with `version`; a stale save must be rejected with a conflict, never overwrite silently. Delete is soft (`deleted_at`) with a trash and restore. Delete asks for confirmation.
- JSON import is additive: duplicate ids are skipped and reported; requires confirmation.
- Database unreachable: show a clear Thai error, read-only, no offline queue.
- Reserved fields in the data model, no UI: `roof` (`gable|hip|flat`), `facing` (`N|NE|E|SE|S|SW|W|NW`), `footprint_w`, `footprint_d` (metres).
- Do not put personal data (phone, ID numbers) in any field; "added by" is free text, remembered in the browser.

## Review Focus

- Two friends edit the same parcel from stale copies → second save gets a conflict message and nothing is overwritten (Task 3, Task 5).
- Wrong group code, or empty code → no data returned, clear Thai message, no crash (Task 3, Task 4).
- Price/area/rooms left blank or typed as text, negative numbers, `0` → blank saves as null; invalid shows a field error; `0` is accepted for rooms only (Task 2).
- Lat/lng outside Thailand or NaN, e.g. a pin dragged off the map → rejected by validation (Task 2).
- Source link without `http(s)://` or a `javascript:` URL → rejected, so the list never renders a script link; all text rendered via `textContent` (Task 2, Task 5).
- Import file that is not JSON, has missing fields, or contains ids already present → nothing partially applied without a report; duplicates skipped (Task 6).
- Filtering with no results / price filter with null prices → empty-state message; null prices sort last (Task 2).

---

## File Structure

```
HouseMap/
  index.html                 page shell, loads Leaflet + js/main.js
  css/style.css              layout (map + side list, phone stacked)
  js/config.js               SUPABASE_URL, SUPABASE_ANON_KEY
  js/units.js                area conversion/format (pure)
  js/model.js                parcel shape, validation, filter/sort (pure)
  js/api.js                  Supabase RPC wrappers
  js/importer.js             export JSON, parse/merge import (pure) 
  js/mapview.js              Leaflet map, markers, drag
  js/ui.js                   gate, list, form, trash, toasts
  js/main.js                 wiring
  supabase/schema.sql        tables, RLS, RPC functions
  supabase/set_group_code.sql  template to set the code hash
  tests/*.test.mjs           node:test unit tests
  tests/api_smoke.mjs        live RPC checks (needs config)
  .github/workflows/keepalive.yml
  README.md                  setup + sharing steps (Thai)
```

## Parcel shape (used by every task)

```js
// js/model.js
/** @typedef {{
 id:string, type:'house'|'land', name:string, price_baht:number|null,
 usable_sqm:number|null, floors:number|null, bedrooms:number|null, bathrooms:number|null,
 land_sqm:number|null, source_url:string, note:string, added_by:string,
 lat:number, lng:number, roof:string|null, facing:string|null,
 footprint_w:number|null, footprint_d:number|null,
 version:number, deleted_at:string|null, created_at:string }} Parcel */
```

---

### Task 1: Scaffold and units

**Files:**
- Create: `index.html`, `css/style.css`, `js/main.js` (placeholder that logs), `js/units.js`, `tests/units.test.mjs`, `package.json` (`{"type":"module"}` only, for node tests)

**Interfaces:**
- Produces: `toSqm(value:number, unit:'sqm'|'wah'|'rai') -> number`; `fromSqm(sqm:number, unit) -> number`; `formatArea(sqm:number|null) -> string` (Thai; picks ไร่-งาน-ตร.วา when ≥1600 ตร.ม., ตร.วา when ≥ 40 ตร.ม. for land display, else ตร.ม.; `null` → `"-"`).

- [ ] **Step 1: Write failing tests** in `tests/units.test.mjs`: `toSqm(1,'wah')===4`, `toSqm(1,'rai')===1600`, `toSqm(50,'sqm')===50`, `fromSqm(1600,'rai')===1`, `fromSqm(4,'wah')===1`, `formatArea(null)==='-'`, `formatArea(2400)` contains `ไร่` and `ตร.วา` (1 ไร่ 2 งาน), `formatArea(120)` contains `ตร.ม.`.
- [ ] **Step 2: Run** `node --test tests/` → FAIL (module missing).
- [ ] **Step 3: Implement** `js/units.js` per Interfaces. Keep conversion factors as named constants (`SQM_PER_WAH=4`, `SQM_PER_RAI=1600`).
- [ ] **Step 4: Run** `node --test tests/` → PASS.
- [ ] **Step 5: Scaffold** `index.html` (Thai `<html lang="th">`, viewport meta, Leaflet 1.9.4 CSS/JS from cdnjs, `<script type="module" src="js/main.js">`), a `#gate`, `#map`, `#list` and `#form` container, and `css/style.css` with a two-column layout that stacks below 720px. Verify with `web-verify-edge`: page loads at desktop and 390px width, no console errors.
- [ ] **Step 6: Commit** `git init` the HouseMap folder first if needed; message `feat: scaffold and units`.

---

### Task 2: Model, validation, filter/sort

**Files:**
- Create: `js/model.js`, `tests/model.test.mjs`

**Interfaces:**
- Consumes: `toSqm` from Task 1 (not required; model works in sqm).
- Produces:
  - `validateParcel(input: object) -> { ok:boolean, errors:Record<string,string>, value?:Parcel-without-server-fields }` — Thai error strings; blank/whitespace numeric → `null`; `name` required (1–120 chars); `type` in `house|land`; `price_baht` integer ≥ 0 or null; `usable_sqm`, `land_sqm` > 0 or null; `floors` integer 1–10 or null; `bedrooms`, `bathrooms` integer 0–30 or null; `lat` in [5.5, 20.5], `lng` in [97.3, 105.7] (Thailand bounds) and finite; `source_url` empty or `^https?://`; `roof`/`facing` null or in the enums; `added_by` 1–40 chars.
  - `filterSort(parcels: Parcel[], opts:{type?:'house'|'land'|'all', minPrice?:number, maxPrice?:number, query?:string, sortBy:'price'|'land'|'usable'|'created', dir:'asc'|'desc'}) -> Parcel[]` — excludes `deleted_at != null`; `query` matches name/note/added_by case-insensitively; null values always sort last regardless of `dir`; does not mutate input.

- [ ] **Step 1: Write failing tests** (`tests/model.test.mjs`): valid house passes; blank price → `null`; `"abc"` price → error on `price_baht`; price `-1` → error; bedrooms `0` ok; floors `0` error; lat `0`/`NaN` → error on `lat`; `source_url:'javascript:alert(1)'` → error, `'https://x.com/a'` ok, `''` ok; missing name → error; `filterSort` with three parcels (one `deleted_at` set, one null price) sorted by price asc puts null price last and desc also puts it last; `type:'land'` filter; `query:'ดอยสุเทพ'` matches note; input array unchanged.
- [ ] **Step 2: Run** `node --test tests/` → FAIL.
- [ ] **Step 3: Implement** both functions in `js/model.js`; export the enum arrays `ROOFS`, `FACINGS`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: parcel validation and filter/sort`.

---

### Task 3: Supabase schema, setup and API layer

**Files:**
- Create: `supabase/schema.sql`, `supabase/set_group_code.sql`, `js/config.js`, `js/api.js`, `tests/api_smoke.mjs`

**Interfaces:**
- Consumes: `Parcel` shape.
- Produces (SQL, all `security definer`, `set search_path = public, extensions`, `grant execute` to `anon`; tables have `enable row level security` and no policies; `revoke all` on tables from anon/authenticated):
  - `ping() returns text` — no code needed (keepalive).
  - `list_parcels(p_code text) returns setof parcels` — includes soft-deleted rows (client splits trash); raises `exception 'bad_code'` if hash mismatch.
  - `save_parcel(p_code text, p_parcel jsonb, p_expected_version int) returns parcels` — insert when `p_expected_version` is null (server sets `id` if absent, `version=1`); update only when stored `version = p_expected_version`, setting `version = version+1`; otherwise raises `exception 'conflict'`.
  - `set_deleted(p_code text, p_id uuid, p_deleted boolean, p_expected_version int) returns parcels` — soft delete/restore, same version rule.
  - Table `parcels` columns exactly the Parcel fields; table `app_secret(code_hash text)` single row; hash = `encode(digest(code,'sha256'),'hex')`.
- Produces (JS `js/api.js`): `class ApiError extends Error { code:'bad_code'|'conflict'|'network'|'other' }`; `listParcels(code) -> Promise<Parcel[]>`; `saveParcel(code, parcel, expectedVersion|null) -> Promise<Parcel>`; `setDeleted(code, id, deleted, expectedVersion) -> Promise<Parcel>`; `ping() -> Promise<void>`. Maps Postgres exception messages to `ApiError.code`; network failure → `'network'`.

- [ ] **Step 1: Guide the user through Supabase setup (they have only GitHub).** Walk them step by step, one message at a time, and wait for confirmation: sign in at supabase.com with GitHub → New project (free plan, region Singapore, save the DB password) → SQL Editor. Do not proceed until they have a project.
- [ ] **Step 2: Write `supabase/schema.sql`** per Interfaces (enable `pgcrypto`). Write `supabase/set_group_code.sql` as a template: `insert into app_secret ... digest('<รหัสกลุ่ม>','sha256')` with the placeholder in a comment telling the user to replace it and never commit the real code.
- [ ] **Step 3: User runs the SQL** (`schema.sql`, then `set_group_code.sql` with their chosen code) and copies Project URL + anon public key into `js/config.js` (export `SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- [ ] **Step 4: Write `tests/api_smoke.mjs`** (node, takes the real code from env `GROUP_CODE`, never from a file) asserting against the live project: `listParcels('wrong')` rejects with `code==='bad_code'`; `listParcels('')` rejects `bad_code`; saving a valid parcel with `null` expected version returns `version===1`; saving again with expected `1` returns `2`; saving again with expected `1` rejects `conflict` and the stored row still has the version-2 data; `setDeleted(...,true,2)` makes `deleted_at` non-null; restore sets it null; a direct REST read of the `parcels` table with the anon key returns no rows or 401/403 (RLS). Clean up its test rows by hard delete via the SQL Editor note printed at the end.
- [ ] **Step 5: Implement `js/api.js`** using `@supabase/supabase-js` 2.x imported from jsdelivr as an ES module with an exact pinned version; wrapper maps errors.
- [ ] **Step 6: Run** `GROUP_CODE=... node tests/api_smoke.mjs` → all assertions pass.
- [ ] **Step 7: Commit** `feat: supabase schema and api` (ensure `config.js` has only URL + anon key; confirm with grep that the group code appears nowhere in the folder).

---

### Task 4: Gate, map and list (read-only)

**Files:**
- Create: `js/mapview.js`, `js/ui.js` (gate + list part), update `js/main.js`, `index.html`, `css/style.css`

**Interfaces:**
- Consumes: `listParcels`, `ApiError`, `filterSort`, `formatArea`.
- Produces:
  - `mapview.js`: `initMap(el:HTMLElement) -> {setParcels(parcels:Parcel[]):void, focus(id:string):void, onMarkerClick(cb:(id:string)=>void):void, onMapClick(cb:(lat:number,lng:number)=>void):void, setDraft(lat:number,lng:number,onDrag:(lat:number,lng:number)=>void):void, clearDraft():void}` — house marker and land marker have different colours; popup shows name, price (฿ with thousands separators), area; attribution for OSM visible.
  - `ui.js`: `showGate(onSubmit:(code:string)=>Promise<void>):void` (shows Thai error on `bad_code`/`network`, remembers the code in `localStorage` key `housemap.code`, auto-enters if remembered and valid, "ออกจากระบบ" link clears it); `renderList(parcels, opts)` into `#list` with filter controls (type, min/max price, search, sort) driven by `filterSort`; clicking a row calls `focus`; empty state "ไม่พบรายการ"; reload button "รีโหลด".

- [ ] **Step 1: Implement** the pieces above; rows built with `textContent`/DOM nodes, never `innerHTML` with data.
- [ ] **Step 2: Insert two fake parcels via the SQL Editor** (one house, one land) and verify with `web-verify-edge`: gate rejects a wrong code with a Thai message and no data shown; correct code shows 2 pins + 2 rows; clicking a row pans to the pin; price filter hides the other; 390px width stacks map above list; no console errors.
- [ ] **Step 3: Commit** `feat: gate, map and list`.

---

### Task 5: Add / edit / drag pin / delete / trash

**Files:**
- Modify: `js/ui.js`, `js/main.js`, `css/style.css`, `index.html`

**Interfaces:**
- Consumes: `validateParcel`, `saveParcel`, `setDeleted`, `toSqm`/`fromSqm`, mapview API.
- Produces: form for all Goals fields (name, type, price, usable area + unit, land size + unit, floors, bedrooms, bathrooms, source link, note, added-by remembered in `localStorage` key `housemap.name`); clicking the map places a draft pin that can be dragged and fills lat/lng; editing an existing parcel loads it with its `version`; save → `validateParcel` → `saveParcel(code, value, version|null)`; on `ApiError.code==='conflict'` show "มีคนอื่นแก้รายการนี้ไปแล้ว" with a button to reload the latest and re-enter; delete asks `confirm()` then `setDeleted(true)`; "ถังขยะ" view lists deleted rows with restore; when `network` error occurs, show Thai banner and disable save/delete buttons (read-only).

- [ ] **Step 1: Implement** the form, draft pin flow, edit, delete, trash and conflict handling. Area unit selectors default to ตร.ม. for house usable area and ตร.วา for land size; values converted with `toSqm` before validation.
- [ ] **Step 2: Verify with `web-verify-edge`** (scripted through CDP/JS evaluation, two browser contexts A and B): A adds a house → B reloads and sees it; A and B open the same parcel, A saves, B saves → B sees the conflict message and A's data is intact; delete → disappears from list, appears in trash; restore → returns; entering `javascript:alert(1)` as source link shows a field error and nothing is saved; blank price saves and sorts last; with the Supabase URL blocked, the banner shows and save is disabled.
- [ ] **Step 3: Commit** `feat: add, edit, delete and trash`.

---

### Task 6: Export and import JSON

**Files:**
- Create: `js/importer.js`, `tests/importer.test.mjs`
- Modify: `js/ui.js`, `index.html`

**Interfaces:**
- Consumes: `validateParcel`, `saveParcel`, current `Parcel[]`.
- Produces: `exportJson(parcels: Parcel[]) -> string` (pretty JSON `{ "app":"housemap", "version":1, "exported_at": ISO, "parcels":[...] }`, includes soft-deleted rows); `planImport(text:string, existing:Parcel[]) -> { error?:string, toAdd:Parcel[], skipped:{id:string,reason:string}[], invalid:{index:number,errors:Record<string,string>}[] }` (pure: not JSON or wrong `app` → `error`; ids already in `existing` → `skipped`; items failing `validateParcel` → `invalid`).
- UI: buttons "ส่งออก JSON" (downloads `housemap-YYYY-MM-DD.json`) and "นำเข้า JSON" (file picker → shows summary "เพิ่ม N / ข้าม M / ผิดพลาด K" → confirm → saves each of `toAdd` via `saveParcel(code, p, null)` keeping the original id, then reloads).

- [ ] **Step 1: Write failing tests** (`tests/importer.test.mjs`): round trip `planImport(exportJson(list), [])` returns all items in `toAdd`; same list with existing containing one id → one in `skipped`; `planImport('not json', [])` → `error`; JSON of another app → `error`; an item with bad lat → `invalid` with index and not in `toAdd`; empty `parcels` → empty arrays, no error.
- [ ] **Step 2: Run** `node --test tests/` → FAIL.
- [ ] **Step 3: Implement** `exportJson`, `planImport`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Wire UI and verify** with `web-verify-edge`: export then import into the same DB reports all skipped and adds nothing; cancel at confirm adds nothing.
- [ ] **Step 6: Commit** `feat: json export/import`.

---

### Task 7: Keepalive, GitHub Pages deploy, friend README

**Files:**
- Create: `.github/workflows/keepalive.yml`, `README.md`

**Interfaces:**
- Consumes: `ping()` RPC from Task 3.

- [ ] **Step 1: Write `keepalive.yml`**: schedule daily (`cron: '17 3 * * *'`) plus `workflow_dispatch`; one `curl -fsS -X POST "$SUPABASE_URL/rest/v1/rpc/ping" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{}'` step; URL and anon key read from repository secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- [ ] **Step 2: Write Thai `README.md`**: what the site is, how a friend opens it and enters the group code, how to export a backup, warning that the group code is not real security and no personal data should be entered.
- [ ] **Step 3: Publish** (confirm repo name and visibility with the user first — must be public for free Pages): create the GitHub repo under their account, push, add the two secrets, enable Pages from `main` root, run the keepalive workflow once manually and confirm it succeeds.
- [ ] **Step 4: Verify the live URL** with `web-verify-edge` at desktop and 390px: gate → add parcel → visible from a second browser context; no console errors.
- [ ] **Step 5: Commit/tag** `feat: keepalive and deploy`; give the user the link and code-sharing instructions (send the code to friends privately, not in the repo).
- [ ] **Step 6: Run `/code-review high`** on the whole project before declaring done (user's standing rule), fix findings, then record the project in memory.

---

## Self-Review

- **Spec coverage:** map + pins (T4/T5), all form fields (T5), list filter/sort (T2/T4), shared DB with group code and hash (T3), JSON export/import additive (T6), GitHub Pages (T7), reserved roof/facing/footprint fields (T3 schema, T2 validation), conflict/soft-delete/read-only/keepalive/units (T3, T5, T7, T1). Next-phase features intentionally absent.
- **Type consistency:** `Parcel` field names are identical across schema, `validateParcel`, `api.js`, `importer.js`; `ApiError.code` values match those handled in `ui.js`.
- **Proportion:** logic is specified as signatures + test assertions; only the SQL contract and ping command are given in detail because they must match across files.
