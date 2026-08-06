#!/usr/bin/env python3
"""
Turn a printed paddle book PDF into the JSON the app reads.

The books come out of Crystal Reports as four narrow columns per page, so
`pdftotext -layout` interleaves them into nonsense - column two's times land
in the middle of column one's sentences. Word positions are used instead:
every word carries an x, words are bucketed into their column, and each
column is read top to bottom before moving to the next. That recovers the
order a person reads the page in.

What a paddle looks like once that is done:

    005001 Saturday (TG 4)
    Effective: July 04, 2026 Type: 60
    Routes: 5, 40, 105, 110
    4:04 Industrial Garage          <- sign-on
    (Sign-on)
    4:14 Industrial Garage          <- pull-out
    (R) ROADWAY TO BELFAST, ...     <- driving directions, ignored
    110 Hurdman Station 1           <- route, destination, trip number
    4:44 CITIGATE CROSSKEYS         <- timepoints
    ...
    7:01 Elmvale A Relief           <- a relief point

Usage:
    python3 scripts/parse-paddle-book.py BOOK.pdf "Saturday" out.json
"""

import html
import json
import re
import subprocess
import sys

# Times, then locations, for each of the four columns on a page.
COLUMN_BOUNDS = [0, 250, 500, 745, 10_000]

WORD = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">(.*?)</word>'
)
PAGE = re.compile(r"<page .*?</page>", re.S)

TIME = re.compile(r"^(\d{1,2}:\d{2})\s+(.*)$")
PADDLE_HEAD = re.compile(r"^(\d{6})\s+(\S+)(?:\s+\(TG\s*(\d+)\))?")
TRIP_HEAD = re.compile(r"^([A-Z0-9]{1,4})\s+(.+?)\s+(\d{1,3})$")
EFFECTIVE = re.compile(r"Effective:\s*([A-Za-z]+ \d{1,2}, \d{4})")
BUS_TYPE = re.compile(r"Type:\s*(\S+)")
ROUTES = re.compile(r"^Routes?:\s*(.+)$")

# Printed on every page and part of no paddle.
NOISE = (
    "Conduct Post Trip Checks",
    "Each Trip and at the End",
    "Trip N",
    "(Sign-on)",
)


def lines_from(pdf_path):
    """Every line of the book, in the order a person would read it."""
    xml = subprocess.run(
        ["pdftotext", "-bbox-layout", pdf_path, "-"],
        capture_output=True, text=True, check=True,
    ).stdout

    for page in PAGE.findall(xml):
        columns = [[] for _ in range(len(COLUMN_BOUNDS) - 1)]
        for x_raw, y_raw, text in WORD.findall(page):
            x, y = float(x_raw), float(y_raw)
            for i in range(len(COLUMN_BOUNDS) - 1):
                if COLUMN_BOUNDS[i] <= x < COLUMN_BOUNDS[i + 1]:
                    columns[i].append((y, x, html.unescape(text)))
                    break

        for column in columns:
            column.sort()
            line, last_y = [], None
            for y, x, text in column:
                # Words within three points of each other sit on one line.
                if last_y is not None and abs(y - last_y) > 3:
                    yield " ".join(t for _, t in sorted(line))
                    line = []
                line.append((x, text))
                last_y = y
            if line:
                yield " ".join(t for _, t in sorted(line))


def to_min(hhmm):
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def finish(paddle):
    """Fill in the derived fields once a paddle's lines have all been read."""
    stops = list(paddle["pre"]) + [s for trip in paddle["t"] for s in trip[3]]
    if not stops:
        return None

    paddle["on"], paddle["onL"] = stops[0][0], stops[0][1]
    paddle["off"], paddle["offL"] = stops[-1][0], stops[-1][1]

    # Times are printed on a 24-hour clock and simply restart after midnight,
    # so the span is measured by walking the whole paddle and adding a day
    # every time the clock goes backwards.
    total, previous, days = 0, to_min(stops[0][0]), 0
    for stop in stops:
        current = to_min(stop[0]) + days * 1440
        if current < previous:
            days += 1
            current += 1440
        previous = current
    paddle["span"] = previous - to_min(stops[0][0])
    if days:
        paddle["next"] = 1
    return paddle


def parse(pdf_path, day_type):
    paddles, effective = [], None
    current, trip = None, None

    for raw in lines_from(pdf_path):
        line = " ".join(raw.split())
        if not line or any(line.startswith(n) for n in NOISE):
            continue

        head = PADDLE_HEAD.match(line)
        if head and head.group(2).rstrip(".") in (
            day_type, "Saturday", "Sunday", "Weekdays", "Weekday"
        ):
            if current:
                paddles.append(finish(current))
            current = {
                "p": head.group(1), "d": day_type,
                "tg": int(head.group(3) or 0), "r": [],
                "pre": [], "t": [],
            }
            trip = None
            continue

        if current is None:
            continue

        if EFFECTIVE.search(line):
            effective = effective or EFFECTIVE.search(line).group(1)
        if BUS_TYPE.search(line):
            current["bus"] = BUS_TYPE.search(line).group(1)
        routes = ROUTES.match(line)
        if routes:
            current["r"] = [r.strip() for r in routes.group(1).split(",") if r.strip()]
            continue

        stop = TIME.match(line)
        if stop:
            where = stop.group(2).strip()
            # The "Trip N°" column heading is printed level with the sign-on
            # line and lands in the same column, so it arrives glued to it.
            where = re.sub(r"\s*Trip\s*N[°o]?\s*$", "", where).strip()
            relief = 0
            if where.endswith("Relief"):
                where, relief = where[: -len("Relief")].strip(), 1
            entry = [stop.group(1), where] + ([1] if relief else [])
            (trip[3] if trip else current["pre"]).append(entry)
            continue

        # Driving directions are set in capitals and run to several lines;
        # a trip header is a route, a destination and a trip number.
        if line.isupper() or line.endswith((",", ".")):
            continue
        header = TRIP_HEAD.match(line)
        if header:
            trip = [header.group(1), header.group(2).strip(), int(header.group(3)), []]
            current["t"].append(trip)

    if current:
        paddles.append(finish(current))

    return {
        "effective": effective or "",
        "dayType": day_type,
        "paddles": [p for p in paddles if p and p["t"]],
    }


def main():
    if len(sys.argv) != 4:
        print(__doc__.strip())
        raise SystemExit(2)

    pdf_path, day_type, out_path = sys.argv[1:]
    book = parse(pdf_path, day_type)
    json.dump(book, open(out_path, "w"), separators=(",", ":"), ensure_ascii=False)

    trips = sum(len(p["t"]) for p in book["paddles"])
    stops = sum(len(s) for p in book["paddles"] for s in [p["pre"]] + [t[3] for t in p["t"]])
    print(f"{out_path}: {len(book['paddles'])} paddles, {trips} trips, {stops} stops, "
          f"effective {book['effective']!r}")


if __name__ == "__main__":
    main()
