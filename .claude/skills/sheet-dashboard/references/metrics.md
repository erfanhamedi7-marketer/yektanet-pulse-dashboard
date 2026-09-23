# What the numbers mean

Read this when you need to explain a table, or when you are deciding whether a
section will actually answer the question someone asked.

## The join

Cost lives in one tab, results in another. They are matched on
`date + campaign`, with the campaign lowercased and trimmed, and nothing else
— no ad group, no network, no channel. Two consequences worth stating out loud
when you hand a dashboard over:

- A campaign renamed mid-flight becomes two campaigns.
- A conversion row whose campaign never appears in the cost tab contributes
  conversions with no cost behind them, which drags every CPA down. That is
  what `refCampaignsFromCost: true` prevents, and it is the right default
  whenever the conversion tab also covers organic traffic or other networks.

A supply-partner column (`Network`, `Publisher`, `Source`) is **not** part of
the join. The same campaign is often reported under the panel's name for a
while and under the partner's name later; joining on it loses the second half
of the data for no gain.

## CPA

`CPA = cost ÷ conversions`, over whatever the date filter currently covers.
Per campaign, the table also shows the CPA of the last 7 days next to the CPA
of the whole range, because a campaign whose price has just moved is the one
worth opening. "vs average" compares each campaign against the section's own
average for the same range, not against a target.

## Cost per ad group and per creative

The sheets have cost per campaign per day. They do not have cost per ad group
or per creative — the panel never reports it. So a segment's cost is
**attributed**, and how you attribute decides whether the table says anything.

The engine uses the volume column (`installsCol`) as the currency:

```
rate            = campaign cost ÷ campaign installs      (over the whole range)
segment cost    = segment installs × rate
segment CPA     = segment cost ÷ segment conversions
```

A creative that buys installs cheaply but converts none of them shows a CPA far
above average — which is the finding worth having. **This only works when the
conversion differs from the volume column.** If you set both to the same column
(installs as the conversion, installs as the volume), every segment's CPA
collapses to its campaign's CPA and the table becomes an elaborate way of
repeating one number. Don't ship that table in a CPI section; the CPI section
uses a different method for creatives:

```
creative cost = Σ over days of (that day's campaign cost × its share of that day's installs)
creative CPI  = creative cost ÷ creative installs
```

Here creatives differ because they ran on different days and campaigns —
a creative that kept running through the expensive days ends up dearer. Say
that in the card, as the template does: an attributed number that looks
measured is worse than one that explains itself.

Segments need volume before their CPA means anything. The floor is 5 installs
or 0.1% of the section's installs, whichever is larger, and twice that for a
segment with no conversions at all (since "spent and never converted" leads the
table and deserves more evidence). Everything above the section average is
listed, most expensive first; the rest are counted, not listed.

## Cost-per-X cards

`costPerMetrics` adds a card per extra action column: total cost ÷ total of
that column, for the current range, with the raw count underneath. These are
cards rather than charts on purpose — a deposit or purchase count per day is
usually too sparse to draw.

## Which campaigns drive a gap

When two sources count the same thing differently, the interesting question is
not which campaign has the biggest percentage gap — a campaign with three
sessions can be off by 300% and mean nothing. It is which campaigns *move the
overall gap*, so each one's contribution is measured in percentage points of
the total:

```
contribution = (own − other) ÷ other total × 100
```

These add up to the overall gap exactly, which is what makes the list
trustworthy: the reader can see the whole difference accounted for.

## Budget and profit

Declared cost only earns while a campaign is still inside its budget, so profit
is walked day by day per campaign:

```
billable today = min(declared so far, budget) − min(declared before today, budget)
profit today   = billable today − real cost today
```

Summed over a campaign this reproduces the `Profit` column in the client's own
Budgeting tab, which is the check to run when the numbers are questioned.

## Date ranges

Presets are: whole range, from last Saturday (the Persian week opens on
Saturday), last 7 days, last 30 days. "From Saturday" anchors on the newest day
the sheet has rather than on today, so a sheet that lags a few days still shows
a non-empty week.

Rows dated in the future are dropped before anything is computed — sheets
routinely carry pre-created rows for the rest of the month, and left in they
push the range forward so "last 7 days" lands on empty days.
