# AGENTS.md — Management Dashboard (Yektanet Pulse)

Guide for any AI coding tool (Codex, Claude, Cursor, Copilot…) or developer picking up this repo.
Read this first, then read the code you are about to change. `index.html` on `main` is always the
source of truth; this file is a map. The longer Persian history with every decision and number check
is `docs/dashboard-handoff.md`.

Last updated: 8 Nov 2026.

---

## 0. The ten rules that matter most

1. **The site deploys from `main` on Vercel.** Every push to `main` goes live. Run `git fetch origin main`
   before you start and before you push: the owner (Erfan) sometimes uploads files (logos) straight to
   `main` from the GitHub web UI.
2. **After every push, check the Production deploy really succeeded** (section 9). It has failed silently
   before while the site kept the old version.
3. **`index.html` and `report.html` are two copies of the same engine.** `report.html` is a full fork made
   on 25 Oct. A business rule, project change or bug fix that should appear in the weekly report must be
   made in **both** files. `slides.html` is *not* a copy: it loads `index.html?core` in a hidden iframe and
   reuses its engine, so it picks up `index.html` changes automatically.
4. **Never count today.** Rows dated today or later are dropped on load; the newest day is yesterday.
5. **Totals are combined rates, never averages of row rates.** CPA = total cost ÷ total conversions.
6. **Light theme only. No black backgrounds anywhere.** Cream page, white cards, brand colour accents.
7. **The UI is Persian (RTL).** Wrap signed numbers / mixed Latin–Persian numbers in `<bdi dir="ltr">`
   (`fmtSigned`). Never render Persian text in the mono font.
8. **Test with real numbers before deploying.** Compute the expected totals independently (Python on the
   sheet) and compare them number by number with what the page shows. Check desktop (~1400px) and
   mobile (~375–390px), and no console errors.
9. **Update the docs in the same commit** as any behaviour change: this file (key points) and
   `docs/dashboard-handoff.md` (detailed Persian log + history line). Small cosmetic fixes don't need it.
10. **Reply to Erfan in the language he writes in** (Persian or English). He wants the result live: test,
    then deploy straight to `main`, then confirm.

---

## 1. What this is

A private, multi-client marketing-performance dashboard for the ad agency team (Yektanet). Each client
("project") has one or more Google Sheets filled daily by a separate data pipeline (Metabase/Yektanet
exports, Adtrace, AppMetrica, Metrix, GA4 via Looker). The dashboard joins **cost** (what was spent on
Yektanet) with **conversions** (installs, KYC, leads, purchases, sessions… from the tracker) per
**Date + Campaign**, and shows cost, conversions, CPA, trends, campaign tables and analysis.

| Item | Value |
|---|---|
| Repo | `erfanhamedi7-marketer/yektanet-pulse-dashboard` (public) |
| Live site | `https://yektanet-pulse-dashboard.vercel.app` (Vercel team scope `erfan-s`) |
| Pages | `/` = `index.html` (main dashboard), `/report.html` (weekly report, PDF/HTML export), `/slides.html` (weekly slide deck for clients) |
| Stack | Static HTML + vanilla JS (no build step, no framework). Chart.js 4.4.1 from cdnjs. Fonts: Vazirmatn + IBM Plex Mono (Google Fonts). Vercel serverless functions in `api/` (Node, `google-auth-library`). |
| Language / direction | Persian, RTL |
| Data access | Google Sheets API v4 through a service account (`data-entry-automation@data-entry-506107.iam.gserviceaccount.com`) |

---

## 2. Repository map

| Path | What it is |
|---|---|
| `index.html` | The whole dashboard: CSS + one big `<script>` (~5,700 lines). Project config, data loading, join, rendering. |
| `report.html` | Fork of `index.html` titled "Weekly Report": same sections plus PDF/HTML export, cover page and a notes box. Keep in sync by hand. |
| `slides.html` | Weekly slide deck (PowerPoint-like, 1280×720 slides), per-client settings, editable text, templates, merged reports, PDF/HTML export. Uses `index.html?core` as its data engine. |
| `auth.js` | Login form shown before any page starts; exposes `window.dashAuth.ready()`. |
| `api/sheet-data.js` | `GET /api/sheet-data?spreadsheetId=…&sheet=…[&sheet=…]` → reads sheets (read-only scope). Has the `ALLOWED_SPREADSHEETS` whitelist. |
| `api/store.js` | Shared storage for slide-deck settings/edits in a Google Sheet (read/write scope). |
| `api/_auth.js` | Shared login/session logic (files starting with `_` are not endpoints on Vercel). |
| `api/login.js`, `api/logout.js`, `api/me.js` | Login endpoints. |
| `*.png`, `*.jpg`, `*.svg` (root) | Client logos and favicons, referenced as `/Firouzeh%20Logo.jpg` etc. |
| `docs/dashboard-handoff.md` | Detailed Persian handoff and history (source of the business decisions). |
| `CLAUDE.md` | Short instructions for Claude (keep the handoff updated, deploy routine). |
| `.claude/skills/` | `sheet-dashboard` (builds a standalone HTML dashboard from a sheet; its template is an old Sept version) and `impeccable` (UI design audit skill). Not part of the site. |
| `.vercelignore` | Keeps `docs/`, `CLAUDE.md`, `AGENTS.md`, `.claude/` off the public site. |

