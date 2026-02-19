"""
Historical S&P 500 monthly return loader.

Parses historic-monthly.txt (tab-separated, newest-first) once at module
import time and exposes the data as a NumPy array for use by the Monte Carlo
simulation engine.

File format (tab-separated, header on line 1):
    Date          Price       Change %
    Jan 01, 2026  6,939.03    1.37%
    ...

The file lives in the project root (one level above backend/).
"""

import os

import numpy as np

# ---------------------------------------------------------------------------
# File location
# ---------------------------------------------------------------------------

# backend/data/ → ../../ → project root
_DATA_FILE = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "historic-monthly.txt")
)


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def _load_returns(path: str) -> np.ndarray:
    """
    Read the file and return monthly decimal returns as a 1-D float64 array.

    Skips the header row and any malformed lines.
    The file is newest-first; the returned array is reversed to oldest-first
    so index 0 is the earliest observation.
    """
    returns = []
    with open(path, "r") as fh:
        for line_num, line in enumerate(fh):
            if line_num == 0:
                continue  # skip header
            parts = line.strip().split("\t")
            if len(parts) < 3:
                continue
            pct_str = parts[2].strip().rstrip("%")
            try:
                returns.append(float(pct_str) / 100.0)
            except ValueError:
                continue  # skip any unparseable rows

    # Reverse so oldest month is at index 0
    return np.array(returns[::-1], dtype=np.float64)


# ---------------------------------------------------------------------------
# Module-level store — loaded once at server startup
# ---------------------------------------------------------------------------

MONTHLY_RETURNS: np.ndarray = _load_returns(_DATA_FILE)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_monthly_returns() -> np.ndarray:
    """Return the full array of monthly decimal returns (oldest first)."""
    return MONTHLY_RETURNS


def sample_annual_returns(years: int, rng: np.random.Generator) -> np.ndarray:
    """
    Draw *years* annual returns by randomly sampling 12-month blocks from the
    historical monthly return array (block bootstrap).

    For each simulated year a random start index is chosen and the product of
    the next 12 consecutive monthly (1 + r) factors gives that year's return.
    Using consecutive months preserves short-term autocorrelation present in
    real market data.

    Parameters
    ----------
    years : int
        Number of annual returns to produce.
    rng : np.random.Generator
        Caller-supplied generator (e.g. np.random.default_rng(seed)).
        Passing in the generator lets the caller control seeding and keeps
        this function pure / testable.

    Returns
    -------
    np.ndarray of shape (years,) with dtype float64.
    Each element is a decimal annual return (e.g. 0.12 = 12%).
    """
    if years == 0:
        return np.empty(0, dtype=np.float64)

    n = len(MONTHLY_RETURNS)
    max_start = n - 12  # last valid 12-month window start

    starts = rng.integers(0, max_start + 1, size=years)
    annual = np.empty(years, dtype=np.float64)
    for i, start in enumerate(starts):
        annual[i] = np.prod(1.0 + MONTHLY_RETURNS[start : start + 12]) - 1.0

    return annual
