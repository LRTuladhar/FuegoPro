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
from typing import Optional

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
# Regime classification helpers
# ---------------------------------------------------------------------------

def _classify_window(returns: np.ndarray, start: int) -> str:
    """
    Classify a 12-month window starting at 'start' as 'bear' or 'bull'.

    Bear: compounded annual return < 0%
    Bull: compounded annual return >= 0%
    """
    if start + 12 > len(returns):
        return None  # window overruns array
    compounded = np.prod(1.0 + returns[start : start + 12]) - 1.0
    return "bear" if compounded < 0.0 else "bull"


def _compute_regime_indices(returns: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Classify all valid 12-month windows in the historical data as bear or bull.
    Return two arrays of start indices — one for each regime.
    """
    max_start = len(returns) - 12
    bear_starts = []
    bull_starts = []

    for start in range(max_start + 1):
        regime = _classify_window(returns, start)
        if regime == "bear":
            bear_starts.append(start)
        else:
            bull_starts.append(start)

    return np.array(bear_starts, dtype=int), np.array(bull_starts, dtype=int)


def _compute_transition_probabilities(returns: np.ndarray) -> tuple[float, float]:
    """
    Compute Markov chain transition probabilities from non-overlapping annual windows.

    Returns:
        (P_BULL_STAY, P_BEAR_STAY)
        - P_BULL_STAY: P(next=bull | current=bull)
        - P_BEAR_STAY: P(next=bear | current=bear)
    """
    max_start = len(returns) - 12

    # Classify non-overlapping annual windows (0-11, 12-23, 24-35, ...)
    annual_regimes = []
    for start in range(0, max_start + 1, 12):
        regime = _classify_window(returns, start)
        if regime:
            annual_regimes.append(regime)

    if len(annual_regimes) < 2:
        # Not enough data; return neutral defaults
        return 0.5, 0.5

    # Count consecutive-pair transitions
    bull_to_bull = 0
    bull_to_bear = 0
    bear_to_bull = 0
    bear_to_bear = 0

    for i in range(len(annual_regimes) - 1):
        current = annual_regimes[i]
        next_regime = annual_regimes[i + 1]

        if current == "bull":
            if next_regime == "bull":
                bull_to_bull += 1
            else:
                bull_to_bear += 1
        else:  # current == "bear"
            if next_regime == "bear":
                bear_to_bear += 1
            else:
                bear_to_bull += 1

    # Avoid division by zero
    p_bull_stay = bull_to_bull / (bull_to_bull + bull_to_bear) if (bull_to_bull + bull_to_bear) > 0 else 0.5
    p_bear_stay = bear_to_bear / (bear_to_bear + bear_to_bull) if (bear_to_bear + bear_to_bull) > 0 else 0.5

    return p_bull_stay, p_bear_stay


# ---------------------------------------------------------------------------
# Module-level store — loaded once at server startup
# ---------------------------------------------------------------------------

MONTHLY_RETURNS: np.ndarray = _load_returns(_DATA_FILE)
BEAR_START_INDICES: np.ndarray
BULL_START_INDICES: np.ndarray
P_BULL_STAY: float
P_BEAR_STAY: float

# Compute regime indices and transition probabilities
BEAR_START_INDICES, BULL_START_INDICES = _compute_regime_indices(MONTHLY_RETURNS)
P_BULL_STAY, P_BEAR_STAY = _compute_transition_probabilities(MONTHLY_RETURNS)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_monthly_returns() -> np.ndarray:
    """Return the full array of monthly decimal returns (oldest first)."""
    return MONTHLY_RETURNS


def sample_annual_returns(
    years: int, rng: np.random.Generator, first_year_regime: Optional[str] = None
) -> np.ndarray:
    """
    Draw *years* annual returns by randomly sampling 12-month blocks from the
    historical monthly return array.

    If first_year_regime is 'bear' or 'bull', the first year samples from the
    corresponding regime pool, and subsequent years follow a Markov chain with
    historically-calibrated transition probabilities.

    If first_year_regime is None, all years use simple block bootstrap (random
    sampling from the full historical range), preserving backward compatibility.

    Parameters
    ----------
    years : int
        Number of annual returns to produce.
    rng : np.random.Generator
        Caller-supplied generator (e.g. np.random.default_rng(seed)).
    first_year_regime : str | None
        One of: 'bear', 'bull', or None.
        If 'bear' or 'bull', enforces that regime in year 0 and uses Markov chain
        for transitions in years 1+.
        If None, uses unconstrained random sampling for all years (default behavior).

    Returns
    -------
    np.ndarray of shape (years,) with dtype float64.
    Each element is a decimal annual return (e.g. 0.12 = 12%).
    """
    if years == 0:
        return np.empty(0, dtype=np.float64)

    annual = np.empty(years, dtype=np.float64)

    # If no regime specified, use traditional block bootstrap
    if first_year_regime is None:
        n = len(MONTHLY_RETURNS)
        max_start = n - 12
        starts = rng.integers(0, max_start + 1, size=years)
        for i, start in enumerate(starts):
            annual[i] = np.prod(1.0 + MONTHLY_RETURNS[start : start + 12]) - 1.0
        return annual

    # Regime-based sampling with Markov chain transitions
    if first_year_regime not in ("bear", "bull"):
        raise ValueError(f"first_year_regime must be 'bear', 'bull', or None; got {first_year_regime}")

    # Ensure regime pools are not empty (safety check)
    if len(BEAR_START_INDICES) == 0 or len(BULL_START_INDICES) == 0:
        # Degenerate case: fall back to unconstrained sampling
        return sample_annual_returns(years, rng, first_year_regime=None)

    regime = first_year_regime

    for year in range(years):
        # Choose start index from the current regime's pool
        if regime == "bear":
            idx_pool = BEAR_START_INDICES
        else:  # regime == "bull"
            idx_pool = BULL_START_INDICES

        # Randomly select a start index from this regime's pool
        pool_idx = rng.integers(0, len(idx_pool))
        start = idx_pool[pool_idx]

        # Compute the annual return for this year
        annual[year] = np.prod(1.0 + MONTHLY_RETURNS[start : start + 12]) - 1.0

        # Transition to next year's regime via Markov chain
        if year < years - 1:  # Don't bother computing next regime on the last year
            if regime == "bull":
                regime = "bull" if rng.random() < P_BULL_STAY else "bear"
            else:  # regime == "bear"
                regime = "bear" if rng.random() < P_BEAR_STAY else "bull"

    return annual
