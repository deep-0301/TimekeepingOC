#!/usr/bin/env python3
"""
Tie every GTFS trip to the paddle that works it.

A GTFS *block* is one vehicle's day of work, which is exactly what a paddle
is. The two never share an identifier - OC Transpo's block ids are internal
numbers like 13894134, and nothing in the GTFS mentions a paddle number - but
they describe the same thing, so they can be matched on their contents: the
route and start time of every trip in the day.

Get that right and the guessing stops. The realtime feed names the trip a bus
is on; the trip names its block; the block is the paddle. No clock arithmetic,
no shortlist, no "one of several buses on the route".

Usage:
    python3 scripts/build-paddle-trips.py GTFS.zip public/paddle-data-*.json

The GTFS feed is published per booking period, so this has to be re-run when
the booking changes and a new feed comes out. The output carries the feed's
own validity dates and the app refuses to trust it outside them.
"""

import collections
from datetime import datetime, timedelta
import csv
import io
import json
import sys
import zipfile

# Below this, the book is not describing this feed and its matches are
# coincidence. A book from the booking in force sits well above 80%.
MIN_MATCH_RATE = 0.5

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"]
DAY_COLUMNS = {
    "Weekdays": WEEKDAYS,
    "Saturday": ["saturday"],
    "Sunday": ["sunday"],
}


def hhmm(value):
    """GTFS runs past 24:00 for trips after midnight; the book restarts at 0."""
    hours, minutes, *_ = value.split(":")
    return f"{int(hours) % 24:02d}:{int(minutes):02d}"


def book_effective(book):
    """The book's own effective date as yyyymmdd, or None if unreadable."""
    try:
        return datetime.strptime(book["effective"].strip(), "%B %d, %Y").strftime("%Y%m%d")
    except (KeyError, ValueError):
        return None


def read_gtfs(path):
    archive = zipfile.ZipFile(path)

    def rows(name):
        return csv.DictReader(
            io.TextIOWrapper(archive.open(name), encoding="utf-8-sig")
        )

    short_name = {
        r["route_id"]: r["route_short_name"] or r["route_id"] for r in rows("routes.txt")
    }
    calendar = {r["service_id"]: r for r in rows("calendar.txt")}
    # Exceptions: a service added to (1) or removed from (2) one date.
    exceptions = collections.defaultdict(dict)
    try:
        for r in rows("calendar_dates.txt"):
            exceptions[r["date"]][r["service_id"]] = r["exception_type"]
    except KeyError:
        pass
    info = next(rows("feed_info.txt"))

    trips = {}
    for r in rows("trips.txt"):
        trips[r["trip_id"]] = (
            short_name.get(r["route_id"], r["route_id"]),
            r["block_id"],
            r["service_id"],
        )

    # stop_times.txt is ~200 MB, so it is streamed and only the earliest stop
    # of each trip is kept.
    first = {}
    with archive.open("stop_times.txt") as handle:
        reader = csv.reader(io.TextIOWrapper(handle, encoding="utf-8-sig"))
        header = next(reader)
        trip_i = header.index("trip_id")
        seq_i = header.index("stop_sequence")
        dep_i = header.index("departure_time")
        for row in reader:
            trip = row[trip_i]
            seq = int(row[seq_i])
            held = first.get(trip)
            if held is None or seq < held[0]:
                first[trip] = (seq, row[dep_i])

    return short_name, calendar, exceptions, trips, first, info


DAY_INDEX = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def dates_in(info, column):
    """Every date in the feed's window that falls on this weekday."""
    start = datetime.strptime(info["feed_start_date"], "%Y%m%d")
    end = datetime.strptime(info["feed_end_date"], "%Y%m%d")
    out = []
    day = start
    while day <= end:
        if day.weekday() == DAY_INDEX[column]:
            out.append(day.strftime("%Y%m%d"))
        day += timedelta(days=1)
    return out


def services_on(date, column, calendar, exceptions):
    """
    The services actually running on one date.

    Gathering every service that overlaps the feed's whole window instead put
    several weeks of variants together, and a block appearing under two of
    them with different trips reads as a disagreement about the paddle's day -
    so the paddle went unplaced. One real date is one coherent day of work.
    """
    on = set()
    for service, row in calendar.items():
        if row[column] == "1" and row["start_date"] <= date <= row["end_date"]:
            on.add(service)
    for service, kind in exceptions.get(date, {}).items():
        if kind == "1":
            on.add(service)
        elif kind == "2":
            on.discard(service)
    return on


def blocks_for(services, trips, first):
    """block -> the (route, start time) of every trip it runs that day."""
    out = collections.defaultdict(list)
    for trip_id, (route, block, service) in trips.items():
        if service not in services or trip_id not in first:
            continue
        out[(block, service)].append((hhmm(first[trip_id][1]), route, trip_id))
    return out