---

## 3. Data flow and architecture (`index.html`)

### 3.1 Reading sheets
- Browser calls `/api/sheet-data`. One request can carry several tabs of the same spreadsheet
  (`&sheet=A&sheet=B` → `{sheets:{A:{headers,rows},B:{…}}}`); one tab → `{headers, rows}`. Rows are arrays,
  fully empty rows dropped. The server uses `values:batchGet`, `valueRenderOption=UNFORMATTED_VALUE`, range `A:Z`.
- `fetchSheetData` batches tab requests per spreadsheet in the same tick (`sheetQueue`/`flushSheetQueue`);
  `fetchSheetCached` memoises per page load.
- **Quota:** 60 read requests/minute for the service account, shared with the slide store. A page load is
  ~19 requests. The API retries 429 twice, then returns `{code:'quota'}` (the section shows "Google Sheets quota
  full — refresh"). It also keeps a 2-minute in-memory memo per warm instance and serves the previous copy for
  up to 24h on quota errors. Browser cache: `Cache-Control: private, max-age=120` (no edge cache — it would
  leak data to logged-out users).
- **Adding a sheet** requires (1) a project object in `ALL_PROJECTS` (`index.html`, and `report.html` if the
  weekly report should have it), (2) the spreadsheet id in `ALLOWED_SPREADSHEETS`, (3) the sheet shared with the
  service account email (Erfan does this; you can't check it from code).

### 3.2 Login (since 26 Oct)
- All three pages load `/auth.js` first; the page stays hidden until `/api/me` confirms a session.
- Accounts: Vercel env var `DASHBOARD_USERS` = `user:pass,user2:pass2`. **Without it nobody can log in**
  (fail-closed, 503). Session cookie `md_session` (HttpOnly, Secure, SameSite=Lax, 30 days), HMAC-signed with
  `AUTH_SECRET` (or a key derived from `GOOGLE_PRIVATE_KEY`).
- Data is locked server-side (`/api/sheet-data` returns 401 without a session). The HTML/JS itself is still
  publicly readable.
- Other env vars: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, optional `STORE_SPREADSHEET_ID`.
- **Never type or store real passwords** in code, tests or docs.

### 3.3 Projects, tabs and sections
- `ALL_PROJECTS` (array) → `PROJECTS = ALL_PROJECTS.filter(p => !p.hidden)`. Generator functions build some
  of them: `snappSections()`, `arzplusSections()` (+ `webSection`, `ramzarzSection()`),
  `yektanetExportSections()` (Firouzeh / Tara / Technopay, + `taraAppSection()`), `talaseaSections()` (+ `talaseaAppSection`).
- Projects sharing a `group` sit under one top tab (`groupTitle`) with sub-tabs (`partTitle`); a single project
  uses `tabTitle`.
- Tab order: شهر لوازم خانگی، اسنپ، طلاین، ویپاد، بلو، بانکینو، ارزپلاس، فیروزه، تارا، تکنوپی، طلاسی، آگاه.
- Section kinds: normal (`updateSection`), `kind:'budget'` (Snapp, `updateBudgetSection`), `kind:'cpi'`
  (Ramzarz News, Talasea/Noghresea apps, `updateCpiSection`).
- **Only the visible section is drawn.** `updateSection` marks hidden sections `stale`; `switchTab` calls
  `drawSection` when a section opens. Never assume a closed section's DOM is up to date. Tests must click
  each tab/sub-tab before reading a section.

### 3.4 The join (normal sections)
1. `loadProject` fetches the reference (conversion) tab(s) `refSheet` and the cost tab `costSheet`.
2. `rowFilter(rawRow)` drops raw rows first (both sides).
3. `normalizeRefRows` / `normalizeCostRows`: campaign → `normCampaign` (trim + lowercase), date → `normDate`
   (`YYYYMMDD`; accepts `2026-10-17`, `2026/9/26`, `M/D/YYYY`, Sheets serials, Persian digits). Numbers via
   `toNumber` (Persian digits, separators, `IRT` suffixes, scientific notation, `(1,234)` negatives).
4. Optional `campaignKey` folds differently spelled campaigns into one key on both sides.
5. `excludeCampaign`, `refCampaignsFromCost`, `hideZeroConversionCampaigns` narrow the campaigns.
6. Today and future rows are dropped.
7. Per filter change, `computeSection` filters by date range + campaign filters, aggregates both sides per
   `date||campaign` (`aggregateRef`, `aggregateCost`), and `buildJoinedRows` joins them. Without
   `includeUnmatchedCost` only keys present in the reference side count (cost of a day with no conversion row
   is ignored); with it, the union counts. Each joined row carries `hasRef` / `hasCost`.

### 3.5 Filters
- Multi-select dropdowns with search (`filterSlots`, `renderCampaignDropdown`). Lists follow the other filters
  (`slotScope` / `scopedOptions`): only campaigns with data in the date range, sorted by spend in the range.
  Selections are kept against the full `universe` of options.
- Budget sections (Snapp) and projects with `campaignNameCol` (Firouzeh) have **two filters, Campaign Name and
  Campaign**, that narrow each other. `campaignFilter(project)` is the one predicate that applies both — use it
  wherever rows are filtered by campaign.
- Campaign / Adgroup / Creative names in tables are clickable filters; Adgroup/Creative filters split a campaign's
  daily cost by that day's installs (`applySegFilter`).
- Date presets: کل بازه | دیروز | از شنبه | هفته قبل | ۷ روز اخیر | ۳۰ روز اخیر. «هفته قبل» = last full
  **Saturday–Friday** week before today, by calendar (`lastWeekWithin`), clipped to the sheet's days. Dates
  are built with local time (`localIso`), never `toISOString()`.

### 3.6 Rendering
- KPI cards (`renderKpiCards`): bold, fixed size (32px desktop, 26px mobile), abbreviated if too wide
  (`1.01B`), delta chip vs the previous equal-length period, sparkline. **Cards are the chart's metric
  picker** (`renderMetricChart` / `toggleChartMetric`): up to 4 series; costs are bars on a shared axis.
- Campaign table (`computeCampaignCpaTable` / `renderCampaignCpaTable`): 12 rows + "show all", total row over
  all campaigns, CPA all-range and last 7 days, vs-average, plus columns from `costPerMetrics` /
  `costExtraCols` / `compareConversion` / `dealPrice`. A campaign with no cost shows «بدون هزینه», never a CPA
  of 0. A campaign with only extra counts (e.g. sessions but no cost/conversion) is still listed.
- Deep analysis: campaign CPA table, cost-change drivers, notable daily CPA changes, Adgroup/Creative CPA tables.
- Client message card («متن گزارش برای مشتری», `buildClientMessage`, `messageSpec`, `messageFields`,
  `messageRows`): Persian template Erfan sends on Telegram; numbers bold (`**n**` when copied). Collapsed by
  default. Only on `index.html`.
- "?" hints next to titles (`syncHints` / `showHint`) instead of visible descriptions.

### 3.7 Project options (keys of a project object)

| Option | Meaning |
|---|---|
| `id`, `title`, `tabTitle`, `group`, `groupTitle`, `partTitle`, `subtitle` | Identity and tab placement |
| `spreadsheetId` | Sheet id (must be in `ALLOWED_SPREADSHEETS`) |
| `refSheet` | Conversion tab name, or array of `{sheet, conversionCol, keep, from, before}` (`from`/`before` = YYYYMMDD stretch for that tab) |
| `refCampaignCol` | Campaign column of the reference tab (default `Campaign`; Agah `Ad Term`) |
| `costSheet`, `costCol`, `costLabel` | Cost tab, cost column (default `Cost`), display label |
| `conversionCol`, `conversionLabel`, `cpaLabel` | Main conversion and labels |
| `showInstalls`, `installsCol`, `installsLabel` | Second count column (installs or sessions) |
| `impressionsCol`, `clicksCol`, `adgroupCol`, `creativeCol` | Column names (some sheets use plural `Impressions`/`Clicks`) |
| `costPerMetrics` | Extra reference columns: `{col, label, sinceFirst, campaignTable, countCard, noRate, inMessage}` → "cost per X" card, optional count card, table columns, client-message lines |
| `costExtraCols` | Extra columns read from the **cost** tab (Talaeen KYC): `{col, label, convRate}` |
| `compareConversion` | Same conversion from a second source for comparison: `{sheet, col, source, ownSource, campaignCol}` |
| `dealPrice` | Fixed price per conversion (Talaeen CPA, 250,000): Cost = conversions × price, profit card |
| `includeUnmatchedCost` | Count cost on days/campaigns with no conversion row (and vice versa) |
| `refCampaignsFromCost` | Reference rows count only if their campaign appears in the cost tab |
| `hideZeroConversionCampaigns` | Hide campaigns with zero main conversion in the range (Agah) |
| `excludeCampaign(key, ctx)` | Drop campaigns on both sides (`yektanetExportSections` parts use `keep`) |
| `rowFilter(rawRow)` | Drop raw rows before anything (e.g. `advertiserIs('65519')`, Firouzeh's `Date >= 20261028`) |
| `campaignKey(key)` | Map spellings to one key before the join (Talasea apps: `talaseaAppKey`) |
| `campaignNameCol` | Reference column grouping campaigns (Firouzeh's GA4 `Campaign Name`) → second filter, `readCampaignNames`, `campaignNameOf`. Campaigns the reference never names fall under `Other`. |
| `unmatchedGroups`, `refSourceLabel` | Campaign table lists campaigns in three blocks: both sources, cost only, reference only, with badges naming the source (`'GA4'`) |
| `defaultCampaigns` | Default campaign selection by exact name (budget sections: Campaign Names). Unknown names are silently ignored. |
| `ownDateFilter`, `defaultRangeDays` | Section-level date filter (default 30 days) |
| `hideDeepAnalysis`, `hideSegmentAnalysis` | Hide analysis card / Adgroup–Creative tables |
| `dimensionTables`, `sessionsCompare` | Source/Term/Content tables; session comparison with a GA4 tab |
| `cpiGroups` | CPI sections' groups `{id, title, sub, prefix | notPrefix, campaignTable, creativeTable}` |
| `messageHide`, `messageSessionCost`, `messageActionLabel`, `messageGroupBy` | Client-message tweaks |
| `logo`, `logoWide`, `theme` (`BRANDS.x`), `hidden` | Look and visibility |
| `extra` (only inside `yektanetExportSections` parts) | Object spread last onto the section to override defaults (Firouzeh) |

---

## 4. Projects and business rules (current state)

Sheet ids are in the code; the main ones are repeated here for orientation.

- **شهر لوازم خانگی** `appliance-city` — sheet `1sjDcBvUZh…`. Tab `Yektanet - Export` is both cost and
  conversion; conversion `Lead`, "installs" = `Sessions`. Only campaigns containing `-prf`. Session comparison
  with `Data Studio - GA4`.
- **اسنپ** group `snapp` (`kind:'budget'`): اسنپ‌پی `1dgyCKN89…`, اسنپ‌کب `1u3kf4Cx…`, اسنپ‌بیمه `1SUcOo8o…`,
  اسنپ‌باکس `1wkhar01…` (added 3 Nov). Tabs `Blend Data` (Date, Campaign, Campaign Name, Sessions, Impression,
  Click, `Cost R` real, `Cost` declared) and `Budgeting` (Total Budget, Spent, Remaining, Spent (Panel), Profit,
  Campaign Name). Daily profit = declared cost still inside the campaign budget − real cost. Defaults:
  Snapp Pay `Merchant Aban 405`, `Cashback Aban 405`; Snapp Cab `Snapp City - Oct 2026`, `Nov 2026`,
  `Box - Nov 2026`; Snapp Bimeh `Campaign October 2026`; Snapp Box none. Snapp Pay's client message groups by
  Campaign Name.
- **طلاین** group `talaeen` — sheet `1r9f3Vdl…`, five parts: overview, app (Adtrace KYC), web
  (`Web - Campaign` Verified before 23 Oct, `Web - Total` KYC from 23 Oct; KYC from `Cost - Yektanet` as
  `costExtraCols`), wheel (`wheel-sp`), CPA (`talaeen-cpa`: KYC from `Web - Total` for `cpa-*` campaigns,
  cost = `Panel Cost` from `CPA Panel`, `dealPrice: 250000`, profit = Cost − Panel Cost; **not yet verified on
  real data** — compare with the `CPA - Profit` tab the first time).
- **ویپاد** `wepod` — `Wepod - Metrix` (`v2_national`) × `Wepod - Yektanet`; `sign_up` as `costPerMetrics`
  (`sinceFirst`, count card, in client message).
- **بلو** group `blue`: Blue (`Card Order`; all campaigns except `biz-*`, `bj*`, `inapp-cpc-shareit`,
  `lba-bazar`; `includeUnmatchedCost`), Blue Business (`biz-*`), Blue Junior (separate sheet `1zBI8XWT…`,
  `Add Child`, `includeUnmatchedCost`).
- **بانکینو** `bankino` — `Bankino - Metrix` (`Open Account`) × `Bankino - Yektanet`.
- **ارزپلاس** group `arzplus` (7 parts): Arzplus and Tochal app / Cafe Bazaar / web, plus Ramzarz News (CPI).
  Main conversion Purchase (Deposit (Web) for Arzplus web). App parts split by campaign prefix (`inap`; cafe
  `yn-c`/`cb-` or `cafe-`/`cb-`). Web parts filter rows by Advertiser ID (`65519` Arzplus, `1287236` Tochal).
  Tab names are exact: `Arzplus- Yektanet`, `Ramzarz- Yektanet` (no space before the dash), `Tocal`.
- **فیروزه** `firouzeh` (rebuilt 4 Nov) — sheet `10hRbyK0…`. Cost from `Yektanet - Export`; Sessions,
  Engaged sessions and **Form OTP** (main conversion) from `GA4 - Daily Report`, joined on Date + Campaign
  (several GA4 source/medium rows per key are summed). Only from 28 Oct (`rowFilter` on both tabs). All
  campaigns, `includeUnmatchedCost`. Cards: cost, Form OTP, sessions, cost per Form OTP, **cost per session**
  (a main metric), engaged sessions and cost per engaged session. Two filters: Campaign Name (`400m`, `Sahel`,
  `Other`) and Campaign. Many non-sahel campaigns are named differently in GA4 and Yektanet
  (`rtg_movafaghiat` vs `Native-RTG_Movafaghiat`, `rub-pin` vs `rub-pin-cl`); **Erfan wants them shown
  separately, not mapped** — `unmatchedGroups` lists "cost only" and "GA4 only" blocks.
- **تارا** group `tara`: Tara (`Yektanet - Export`, `Lead`, all except `inapp-cpi*`) and Tara App (`Tara - App
  Metrica` Sign Up × cost, only `inapp-cpi*`, CPI card).
- **تکنوپی** `technopay` — `Validation` main, cost per `Lead`; GA4 `Validation` comparison (`compareConversion`).
- **طلاسی** group `talasea` — web tabs `Talasea - Web`, `Noghresea - Web`, `Meschi - Web` (KYC), and app parts
  (`kind:'cpi'`, Metrix installs × App cost, joined per campaign since 31 Oct, `campaignKey` for two spellings).
- **آگاه** `agah` — cost from `Yektanet - Export`; GA4 `GA4 - Export` with campaign in `Ad Term`; main
  conversion Sessions ("cost per session"), CTA Click count + cost per. **Ad clicks and STC are removed on
  purpose — don't add them back.** Campaigns with no GA4 session in the range are hidden.

---

## 5. `report.html` (weekly report)

- Fork of `index.html` with title "Weekly Report", PDF and HTML export buttons per section, a cover page
  (logo, title, Jalali + Gregorian range, campaign filter, date) and a notes card (saved in `localStorage`).
- **Erfan's rule: the export must look exactly like the dashboard section.** It clones the open section with
  the page CSS, turns charts into PNGs, removes filters/buttons/hints/collapsed cards. PDF = hidden iframe
  1062px wide + `print()` (A4 landscape, desktop layout).
- In `report.html` (and in `slides.html` core mode) `loadProject` forces `includeUnmatchedCost = true` and
  `hideZeroConversionCampaigns = false` for non-budget sections: weekly reports count all cost and data
  (Erfan, 2 Nov). The main dashboard keeps each section's own rule.
- No client-message card here.

---

## 6. `slides.html` (weekly slide deck)

### 6.1 Engine and data
- Hidden iframe `/index.html?core`. In core mode (`CORE_MODE`, defined at the top of the `index.html` script)
  `index.html` skips `init` and exposes `window.dashCore`: `PROJECTS, BRANDS, projectState, loadProject,
  messageRows, messageFields, messageSpec, campaignTypes, campaignTypeGroup, lastWeekWithin, yesterdayWithin,
  weekStartFor, localIso, toInputDate, fromInputDate, todayStr, normCampaign, campaignNameOf`.
  **This object is a contract — renaming any of these breaks slides.**
- Core mode also changes `loadProject`: non-budget sections get `includeUnmatchedCost = true` and
  `hideZeroConversionCampaigns = false` (weekly reports count everything), and every extra **number column** of
  the reference and cost tabs is kept (`numberColumns`, `NOT_METRICS`) → `project.extraMetricCols = {ref, cost}`.
  Outside core mode the dashboard reads exactly what it did before.
- Rows: `rowsFor(R, win, sel, only)` sets `core.projectState[part.id]` and calls `core.messageRows(part, win)`
  for each part. `messageRows` must keep returning `date, campaign, campaignLabel, cost, impressions, clicks,
  sessions, installs, action, extras, costExtras` (budget rows: `campaignName`, `sessions`). The slides add
  `x` (extra columns), `part`, `partTitle`, `raw`, `cname` (Campaign Name key) and prefix `campaign` for
  merged reports.
- A "report" object: `{id, title, logo, theme, parts:[project…], merged, def}`. A single section is a report
  with one part. Merged reports (`slides:merges` = `[{id:'merge-…', title, parts:[ids]}]`) key campaigns as
  `partId::campaign` (`pkey`, `splitKey`); same-named extra columns are summed; the main action is the sum of
  each part's action.
- `computeData(R, sel, only, per)` → `{win, prev, days, rows, prevRows, excluded, t, pt}`; the previous period is
  the same length right before; excluded days are removed from both sides (the previous side drops the same day
  minus the period length). `dataFor(slide)` caches per (campaigns, parts, period) key in `S.cache`;
  `saveCfg()` clears the cache.

### 6.2 Metrics and dimensions
- `metricDefs(R)`: cost, impressions, clicks, ctr, sessions, cps, stc, installs, cpi, actions, cpa, costShare,
  plus `x:<col>` (count) and `xc:<col>` (cost per) for every extra column (`extraCols`). Availability comes from
  `core.messageFields` (`hasOf`). Labels can be renamed per report (`cfg.metricLabels`); a cost-per label
  follows its count's new name unless renamed itself.
- `metricValue(id, totals, all)` computes everything from summed totals (combined rates, never row averages).
- Dimensions (`dimDefs`): day, week (Saturday start), campaign, Campaign Name (budget parts or
  `campaignNameCol` parts), medium, part (merged only), campaign group (when groups exist). The old `type` dimension/level maps to medium.
- **Medium = «نوع کمپین»** of a campaign: `cfg.mediums[key]` (typed in settings) → else the sheet's
  `Campaign Type` folded by `campaignTypeGroup` → else `guessMedium(name)` (inapp, push, sms, vid, bnr,
  native, cafe/cb…) → else «سایر». Only Firouzeh/Tara/Technopay/Agah sheets have `Campaign Type`.

### 6.3 Slides
- Types: `cover`, `campaigns` (campaign-type tiles, no numbers; `level` medium | campaign), `kpis` (cards;
  up to 8 normal, 9–10 five columns, 11+ three compact rows), `chart` (`combo | bar | hbar | line | doughnut`,
  first two metrics), `table` (dimension + metric columns, `maxRows`, optional `typeCol` for campaign tables,
  zoomed down to fit), `text` (1–3 columns; default analysis = `analysisDraft`, a comparison with the previous
  period, and an empty «اقدامات پیش رو»), `section` (separator: title only).
- Default deck (`defaultSlides`): cover, campaigns, kpis, chart1 (daily cost + main action), chart2 (by medium),
  mediums table, analysis.
- Per slide (all optional): `metrics` (order = card/column order), `dim`, `chart`, `maxRows`, `typeCol`,
  `level`, `tileOrder`, `campaigns` (own pick; Campaign Name ticks shown for `campaignNameCol` parts),
  `parts` (merged reports), `period` (own preset/custom/excluded days), `cols`, `on`.
- **Slide groups** (`cfg.slideGroups = [{id, name, campaigns?, parts?, period?}]`, card «گروه‌های اسلاید»; a slide
  joins with `slide.group`). A group's campaigns/parts/period apply to all its slides; a slide's own setting wins
  (`effectiveOf(slide)` → used by `dataFor`, `slideParts`). «کپی گروه» clones every member slide (settings +
  `cfg.tpl` text) into a new group placed right after the original's last slide. New ids use `uid()` (time +
  random) — `Date.now()` alone collided when two ids were made in the same millisecond.
- **Campaign groups** (`cfg.groups = [{id, name, campaigns:[keys]}]`, card «گروه‌های کمپین» in settings): each
  group is a one-tick shortcut in the report's campaign list (`data-rgroup`) and in each slide's own pick
  (`data-sgroup`), and the «گروه کمپین» dimension (`cgroup`, `groupOf`: first group containing the campaign,
  else «بدون گروه»).
- Report settings (`cfg`, key `slides:cfg:<reportId>`): `period {preset, from, to, exclude[]}`, `compare`,
  `campaigns` (null = all or the section's `defaultCampaigns`), `title`, `kicker`, `logo` (data URL),
  `theme` (null = brand, or `{preset, accent, second}`), `mediums`, `groups`, `metricLabels`, `slides[]`, `tpl`
  (template text per slide), `tplSavedAt`.
- Editing: every text node with `data-k` is `contenteditable` in edit mode; edits are saved per period
  (`slides:edits:<id>:<from>-<to>`). «ذخیره قالب» moves text edits into `cfg.tpl`; numbers (`c:<row>:<metric>`,
  `v:`, `d:`) stay per period, and **dates never go into a template** (`isDateKey`: slide `kicker`, cover
  `period` and `foot`; old saved dates are ignored when applied). «پیش‌فرض» on a slide resets its settings and
  text (`resetSlide`). Table rows can be hidden (`hide:<rowKey>`).
- Drag handles (pointer events on `document`, never `setPointerCapture`): KPI cards and campaign tiles, table
  columns, whole slides in the deck (the deck folds while dragging; hidden slides keep their place) and in the
  settings list.
- Presentation mode and exports use `snapshot()` (charts → PNG, edit controls removed). PDF = `#printDeck` +
  `window.print()` with `@page {size:1280px 720px}`. HTML = standalone file with `#slideCss`. File name
  (`fileBase`): «گزارش کمپین <report title> - 2 تا 8 آبان» (Latin day numbers, Persian month, no year).

### 6.4 Storage (shared between browsers)
- `localStorage` is the page's working copy; every `store.set/del` of a `slides:` key is queued for the server
  (`api/store.js`, one POST 2.5 s after the last change; «ذخیره قالب» sends at once). Server keys:
  `<report>|cfg`, `<report>|edits|<from>-<to>`, `_|merges`. Opening a report pulls `<report>|` (server copy wins).
- `slides:pending` remembers keys not yet confirmed; they win over the server copy on the next load (a reload
  within 2.5 s, or the keepalive send on unload failing for bodies > 64 KB, used to lose changes).
- `slides:synced`: a prefix synced once; afterwards a key missing on the server is treated as deleted.
- `api/store.js` writes to the first tab of `STORE_SPREADSHEET_ID` (one row per key: key, time, user, JSON in
  45,000-char pieces in D…Z). Without the id it answers 503 `no_store` and the page works locally only
  (status pill: «ذخیره‌ی مشترک هنوز وصل نشده»).

### 6.5 Layout rules
- Slides are always 1280×720, scaled with `transform: scale(--k)`. Charts use `responsive:false` with the
  canvas sized from the 1280 layout (Chart.js measures the scaled box otherwise). Center with flex, not
  `translate`: print pagination uses the untransformed position. Text that doesn't fit is stepped down
  (`fitSlideText`); tables use CSS `zoom`.

## 7. Design rules (Erfan's taste)

- Light theme, cream background tinted by the open project's brand colour, white cards with 24px radius,
  pill-shaped project bar, active tab = white pill with a brand-colour dot. **Never a black background.**
- Brand colours live in `BRANDS` (`brandTheme(accent, ink, accent2, softAlpha, grad)`); light colours get a
  darker "ink" for text. Titles don't contain the word «پروژه».
- No text below 11px; `--text-faint` is `#6B6E7C` (contrast ≥ 4.5). Respect `prefers-reduced-motion`.
- Mobile (≤640px): tabs scroll horizontally, cards two per row, tables scroll with a sticky name column,
  dropdowns full width.
- After any visual change, check desktop and mobile screenshots.

---

## 8. Known traps

- `[hidden]` doesn't hide an element that has `display:flex` in CSS — add an explicit `X[hidden]{display:none}`.
- `renderKpiCards` writes the column count inline, so mobile media queries need `!important`.
- Mixed Persian/Latin with `%` or signs scrambles order: use `<bdi dir="ltr">` / `fmtSigned`. IBM Plex Mono has
  no Persian glyphs (`--font-mono` falls back to Vazirmatn) — still don't put Persian text in mono.
- Impressions/clicks column names differ between sheets (`Impression` vs `Impressions`).
- Without `includeUnmatchedCost`, the campaign filter only lists campaigns on the conversion side, and cost
  counts only on days with a conversion row.
- A campaign name spelled differently in the two tabs never joins (check with a quick script before blaming
  the code). Fixes are `campaignKey` (mapping) or `unmatchedGroups` (show separately) — ask Erfan which.
- The slides' `route()` creates a new report object each time; it keeps the previous one when it's the same
  report (it carries `minDate`/`maxDate`), otherwise settings render blank.
- Drag-and-drop in slides uses pointer events on `document`; `setPointerCapture` breaks when the dragged node
  moves in the DOM.
- Settings re-render on most changes (`rerender` keeps open panels and scroll). Listeners are attached to the
  freshly rendered `.set-grid`, never to `#view`, or they pile up.
- An inline Python/heredoc containing `$$(` can trip some shells' safety checks; write patch scripts to a file.
- Charts are created through `makeChart`; `fmtNum` caches `Intl.NumberFormat` (don't call `toLocaleString`
  in loops).

---

## 9. Testing and deploying

### 9.1 Local test with real data (no production login needed)
The live API needs a session, so test locally with a tiny server that serves the repo and answers `/api/me`
and `/api/sheet-data` from the real sheet through the service account (`service_account.json` lives outside the
repo, in Erfan's `Documents\Process-Automation` folder — never commit it). Keep this script **outside** the repo:

```python
# serve_test.py — run: python -X utf8 serve_test.py, then open http://127.0.0.1:8765/
import http.server, json, urllib.parse, gspread
ROOT = r"PATH\TO\yektanet-pulse-dashboard"
REAL = "<spreadsheetId to test>"        # other sheets come back empty
gc = gspread.service_account(filename=r"PATH\TO\service_account.json")
book, cache = gc.open_by_key(REAL), {}
def compact(v):
    if not v: return {"headers": [], "rows": []}
    h, rows = v[0], [r for r in v[1:] if any(x not in ("", None) for x in r)]
    return {"headers": h, "rows": [[r[i] if i < len(r) else "" for i in range(len(h))] for r in rows]}
def tab(sid, name):
    if sid != REAL: return {"headers": [], "rows": []}
    if name not in cache:
        cache[name] = compact(book.worksheet(name).get("A:Z", value_render_option="UNFORMATTED_VALUE"))
    return cache[name]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def send_json(s, o):
        b = json.dumps(o).encode(); s.send_response(200)
        s.send_header("Content-Type", "application/json"); s.send_header("Content-Length", str(len(b)))
        s.end_headers(); s.wfile.write(b)
    def do_GET(s):
        u = urllib.parse.urlparse(s.path)
        if u.path == "/api/me": return s.send_json({"user": "test"})
        if u.path == "/api/sheet-data":
            q = urllib.parse.parse_qs(u.query); sid = q.get("spreadsheetId", [""])[0]; n = q.get("sheet", [])
            return s.send_json(tab(sid, n[0]) if len(n) == 1 else {"sheets": {x: tab(sid, x) for x in n}})
        if u.path.startswith("/api/"): return s.send_json({})
        super().do_GET()
    def do_POST(s): s.send_json({})   # slide store: accept and drop
http.server.ThreadingHTTPServer(("127.0.0.1", 8765), H).serve_forever()
```

Checklist:
1. Open the changed section (click its tab/sub-tab — closed sections aren't drawn).
2. Compute the expected numbers separately (Python over the same tabs, same date range, same filters) and compare
   cards, table totals and filters number by number.
3. Check `index.html`, `report.html` (and `slides.html` if affected); desktop and mobile widths; no console errors.
4. Quick syntax check of a big script: extract it and run `node --check`.

### 9.1b Headless test harness (cloud / no Google access)
Used for every slides change so far (keep it outside the repo):
- Serve the repo with `python3 -m http.server 8765`; drive it with Playwright (Chromium).
- Route `**/cdnjs.cloudflare.com/**` to a local `chart.umd.js` (`npm pack chart.js@4.4.1`), abort Google Fonts,
  answer `**/api/me` with `{user:'test'}` and `**/api/sheet-data*` from a `mock.json` keyed
  `spreadsheetId||sheet` → `{headers, rows}` (built from an xlsx export of the real sheet with openpyxl).
- Answer `**/api/store*` with 503 `{code:'no_store'}`, or with an in-memory Map to test cross-browser sync
  (two browser contexts = two browsers).
- Pin the clock (`context.clock.setFixedTime(...)`) to a day your mock data covers: presets like «هفته قبل» move
  with the calendar.
- Run with `LANG=C.UTF-8`, or Chromium names Persian downloads "download".
- Reading real sheets from a cloud session: `docs.google.com` and `*.vercel.app` are blocked by the proxy; the
  Google Drive connector's `download_file_content` (xlsx export) works for small and medium sheets (the Arzplus
  workbook is too big).
- Before deploying, compare numbers with an independent Python sum over the same rows, and diff the dashboard's
  section text before/after (`git worktree add` of the old commit on another port) when touching `index.html`.

### 9.2 Deploy
```bash
git fetch origin main            # main may have moved (logo uploads from the web UI)
git pull --rebase origin main
git add <files> && git commit -m "<what changed>"
git push origin main             # Vercel deploys main automatically
```
Then confirm the Production deploy: the commit status from Vercel must be `success / Deployment has completed`:
`https://api.github.com/repos/erfanhamedi7-marketer/yektanet-pulse-dashboard/commits/<sha>/status`
(or `gh api repos/erfanhamedi7-marketer/yektanet-pulse-dashboard/commits/<sha>/status`). It can take ~1 minute.
GitHub sometimes answers a push with a transient `500 Internal Server Error`; just push again.

---

## 10. Open items (waiting on Erfan unless noted)

- Talaeen CPA (`talaeen-cpa`) not yet verified against the `CPA - Profit` tab with real data.
- Slide visuals should match Erfan's sample `Report.html` (on his computer) once he shares it.
- Shared slide store: `STORE_SPREADSHEET_ID` in `api/store.js` needs a sheet Erfan creates and shares with the
  service account as Editor; until then slides save only in the browser.
- Tochal Cafe Bazaar `cb-bulk` / `cb-dc` (May–June) have no AppMetrica data: show cost only, or read
  `Tocal - Metrix - Old`? Undecided.
- Cost-per-KYC column in Arzplus Adgroup/Creative tables — Erfan will say later.
- Mediums for projects without a `Campaign Type` column are guessed from campaign names; check before sending reports.
- The page HTML/JS is public (only data is locked); locking the page itself needs Vercel Routing Middleware.

---

## 11. Recipes

- **New client / section:** add the project object to `ALL_PROJECTS` (or to a generator such as
  `yektanetExportSections`) in `index.html`, and in `report.html` if the weekly report should have it; add the
  sheet id to `ALLOWED_SPREADSHEETS` in `api/sheet-data.js`; ask Erfan to share the sheet with the service
  account; add a logo file and `BRANDS` entry if needed. It appears in the slides automatically.
- **New business rule** (filter, conversion, column): change the project object in both `index.html` and
  `report.html`; verify with Python; update `docs/dashboard-handoff.md` section 3 for that client.
- **New metric in slides:** if it is a sheet column, it is already offered under «ستون‌های دیگه‌ی شیت»; a derived
  one goes into `metricDefs` + `metricValue` (and `totals` if it needs a new sum).
- **New slide type:** add it to `SLIDE_TYPES`, a renderer in `renderSlide`, defaults in `newSlide`, the
  add-buttons lists, and its settings in `slideOpts` (exclude data controls with `noData` if it has no data).
- **New report setting:** add to `defaultCfg`, read it where needed, render it in `renderSettings`, wire it in
  `wireSettings` (call `saveCfg()` then `rerender()`); it syncs to the server automatically.

## 12. Debugging common reports from Erfan

- **"This number doesn't match the sheet"**: check the date range (today is never counted; «هفته قبل» is
  Saturday–Friday), the section's campaign rules (`keep`, `excludeCampaign`, `rowFilter`, prefixes), the join
  (`includeUnmatchedCost`; a campaign spelled differently in the two tabs never joins), filters (Campaign Name +
  Campaign), and in slides the slide's own campaigns/parts/period and excluded days.
- **"A campaign's cost isn't counted"**: usually it has cost rows but no conversion rows and the section lacks
  `includeUnmatchedCost` (dashboard only; weekly reports always count it). Confirm with a script over both tabs.
- **"My edit disappeared" (slides)**: per-period edits vs template (only text goes into a template; dates and
  numbers don't), the server store overwriting (see 6.4), or the change was made in another browser before the
  store was connected.
- **"Quota exceeded"**: too many loads in a minute (60 reads/min for the service account); wait a minute.
- **Blank page / no login**: `DASHBOARD_USERS` missing on Vercel, or the deploy failed (check the commit status).

## 13. Keeping this file useful

When you change behaviour, update in the same commit:
- the relevant section of this file (key points, options table, project rules, traps), and
- `docs/dashboard-handoff.md` (Persian detail + one dated line in its history section + the date at its top).
