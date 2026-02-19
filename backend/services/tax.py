"""
Tax calculation functions for the FuegoPro simulation engine.

All functions are pure (no I/O, no side effects) so they are easy to unit-test
and can be called in a tight Monte Carlo loop without performance concerns.

filing_status values: 'single' | 'married'
state_type values:    'none'   | 'moderate' | 'california'
"""

from typing import Optional

from config.tax_brackets import (
    CA_BRACKETS,
    CA_STANDARD_DEDUCTION,
    FEDERAL_LTCG,
    FEDERAL_ORDINARY,
    FEDERAL_STANDARD_DEDUCTION,
    SS_THRESHOLDS,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _progressive_tax(income: float, brackets: list) -> float:
    """
    Apply a progressive bracket schedule to *income*.

    brackets: list of (rate, upper_bound) sorted by upper_bound ascending.
    The final entry must have upper_bound = float('inf').
    """
    tax = 0.0
    prev_ceiling = 0.0
    for rate, ceiling in brackets:
        if income <= prev_ceiling:
            break
        taxable_in_band = min(income, ceiling) - prev_ceiling
        tax += taxable_in_band * rate
        prev_ceiling = ceiling
    return tax


def _ltcg_tax(taxable_ordinary: float, ltcg_income: float, brackets: list) -> float:
    """
    Tax LTCG income using the stacking method.

    LTCG is stacked on top of taxable ordinary income when determining which
    LTCG rate applies.  Each dollar of LTCG that falls within a given LTCG
    bracket is taxed at that bracket's rate.

    Example: taxable_ordinary=$40,000, ltcg=$20,000, single filer (2024)
      - 0% LTCG bracket ceiling = $47,025
      - $7,025 of LTCG falls below the ceiling → taxed at 0%
      - $12,975 falls above the ceiling → taxed at 15%
    """
    if ltcg_income <= 0:
        return 0.0

    tax = 0.0
    ltcg_start = taxable_ordinary          # where LTCG begins in the stack
    ltcg_end   = taxable_ordinary + ltcg_income

    prev_ceiling = 0.0
    for rate, ceiling in brackets:
        bracket_start = max(ltcg_start, prev_ceiling)
        bracket_end   = min(ltcg_end, ceiling)
        if bracket_end > bracket_start:
            tax += (bracket_end - bracket_start) * rate
        prev_ceiling = ceiling
        if ltcg_end <= ceiling:
            break

    return tax


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_federal_tax(
    ordinary_income: float,
    ltcg_income: float,
    filing_status: str,
) -> float:
    """
    Return total federal income tax (ordinary + LTCG) for the year.

    ordinary_income: gross ordinary income (wages, SS, RMDs, pensions, etc.)
                     before any deductions.
    ltcg_income:     net long-term capital gains / qualified dividends.
    filing_status:   'single' | 'married'

    The 2024 standard deduction is subtracted from ordinary income before
    applying brackets.  LTCG is then stacked on top of taxable ordinary income
    to determine the applicable LTCG rate.
    """
    deduction       = FEDERAL_STANDARD_DEDUCTION[filing_status]
    taxable_ordinary = max(0.0, ordinary_income - deduction)

    ordinary_tax = _progressive_tax(taxable_ordinary, FEDERAL_ORDINARY[filing_status])
    ltcg_tax     = _ltcg_tax(taxable_ordinary, max(0.0, ltcg_income), FEDERAL_LTCG[filing_status])

    return ordinary_tax + ltcg_tax


def calculate_state_tax(
    ordinary_income: float,
    state_type: str,
    flat_rate: Optional[float],
    filing_status: str,
) -> float:
    """
    Return state income tax for the year.

    ordinary_income: gross ordinary income (same as passed to federal calc).
    state_type:      'none' | 'moderate' | 'california'
    flat_rate:       decimal rate for 'moderate' states (e.g. 0.05 = 5%).
                     Ignored for other state types.
    filing_status:   'single' | 'married'

    Note: LTCG is not separately passed here.  California taxes LTCG as
    ordinary income (no preferential rate), so callers should include LTCG
    in ordinary_income when computing California tax.  For 'moderate' flat-rate
    states, the caller decides what to include.
    """
    if state_type == "none":
        return 0.0

    if state_type == "moderate":
        rate = flat_rate or 0.0
        return max(0.0, ordinary_income) * rate

    if state_type == "california":
        deduction = CA_STANDARD_DEDUCTION[filing_status]
        taxable   = max(0.0, ordinary_income - deduction)
        return _progressive_tax(taxable, CA_BRACKETS[filing_status])

    return 0.0


def calculate_ss_taxable_fraction(
    combined_income: float,
    filing_status: str,
) -> float:
    """
    Return the fraction of Social Security benefits that are taxable (0, 0.5,
    or 0.85) based on IRS provisional income thresholds.

    combined_income (provisional income) =
        non-SS AGI + tax-exempt interest + 0.5 × annual SS benefit

    The caller is responsible for computing provisional income before calling
    this function.  The returned fraction is then multiplied by the annual SS
    benefit to obtain the taxable portion.

    IRS thresholds (2024, not inflation-adjusted by law):
      Single:  $25,000 / $34,000
      Married: $32,000 / $44,000
    """
    lower, upper = SS_THRESHOLDS[filing_status]

    if combined_income <= lower:
        return 0.0
    if combined_income <= upper:
        return 0.5
    return 0.85
