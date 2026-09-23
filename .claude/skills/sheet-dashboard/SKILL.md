---
name: sheet-dashboard
description: Builds a self-contained HTML marketing dashboard from a Google Sheet — you give the sheet link, the tab names and which columns hold cost, conversions and dates, and it produces one .html file with daily cost/CPA charts, KPI cards, per-campaign and per-creative CPA tables, campaign filters and date presets. Use this whenever someone wants a dashboard, report page or visual view built on a Google Sheet of marketing data (Yektanet, Adtrace, AppMetrica, GA4, Adivery, Cafe Bazaar, ad spend, installs, KYC, leads, sessions, budget/profit), or asks to "turn this sheet into a dashboard", "make a report from this sheet", "visualize these campaigns", or hands over a sheet link and a list of metrics — even if they never say the word dashboard. Also use it to add a new project or section to a dashboard that was already built this way.
---

# Dashboard from a Google Sheet

You produce **one HTML file** the person can open by double-clicking it, mail to
a colleague, or put on any static host. No backend, no build step, no install.

The engine is already written and tested — `assets/dashboard-template.html`
holds the whole thing (charts, tables, filters, RTL Persian light theme). Your
job is not to write a dashboard; it is to **understand the sheet well enough to
configure one**. That distinction is what makes the result trustworthy: the
analysis code is the same every time, so the only thing that can be wrong is
the mapping from their columns to it — which is exactly where your attention
belongs.

## What you need from the person

Ask for whatever of this is missing, in one message rather than a drip of
questions. Most people answer all of it at once if you ask plainly:

1. **The sheet link** (and whether it is shared with "anyone with the link" —
   this decides whether the file can refresh itself; see *Where the data comes
   from* below).
2. **Which tabs** to use, by name, exactly as the tabs are spelled. Tab names
   often carry stray spaces or a missing one (`Arzplus- Yektanet`), and a
   wrong name is the most common reason a section comes up empty.
3. **What each tab holds**: which one has the money (cost per day per campaign)
   and which one has the results (installs, leads, KYC, purchases, sessions).
4. **Which column is the conversion** they care about — the number whose cost
   they want to know. Everything the dashboard calls "CPA" is cost ÷ this.
5. **Which campaigns count**, if not all of them (e.g. only names containing
   `-prf`, or only those starting with `inapp`).
6. **What they call things**, in their language — the conversion's label shows
   up on every card and column header.

If they want several views (per app, per channel, per campaign family), each one
becomes a section; sections sharing a `group` sit behind one tab with a second
row of buttons.

## Look at the data before you configure anything

Never configure from the column names you were told. Read the tabs first:

```bash
python3 scripts/fetch_sheet.py "<sheet link>" --tabs "Cost Tab" "Conversions Tab" --head 3
```

It prints the row count and the real column names, and shows a few rows. When
the sheet is private this fails — then read it with whatever Drive/Sheets
connector the session has and save the rows yourself as
`{"<tab name>": [{"<column>": value}, ...]}`.

What you are checking for, because each of these has silently produced a wrong
dashboard before:

- **The column names really match** what they said (`Total Installs` vs
  `Installs`, `Verified` vs `Conversion`, `Impression` vs `Impressions`).
- **The two tabs overlap in time.** Compare first and last dates. A conversion
  tab that stops six weeks before the cost tab makes "last 30 days" look empty,
  and that is a data fact worth telling them, not a bug to hide.
- **The campaign names match across tabs.** The join is `date + campaign` and
  nothing else. If one side writes `inapp-cpi-bnr` and the other
  `INAPP-CPI-BNR`, fine — matching is case-insensitive — but if one side adds a
  prefix, nothing will join and every CPA comes out empty.
- **Whether the conversion tab covers more than these campaigns** (other
  networks, organic rows). If so set `refCampaignsFromCost: true`, which keeps
  only rows whose campaign appears in the cost tab.

`references/sheet-quirks.md` has the rest of what bites — number formats, date
shapes, future-dated rows, supply-partner columns. Read it once before your
first configuration; it is short and it is all hard-won.

## Choose the shape of each section

| The question they want answered | Section kind | What it draws |
|---|---|---|
| What did we spend and what did it buy? | (default, no `kind`) | daily cost + CPA, KPI cards, per-campaign CPA table, cost/CPA movers, Adgroup & Creative CPA tables |
| Only cost and cost per install, split a few ways | `kind: "cpi"` | one cost+CPI chart per campaign group on one page, plus campaign and creative tables |
| Are we inside the client's budget, and what's the margin? | `kind: "budget"` | declared vs real cost and profit per day, budget table, remaining-budget bars |

Pick the simplest kind that answers their question. A section with analyses
nobody asked for reads as noise, and `hideDeepAnalysis` / `hideSegmentAnalysis`
exist for exactly that reason.

`references/config.md` documents every key, with a worked example of each kind.
Read it while writing the config — it is the reference you will actually use.

## Build it

Write the config as JSON, then:

```bash
# snapshot is optional but strongly preferred — see below
python3 scripts/fetch_sheet.py "<link>" --tabs "Tab A" "Tab B" -o rows.json
python3 scripts/build_dashboard.py config.json --snapshot rows.json -o dashboard.html
node scripts/check_dashboard.mjs dashboard.html
```

The checker catches a syntax error in the generated file, an unfilled
placeholder, a config that doesn't parse, a tab named in the config with no
rows behind it, and a file too heavy to open. It is fast; run it every time.

## Where the data comes from

The file reads each tab two ways and the better one wins:

- **live** — straight from Google in the browser, so the numbers are current.
  Works only while the sheet is shared with *anyone with the link*.
- **snapshot** — the rows baked into the file when you built it. Always
  renders, never changes.

Build with `--snapshot` unless they tell you not to: a file that opens on a
plane and shows last week's numbers beats a file that shows an error. The
status pill at the top says which one the viewer is looking at, so nobody
mistakes frozen numbers for live ones.

A big conversion tab (100k+ rows) makes for a ~10 MB file that takes a few
seconds to open. That is usually the right trade; if they'd rather have a small
file, build with `"sourceMode": "live"` and no snapshot, and tell them it needs
the sheet to stay shared.

## Look at what you built

Open it before you hand it over. If the session has a browser (Playwright),
load the file from disk and read the KPI cards back; if not, at minimum check
that the numbers in the file agree with a total you compute yourself from the
rows — one campaign's cost over the whole range is enough to catch a mis-mapped
column, and a mis-mapped column is the failure mode that looks fine and is
completely wrong.

Then say, in the handover: which tabs fed it, which column became the
conversion, which campaigns were kept out, whether it reads live or from a
snapshot, and the date range the data actually covers. People trust a number
they can trace.

## Adding to a dashboard that already exists

Same steps, one extra: keep the ids stable. A section's `id` is used in the
element ids inside the page, so changing it silently breaks nothing but makes
old links and screenshots confusing. Put related sections in the same `group`
so they share a tab.

## How the numbers are computed

`references/metrics.md` explains the analysis the engine performs — how cost is
joined to conversions, how a CPA is attributed to an ad group or creative when
cost only exists per campaign, how the "which campaigns drive the gap" analysis
apportions a difference, and which of these have a caveat worth repeating to
the person looking at the screen. Read it when someone asks what a number
means, or when you are about to explain a table to them.
