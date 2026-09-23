# The config file

One JSON object. `projects` is the list of sections; everything else is the
page around them.

```json
{
  "title": "Marketing Pulse",
  "subtitle": "شیت هزینه × شیت کانورژن، جوین روی Date + Campaign",
  "sourceMode": "live+snapshot",
  "projects": [ { "...": "one object per section" } ]
}
```

| Key | Meaning |
|---|---|
| `title` | browser tab and page heading |
| `subtitle` | one line under the heading — a good place to name the sheets |
| `sourceMode` | `live+snapshot` (default), `live`, or `snapshot` |

## Contents

- [Every section key](#every-section-key)
- [Tabs and groups](#tabs-and-groups)
- [Choosing campaigns](#choosing-campaigns)
- [Colors](#colors)
- [Example: a standard section](#example-a-standard-section)
- [Example: a CPI section](#example-a-cpi-section)
- [Example: a budget section](#example-a-budget-section)
- [Example: comparing two sources of sessions](#example-comparing-two-sources-of-sessions)

## Every section key

### Identity

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | unique, used in element ids — keep it stable once shipped |
| `title` | yes | heading of the section |
| `tabTitle` | | label on the tab, when it should be shorter than the title |
| `subtitle` | | the line under the heading; name the tabs it reads |
| `logo` | | path or URL to an image shown beside the title |
| `logoWide` | | `true` for a wide wordmark, so it isn't cropped into a square |
| `hidden` | | `true` keeps the section out of the page entirely |

### Where the data is

| Key | Required | Meaning |
|---|---|---|
| `spreadsheetId` | yes | the id from the sheet URL (`/spreadsheets/d/<this>/edit`) |
| `refSheet` | yes* | the conversion tab. A string, or a list, or `{"sheet": "...", "conversionCol": "..."}` entries when two tabs count the same conversion under different column names — their rows are summed per day and campaign |
| `costSheet` | yes* | the tab with `Date`, `Campaign`, `Cost`. May be the same tab as `refSheet` when one export holds both |
| `conversionCol` | yes* | the column whose cost you want to know |
| `conversionLabel` | | what to call it on screen (`KYC`, `لید`, `نصب`) |
| `cpaLabel` | | what to call cost-per-conversion; default `CPA`, use `CPI` when the conversion is an install |
| `installsCol` | | a volume column used to weight ad group / creative costs — see metrics.md |
| `installsLabel` | | its label |
| `showInstalls` | | `true` adds a KPI card for it |
| `adgroupCol` / `creativeCol` | | defaults `Adgroup` / `Creative`; set them when the tab spells them differently (`Ad Group`) |
| `impressionsCol` / `clicksCol` | | defaults `Impressions` / `Clicks` |
| `costPerMetrics` | | extra cost-per-X cards: `[{"col": "Deposit"}, {"col": "Purchase", "label": "خرید"}]` |

\* not for `kind: "budget"`, which uses `blendSheet` and `budgetSheet` instead.

### Behaviour

| Key | Meaning |
|---|---|
| `refCampaignsFromCost` | `true` drops conversion rows whose campaign never appears in the cost tab — use it when the conversion tab covers other networks or organic traffic |
| `includeUnmatchedCost` | `true` counts cost that has no conversion row at all, so the section reports the sheet's whole spend |
| `campaigns` | which campaigns belong to this section — see below |
| `ownDateFilter` | `true` gives the section its own date bar (recommended when sections read different sheets) |
| `defaultRangeDays` | what that bar opens on; `30` is the usual choice |
| `defaultCampaigns` | open with only these campaigns selected, by label |
| `filterUnit` / `filterAllLabel` | wording of the campaign filter, e.g. `Campaign Name` / `همه‌ی Campaign Name‌ها` |
| `hideDeepAnalysis` | hide the whole deep-analysis card |
| `hideSegmentAnalysis` | keep the deep analysis but drop the Adgroup/Creative tables — right when the export has no such columns |

## Tabs and groups

One section with no `group` is its own tab. Sections sharing a `group` sit
behind a single tab with a row of buttons under it:

```json
{"id": "arzplus-app",  "group": "arzplus", "groupTitle": "ارزپلاس", "partTitle": "اپلیکیشن"}
{"id": "arzplus-cafe", "group": "arzplus", "partTitle": "کافه بازار"}
```

`groupTitle` goes on the first section of the group and names the tab;
`partTitle` names each button. Tab order follows the order of `projects`.

## Choosing campaigns

`campaigns` is a rule, not code. A campaign must satisfy every part given:

```json
"campaigns": {"contains": "-prf"}
"campaigns": {"startsWith": ["inapp", "inap"]}
"campaigns": {"excludes": ["wheel", "seo", "branding"]}
"campaigns": {"startsWith": "cb-", "excludes": "test"}
```

Matching is lowercase and ignores surrounding spaces. Cost belonging to
campaigns the rule drops is reported in the note under the section header, so
nobody thinks money went missing.

## Colors

Either name one of the built-in palettes — `blue`, `snapp`, `talaeen`,
`wepod`, `bankino`, `shahr`, `arzplus`, `tochal`, `ramzarz`, `blueJr` — or give
the brand directly:

```json
"theme": {"accent": "#E57E03", "ink": "#B95500", "accent2": "#1B1F27", "grad": ["#E57E03", "#F3B112"]}
```

- `accent` — the brand color: cost columns, rules, meters.
- `ink` — the same color darkened until it reads as text on white. Pale brands
  (yellows, light greens) are unreadable as text at their real value, so this
  is what tab labels and KPI figures use. If you leave it out, `accent` is used
  and a pale brand will look washed out.
- `accent2` — the second series, which draws the CPA line. When the brand's
  second color is black or white, leave it out: white is the page, and the
  near-black default keeps the two series far apart.
- `grad` — an optional two-stop gradient for the columns.

## Example: a standard section

```json
{
  "id": "appliance-city",
  "title": "شهر لوازم خانگی",
  "subtitle": "Yektanet - Export — فقط کمپین‌های شامل -prf",
  "spreadsheetId": "1sjDc...",
  "refSheet": "Yektanet - Export",
  "costSheet": "Yektanet - Export",
  "conversionCol": "Lead",
  "conversionLabel": "Lead",
  "installsCol": "Sessions",
  "installsLabel": "Sessions",
  "showInstalls": true,
  "impressionsCol": "Impression",
  "clicksCol": "Click",
  "campaigns": {"contains": "-prf"},
  "hideSegmentAnalysis": true,
  "ownDateFilter": true,
  "defaultRangeDays": 30,
  "theme": "shahr"
}
```

## Example: a CPI section

Cost and cost-per-install only, three campaign groups on one page. Each group
gets its own chart; `campaignTable` and `creativeTable` add tables under it.

```json
{
  "id": "ramzarz",
  "title": "رمزارز نیوز",
  "kind": "cpi",
  "spreadsheetId": "1fOn7...",
  "refSheet": "Ramzarz - App Metrica",
  "costSheet": "Ramzarz- Yektanet",
  "refCampaignsFromCost": true,
  "conversionCol": "Total Installs",
  "conversionLabel": "نصب",
  "cpaLabel": "CPI",
  "installsCol": "Total Installs",
  "adgroupCol": "Ad Group",
  "creativeCol": "Creative",
  "impressionsCol": "Impression",
  "clicksCol": "Click",
  "hideDeepAnalysis": true,
  "cpiGroups": [
    {"id": "all",  "title": "کلی", "sub": "همه‌ی کمپین‌ها"},
    {"id": "app",  "title": "درون اپلیکیشن", "prefix": "inap", "campaignTable": true},
    {"id": "cafe", "title": "کافه بازار", "prefix": "cb-", "campaignTable": true, "creativeTable": true}
  ],
  "ownDateFilter": true,
  "defaultRangeDays": 30,
  "theme": {"accent": "#E57E03", "ink": "#B95500", "grad": ["#E57E03", "#F3B112"]}
}
```

## Example: a budget section

For sheets that track what was declared to a client against what the panel
really spent. `Blend Data` needs `Date`, `Campaign`, `Campaign Name`, `Cost`
(declared) and `Cost R` (real); `Budgeting` needs one row per campaign with
`Total Budget`, `Spent`, `Remaining Budget`, `Spent (Panel)`, `Profit`.

```json
{
  "id": "snapppay",
  "title": "اسنپ‌پی",
  "kind": "budget",
  "spreadsheetId": "1dgyC...",
  "blendSheet": "Blend Data",
  "budgetSheet": "Budgeting",
  "filterUnit": "Campaign Name",
  "filterAllLabel": "همه‌ی Campaign Name‌ها",
  "defaultCampaigns": ["Shahrivar 405"],
  "hideDeepAnalysis": true,
  "ownDateFilter": true,
  "defaultRangeDays": 30,
  "theme": "snapp"
}
```

Profit per day is `min(declared so far, budget) − real cost`: declared cost
stops earning once a campaign passes its budget, which is why the totals match
the client's own sheet.

## Example: comparing two sources of sessions

Add to any standard section to compare its own daily totals with another tab's
— GA4 against the panel, say. The comparison is whole-tab and day-by-day:
campaign names play no part, and neither does the campaign filter.

```json
"sessionsCompare": {
  "sheet": "Data Studio - GA4",
  "sessionsCol": "Sessions",
  "otherLabel": "GA4",
  "ownLabel": "Yektanet"
}
```

The section's own side of the comparison is its `installsCol`, so set that to
the sessions column. The card shows both totals, the percentage gap, a daily
chart, and which campaigns contribute most to the gap.
