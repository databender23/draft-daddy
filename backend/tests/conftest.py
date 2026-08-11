"""Pin tests to the archived 2025 projections file.

The live backend/data/projections.csv changes every season, but several
matching tests encode facts about a specific player pool (who exists, which
names could collide). Pointing DATA_PATH at the archived season keeps the
suite deterministic no matter what data is currently installed.

Must run before any `app.*` import — players.py reads DATA_PATH at import time.
"""

import os
from pathlib import Path

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "data-pipeline"
    / "output"
    / "fantasyFootball_vor_2025.csv"
)
assert FIXTURE.is_file(), f"test fixture missing: {FIXTURE}"
os.environ["DATA_PATH"] = str(FIXTURE)
