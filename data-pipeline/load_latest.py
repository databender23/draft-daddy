#!/usr/bin/env python3
"""Validate the newest projections CSV in output/ and install it into the app.

Usage:
    python3 load_latest.py            # newest output/*.csv -> ../backend/data/projections.csv
    python3 load_latest.py <file.csv> # load a specific file instead
"""

import csv
import shutil
import sys
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = PIPELINE_DIR / "output"
TARGET = PIPELINE_DIR.parent / "backend" / "data" / "projections.csv"

REQUIRED_COLUMNS = {
    "avg_type", "id", "pos", "points", "sd_pts", "floor", "ceiling",
    "points_vor", "floor_vor", "ceiling_vor", "rank", "pos_rank", "tier",
    "overall_ecr", "adp", "adp_diff", "aav", "uncertainty",
    "first_name", "last_name", "team", "position", "scoring_type",
}
SCORING_TYPES = {"PPR", "Half-PPR", "Non-PPR"}
AVG_TYPES = {"average", "robust", "weighted"}
POSITIONS = {"QB", "RB", "WR", "TE", "DST", "K"}
MIN_ROWS_PER_SCORING = 1000


def newest_csv() -> Path:
    candidates = sorted(OUTPUT_DIR.glob("*.csv"), key=lambda p: p.stat().st_mtime)
    if not candidates:
        sys.exit(f"No CSV files found in {OUTPUT_DIR}")
    return candidates[-1]


def validate(path: Path) -> dict:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - columns
        if missing:
            sys.exit(f"FAIL: {path.name} is missing required columns: {sorted(missing)}")
        rows = list(reader)

    counts: dict = {}
    positions_seen: dict = {}
    for row in rows:
        key = (row["scoring_type"], row["avg_type"])
        counts[key] = counts.get(key, 0) + 1
        positions_seen.setdefault(row["scoring_type"], set()).add(row["pos"])

    scorings = {key[0] for key in counts}
    if scorings != SCORING_TYPES:
        sys.exit(f"FAIL: expected scoring types {sorted(SCORING_TYPES)}, found {sorted(scorings)}")
    avgs = {key[1] for key in counts}
    if not AVG_TYPES <= avgs:
        sys.exit(f"FAIL: expected avg types {sorted(AVG_TYPES)}, found {sorted(avgs)}")

    for scoring in SCORING_TYPES:
        total = sum(n for (s, _), n in counts.items() if s == scoring)
        if total < MIN_ROWS_PER_SCORING:
            sys.exit(f"FAIL: only {total} rows for {scoring} (expected >= {MIN_ROWS_PER_SCORING})")
        missing_pos = POSITIONS - positions_seen.get(scoring, set())
        if missing_pos:
            print(f"WARN: {scoring} slice is missing positions {sorted(missing_pos)} "
                  "(the app backfills whole positions from the 'average' slice)")

    top = sorted(
        (r for r in rows if r["scoring_type"] == "PPR" and r["avg_type"] == "average"),
        key=lambda r: float(r["points_vor"] or "-inf"),
        reverse=True,
    )[:5]
    return {"rows": len(rows), "counts": counts, "top": top}


def main() -> None:
    source = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else newest_csv()
    print(f"Loading {source.name} ({source.stat().st_size // 1024} KB)")

    report = validate(source)
    print(f"OK: {report['rows']} rows")
    for (scoring, avg), n in sorted(report["counts"].items()):
        print(f"  {scoring:9s} / {avg:8s}: {n} players")
    print("Top 5 by VOR (PPR/average):")
    for row in report["top"]:
        print(f"  {row['first_name']} {row['last_name']:16s} {row['pos']:3s} "
              f"{row['team']:4s} VOR {float(row['points_vor']):.1f}")

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, TARGET)
    print(f"Installed -> {TARGET}")
    print("Restart the backend (or rebuild the Docker image) to serve the new data.")


if __name__ == "__main__":
    main()
