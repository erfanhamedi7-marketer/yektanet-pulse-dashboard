#!/usr/bin/env python3
"""Fill the dashboard template with a config and a data snapshot.

  python3 scripts/build_dashboard.py config.json -o dashboard.html [--snapshot rows.json]

config.json is the object described in references/config.md. --snapshot is the
map {"<tab name>": [ {column: value}, ... ]} produced by fetch_sheet.py; leave
it out for a live-only file.

The snapshot is what makes the delivered file work on its own, so it is worth
keeping small: rows are aggregated on the columns the dashboard actually reads
and everything else is dropped. If the result would still be huge, the segment
columns (ad group / creative) are dropped first, because a campaign-level file
that opens is better than a complete one that takes a minute to parse.
"""
import argparse, json, os, sys, datetime

# A packed snapshot of this size parses in well under a second; past it the
# file starts to feel heavy to open and email around.
MAX_EMBED_MB = 12.0


def die(msg):
    print('error: ' + msg, file=sys.stderr)
    sys.exit(1)


def columns_used(config):
    """Every column name the config refers to, per tab."""
    per_tab = {}
    for p in config.get('projects', []):
        ref_tabs = p.get('refSheet') or []
        if isinstance(ref_tabs, str):
            ref_tabs = [ref_tabs]
        ref_tabs = [t if isinstance(t, str) else t.get('sheet') for t in ref_tabs]
        cols = {'Date', 'Campaign'}
        for key in ('conversionCol', 'installsCol', 'adgroupCol', 'creativeCol'):
            if p.get(key):
                cols.add(p[key])
        for m in p.get('costPerMetrics') or []:
            cols.add(m['col'])
        for t in filter(None, ref_tabs):
            per_tab.setdefault(t, set()).update(cols)
        if p.get('costSheet'):
            per_tab.setdefault(p['costSheet'], set()).update(
                {'Date', 'Campaign', 'Cost', p.get('impressionsCol', 'Impressions'), p.get('clicksCol', 'Clicks')})
        cmp_ = p.get('sessionsCompare')
        if cmp_:
            per_tab.setdefault(cmp_['sheet'], set()).update({'Date', 'Campaign', cmp_['sessionsCol']})
        if p.get('blendSheet'):
            per_tab.setdefault(p['blendSheet'], set()).update(
                {'Date', 'Campaign', 'Campaign Name', 'Cost', 'Cost R', 'Sessions', 'Impression', 'Click'})
        if p.get('budgetSheet'):
            per_tab.setdefault(p['budgetSheet'], set()).update(
                {'Campaign', 'Campaign Name', 'Total Budget', 'Spent', 'Remaining Budget', 'Spent (Panel)', 'Profit'})
    return per_tab


def to_number(v):
    if isinstance(v, (int, float)):
        return v
    try:
        return float(str(v).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def shrink(tab_rows, wanted, drop_segments=False):
    """Keep the wanted columns and fold rows that share the same key."""
    segment_cols = {'Ad Group', 'Adgroup', 'Creative'}
    keys, out = [], {}
    for row in tab_rows:
        kept = {c: row.get(c, '') for c in wanted if c in row}
        if drop_segments:
            kept = {c: v for c, v in kept.items() if c not in segment_cols}
        dims = {c: v for c, v in kept.items() if to_number(v) is None or c in ('Date',) or c in segment_cols
                or c in ('Campaign', 'Campaign Name', 'Network')}
        nums = {c: to_number(v) for c, v in kept.items() if c not in dims}
        k = json.dumps(dims, ensure_ascii=False, sort_keys=True)
        if k not in out:
            out[k] = dict(dims)
            keys.append(k)
            for c, n in nums.items():
                out[k][c] = n or 0
        else:
            for c, n in nums.items():
                out[k][c] = (out[k].get(c) or 0) + (n or 0)
    return [out[k] for k in keys]


def pack(rows):
    """Column names once, values as arrays — the same rows at about a third of
    the bytes, which decides whether ad group / creative data fits in the file."""
    cols = []
    for r in rows:
        for c in r:
            if c not in cols:
                cols.append(c)
    return {'cols': cols, 'rows': [[r.get(c, '') for c in cols] for r in rows]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('config')
    ap.add_argument('-o', '--out', default='dashboard.html')
    ap.add_argument('--snapshot', help='JSON map of tab name -> rows')
    ap.add_argument('--template', default=os.path.join(os.path.dirname(__file__), '..', 'assets', 'dashboard-template.html'))
    args = ap.parse_args()

    config = json.load(open(args.config, encoding='utf-8'))
    if not config.get('projects'):
        die('the config has no "projects"')

    tabs = {}
    if args.snapshot:
        raw = json.load(open(args.snapshot, encoding='utf-8'))
        wanted = columns_used(config)
        for tab, rows in raw.items():
            cols = wanted.get(tab) or set().union(*(set(r) for r in rows[:1])) if rows else set()
            tabs[tab] = shrink(rows, cols)
        size = len(json.dumps({t: pack(r) for t, r in tabs.items()}, ensure_ascii=False).encode('utf-8'))
        if size > MAX_EMBED_MB * 1024 * 1024:
            print(f'snapshot is {size/1e6:.1f} MB — dropping ad group / creative columns so the '
                  f'file stays openable offline (they still work when the sheet is read live)', file=sys.stderr)
            tabs = {t: shrink(rows, wanted.get(t, set()), drop_segments=True) for t, rows in raw.items()}

    snapshot = {'takenAt': datetime.date.today().isoformat(),
                'tabs': {tab: pack(rows) for tab, rows in tabs.items()}}
    html = open(args.template, encoding='utf-8').read()
    html = html.replace('__DASHBOARD_TITLE__', config.get('title', 'Dashboard'))
    html = html.replace('__DASHBOARD_SUBTITLE__', config.get('subtitle', ''))
    html = html.replace('__DASHBOARD_CONFIG__', json.dumps(config, ensure_ascii=False, indent=2))
    html = html.replace('__EMBEDDED_DATA__', json.dumps(snapshot, ensure_ascii=False))
    for left in ('__DASHBOARD_TITLE__', '__DASHBOARD_CONFIG__', '__EMBEDDED_DATA__'):
        if left in html:
            die('placeholder ' + left + ' survived — the template may be out of date')
    open(args.out, 'w', encoding='utf-8').write(html)
    size = os.path.getsize(args.out) / 1e6
    rows = sum(len(v) for v in tabs.values())
    print(f'wrote {args.out} ({size:.2f} MB, {rows:,} snapshot rows across {len(tabs)} tabs)')


if __name__ == '__main__':
    main()
