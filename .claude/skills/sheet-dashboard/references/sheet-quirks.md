# What bites, in real sheets

Every item here has cost a wrong dashboard at least once. The engine already
handles all of them; the reason to know them is so you can recognise the
symptom when a number looks off, and so you check the right thing before you
hand the file over.

## Numbers

Sheets hand over whatever the cell shows, in whatever locale it is using. The
parser accepts: Persian and Arabic-Indic digits, `٬` or a space or a comma as a
thousands separator, `٫` as a decimal separator, a trailing currency word,
`(1,234)` and `1,234-` for negatives, `1.234.567` grouping — and **scientific
notation**, `1.48E+08`, which is what a wide Cost column silently becomes.

That last one is the nastiest: read naively it parses as `1.48` and a day's
cost quietly comes out a hundred million short while everything still renders.
If a daily chart has a few oddly tiny bars, that is the first thing to check.

The count of cells that looked like a number but read as zero is reported in
the note under the section header, so an unparseable format announces itself
rather than hiding.

## Dates

Accepted shapes: `YYYYMMDD`, `YYYY-M-D`, `M/D/YYYY` and `M/D/YY` (month first,
which is how Google formats them), 5-digit sheet serials, and 14-digit
timestamps. One tab is often formatted differently from another in the same
sheet; that is fine, they normalise to the same key.

Rows dated in the future are dropped — see metrics.md.

## Tab names

Copy them exactly, including the ones with a missing or doubled space
(`Arzplus- Yektanet`, `Tocal - Yektanet`). A misspelt tab name is not a silent
failure — the section reports that it could not read the tab — but it is the
most common thing to get wrong, and `fetch_sheet.py` will tell you the moment
you try.

## Numeric cells where you expected text

A campaign, ad group or creative named `24227` comes back as a **number**, not
a string. Anything that calls `.trim()` on it crashes and takes the whole
section down. The engine converts cells to text before touching them; if you
extend it, do the same.

## Private sheets

`fetch_sheet.py` only works on sheets shared with "anyone with the link". For a
private sheet, read it with the session's Drive/Sheets connector and save the
rows yourself in the same shape, then pass that file to
`build_dashboard.py --snapshot`. The delivered file will then be snapshot-only,
which is worth saying explicitly in the handover: it shows the numbers as of
the day it was built.

A large read is better saved to a file and inspected with a script than pulled
into the conversation — a 100k-row tab is tens of thousands of tokens and you
need three rows of it.

## When a section comes up empty

In order of likelihood: the tab name is wrong; the campaign rule excluded
everything; the two tabs don't overlap in the selected date range; the campaign
names don't match across tabs. The note under the section header distinguishes
these — it reports join coverage, how much cost the campaign rule excluded, how
many rows had no date or campaign, and whether the conversion tab simply has no
rows in this range.
