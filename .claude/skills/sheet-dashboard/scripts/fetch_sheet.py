#!/usr/bin/env python3
"""Read tabs of a public Google Sheet into JSON, for inspection and for the snapshot.

  python3 scripts/fetch_sheet.py <sheet-url-or-id> --tabs "Tab A" "Tab B" -o rows.json
  python3 scripts/fetch_sheet.py <sheet-url-or-id> --tabs "Tab A" --head 5

The sheet has to be shared with "anyone with the link". When it is private,
this fails and the rows have to come from a connector that can read Drive
(e.g. the Google Drive tools in the session) — save them in the same shape:
{"<tab name>": [{"<column>": value, ...}, ...]}.

Dates come back as the sheet displays them and numbers as real numbers, which
is what the dashboard's parsers expect.
"""
import argparse, json, re, sys, urllib.parse, urllib.request

GVIZ = 'https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:json&headers=1&sheet={tab}'


def sheet_id(url_or_id):
    m = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', url_or_id)
    return m.group(1) if m else url_or_id.strip()


def fetch_tab(sid, tab):
    url = GVIZ.format(id=sid, tab=urllib.parse.quote(tab))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        text = r.read().decode('utf-8')
    start, end = text.find('{'), text.rfind('}')
    if start < 0:
        raise RuntimeError('unexpected response — is the sheet shared with "anyone with the link"?')
    table = json.loads(text[start:end + 1])
    if table.get('status') == 'error':
        raise RuntimeError('; '.join(e.get('detailed_message', e.get('message', '')) for e in table.get('errors', [])))
    cols = [(c.get('label') or c.get('id') or f'col{i}').strip() for i, c in enumerate(table['table']['cols'])]
    rows = []
    for r in table['table']['rows']:
        obj = {}
        for i, cell in enumerate(r.get('c') or []):
            if i >= len(cols):
                continue
            v = ''
            if cell:
                v = cell.get('f') if cell.get('f') is not None else cell.get('v')
            if isinstance(v, str):
                m = re.match(r'^Date\((\d+),(\d+),(\d+)', v)
                if m:  # gviz months are zero-based
                    v = f'{m.group(1)}{int(m.group(2))+1:02d}{int(m.group(3)):02d}'
            obj[cols[i]] = '' if v is None else v
        rows.append(obj)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('--tabs', nargs='+', required=True)
    ap.add_argument('-o', '--out')
    ap.add_argument('--head', type=int, default=0, help='print the first N rows of each tab instead of saving')
    args = ap.parse_args()

    sid, out, failed = sheet_id(args.sheet), {}, []
    for tab in args.tabs:
        try:
            rows = fetch_tab(sid, tab)
        except Exception as e:  # keep going: one unreadable tab shouldn't lose the others
            print(f'{tab}: FAILED — {e}', file=sys.stderr)
            failed.append(tab)
            continue
        out[tab] = rows
        cols = list(rows[0].keys()) if rows else []
        print(f'{tab}: {len(rows):,} rows | columns: {", ".join(cols)}')
        for row in rows[:args.head]:
            print('   ', json.dumps(row, ensure_ascii=False)[:300])
    if args.out:
        json.dump(out, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'saved {args.out}')
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
