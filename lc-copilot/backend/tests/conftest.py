import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.config import SHARED


@pytest.fixture
def base_credit() -> dict:
    data = json.loads((SHARED / "seed-credits.json").read_text())
    credit = next(c for c in data["credits"] if c["ref"] == "DC-2025-04781")
    return {**data["base"], **credit["overrides"]}