def match(book, day_blocks):
    """
    Paddle number -> the block keys describing its day, where it can be placed.

    An exact signature match first: every trip in the paddle, by route and
    start time, against every trip in the block. Where that fails - a paddle
    whose first printed timepoint is not the trip's first stop, say - blocks
    sharing at least four fifths of the paddle's trips are taken, provided
    they all describe the same day of work.
    """
    signatures = {}
    for paddle in book["paddles"]:
        signatures[paddle["p"]] = tuple(
            sorted((route, hhmm(stops[0][0])) for route, _, _, stops in paddle["t"] if stops)
        )

    by_signature = collections.defaultdict(list)
    block_sets = {}
    for key, trips in day_blocks.items():
        signature = tuple(sorted((route, start) for start, route, _ in trips))
        by_signature[signature].append(key)
        block_sets[key] = set(signature)

    # A block is repeated under every service id it runs on - Saturday alone
    # has 1,241 block records for 437 paddles - so several keys can describe
    # the same day of work. Keys sharing a signature are the same block and
    # are all kept; only a genuine disagreement about which trips the paddle
    # works is treated as ambiguous.
    matched, exact = {}, 0
    for paddle, signature in signatures.items():
        hits = by_signature.get(signature, [])
        if hits:
            matched[paddle] = hits
            exact += 1

    for paddle, signature in signatures.items():
        if paddle in matched or not signature:
            continue
        want = set(signature)
        scored = [
            (len(want & have) / len(want), key) for key, have in block_sets.items()
        ]
        best = max((s for s, _ in scored), default=0)
        if best < 0.8:
            continue
        winners = [key for score, key in scored if score == best]
        shapes = {tuple(sorted(block_sets[key])) for key in winners}
        if len(shapes) == 1:
            matched[paddle] = winners

    return matched, exact, len(signatures)


def main():
    if len(sys.argv) < 3:
        print(__doc__.strip())
        raise SystemExit(2)

    gtfs_path, *book_paths = sys.argv[1:]
    short_name, calendar, exceptions, trips, first, info = read_gtfs(gtfs_path)
    print(f"{len(trips)} trips, feed {info['feed_version']} "
          f"{info['feed_start_date']}-{info['feed_end_date']}")

    trip_to_paddle = {}
    for book_path in book_paths:
        book = json.load(open(book_path))
        columns = DAY_COLUMNS.get(book["dayType"])
        if not columns:
            print(f"  {book_path}: day type {book['dayType']!r} not handled, skipped")
            continue

        # A book that has not come into force by the end of the feed cannot
        # describe it. This used to demand the effective date fall *inside*
        # the feed window, which is only true when the feed spans the whole
        # booking; a feed covering a slice of one - published mid-booking,
        # running a few weeks either side of today - would reject the very
        # book in force, and did.
        #
        # What remains is that the book must have started. A stale book is
        # caught below by how badly it matches, which is the direct evidence
        # rather than a proxy for it.
        effective = book_effective(book)
        if not effective or effective > info["feed_end_date"]:
            print(f"  {book_path}: effective {book['effective']} has not begun by "
                  f"the end of this feed ({info['feed_end_date']}), skipped")
            continue

        placed = set()
        book_matched = 0
        book_total = 0
        found = {}
        for column in columns:
            # Each real date of this weekday is tried, and the one describing
            # the book best is the one used. Service changes part way through
            # a feed otherwise leave whichever weeks disagree unplaceable.
            best = None
            for date in dates_in(info, column):
                services = services_on(date, column, calendar, exceptions)
                if not services:
                    continue
                day_blocks = blocks_for(services, trips, first)
                if not day_blocks:
                    continue
                matched, exact, total = match(book, day_blocks)
                if best is None or len(matched) > len(best[1]):
                    best = (date, matched, exact, total, day_blocks)
            if best is None:
                continue
            date, matched, exact, total, day_blocks = best
            book_matched = max(book_matched, len(matched))
            book_total = max(book_total, total)
            for paddle, keys in matched.items():
                placed.add(paddle)
                for key in keys:
                    for _, _, trip_id in day_blocks[key]:
                        found[trip_id] = paddle
            print(f"  {book['dayType']:9} {column:9} {exact} exact, "
                  f"{len(matched)} of {total} placed (best date {date})")

        # How well the book describes the feed is the real test of whether it
        # belongs to it. A book from the booking in force matches most of its
        # paddles; one from another period matches a scattering of them by
        # coincidence, and a wrong bus number presented as certain is worse
        # than no bus number at all.
        rate = book_matched / book_total if book_total else 0
        if rate < MIN_MATCH_RATE:
            print(f"  {book_path}: only {book_matched} of {book_total} paddles "
                  f"({rate:.0%}) match this feed - too few to trust, skipped")
            continue

        trip_to_paddle.update(found)
        print(f"  {book_path}: {len(placed)} distinct paddles tied to a block "
              f"({rate:.0%})")

    # feed_end_date can reach past the last day any service actually runs -
    # this feed says 20260907 while every service stops on 20260829. Trusting
    # the later date would have the app believe the mapping covers days it
    # describes no trips for, so the earlier of the two is used.
    last_service = max((c["end_date"] for c in calendar.values()), default="")
    end = min(info["feed_end_date"], last_service) if last_service else info["feed_end_date"]
    if end != info["feed_end_date"]:
        print(f"  feed claims {info['feed_end_date']} but no service runs past "
              f"{end}; the mapping is marked valid to {end}")

    out = {
        "source": "OC Transpo GTFS, City of Ottawa open data",
        "version": info["feed_version"],
        "start": info["feed_start_date"],
        "end": end,
        # Realtime feeds report route_id, which is not always the number on
        # the bus - route 10 is served by route_id "10" and "10-371-1" both.
        "routes": {k: v for k, v in short_name.items() if k != v},
        "trips": trip_to_paddle,
    }
    json.dump(out, open("public/paddle-trips.json", "w"), separators=(",", ":"))
    print(f"wrote public/paddle-trips.json: {len(trip_to_paddle)} trips, "
          f"{len(out['routes'])} route aliases")


if __name__ == "__main__":
    main()
