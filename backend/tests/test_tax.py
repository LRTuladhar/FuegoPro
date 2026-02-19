"""
Unit tests for backend/services/tax.py

Run from the backend/ directory:
    python -m pytest tests/test_tax.py -v

All expected values were hand-calculated against IRS 2024 tax tables.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from services.tax import (
    calculate_federal_tax,
    calculate_state_tax,
    calculate_ss_taxable_fraction,
)


# ---------------------------------------------------------------------------
# calculate_federal_tax — ordinary income only
# ---------------------------------------------------------------------------

class TestFederalOrdinary:
    def test_zero_income(self):
        assert calculate_federal_tax(0, 0, "single") == 0.0

    def test_below_standard_deduction(self):
        # $10,000 ordinary < $14,600 deduction → $0 taxable
        assert calculate_federal_tax(10_000, 0, "single") == 0.0

    def test_single_10pct_band(self):
        # $20,000 ordinary − $14,600 deduction = $5,400 taxable → 10% bracket
        tax = calculate_federal_tax(20_000, 0, "single")
        assert pytest.approx(tax, abs=1) == 540.0

    def test_single_spans_two_bands(self):
        # $60,000 − $14,600 = $45,400 taxable
        # 10% on $11,600  = $1,160
        # 12% on $33,800  = $4,056
        # total           = $5,216
        tax = calculate_federal_tax(60_000, 0, "single")
        assert pytest.approx(tax, abs=1) == 5_216.0

    def test_married_standard_deduction(self):
        # $25,000 ordinary − $29,200 deduction = $0 taxable
        assert calculate_federal_tax(25_000, 0, "married") == 0.0

    def test_married_spans_two_bands(self):
        # $100,000 − $29,200 = $70,800 taxable
        # 10% on $23,200 = $2,320
        # 12% on $47,600 = $5,712
        # total          = $8,032
        tax = calculate_federal_tax(100_000, 0, "married")
        assert pytest.approx(tax, abs=1) == 8_032.0

    def test_negative_income_returns_zero(self):
        assert calculate_federal_tax(-5_000, 0, "single") == 0.0


# ---------------------------------------------------------------------------
# calculate_federal_tax — LTCG stacking
# ---------------------------------------------------------------------------

class TestFederalLTCG:
    def test_ltcg_all_in_zero_pct_band_single(self):
        # ordinary = $30,000 → taxable ordinary = $15,400
        # LTCG $5,000 stacked: $15,400 + $5,000 = $20,400 < $47,025 → all at 0%
        tax = calculate_federal_tax(30_000, 5_000, "single")
        ordinary_only = calculate_federal_tax(30_000, 0, "single")
        assert pytest.approx(tax, abs=0.01) == ordinary_only  # no extra LTCG tax

    def test_ltcg_spans_zero_and_15pct_single(self):
        # ordinary = $55,000 → taxable ordinary = $40,400
        # 0% LTCG ceiling = $47,025
        # LTCG $20,000: $6,625 at 0%, $13,375 at 15%
        ordinary_tax = calculate_federal_tax(55_000, 0, "single")
        total_tax    = calculate_federal_tax(55_000, 20_000, "single")
        ltcg_tax = total_tax - ordinary_tax
        assert pytest.approx(ltcg_tax, abs=1) == 13_375 * 0.15

    def test_ltcg_all_at_15pct_when_ordinary_exceeds_zero_band(self):
        # Single, ordinary = $200,000 → taxable ordinary = $185,400, above 0% LTCG ceiling
        # All LTCG taxed at 15%
        ordinary_tax = calculate_federal_tax(200_000, 0, "single")
        total_tax    = calculate_federal_tax(200_000, 10_000, "single")
        assert pytest.approx(total_tax - ordinary_tax, abs=1) == 1_500.0

    def test_zero_ltcg_income(self):
        t1 = calculate_federal_tax(80_000, 0, "single")
        t2 = calculate_federal_tax(80_000, 0, "married")
        assert t1 > 0
        assert t2 > 0


# ---------------------------------------------------------------------------
# calculate_state_tax
# ---------------------------------------------------------------------------

class TestStateTax:
    def test_none_state(self):
        assert calculate_state_tax(100_000, "none", None, "single") == 0.0

    def test_moderate_flat_rate(self):
        # 5% flat on $80,000
        tax = calculate_state_tax(80_000, "moderate", 0.05, "single")
        assert pytest.approx(tax, abs=0.01) == 4_000.0

    def test_moderate_zero_rate(self):
        assert calculate_state_tax(50_000, "moderate", 0.0, "single") == 0.0

    def test_moderate_none_rate_treated_as_zero(self):
        assert calculate_state_tax(50_000, "moderate", None, "single") == 0.0

    def test_california_below_deduction(self):
        # $5,000 < CA single deduction of $5,202 → $0 tax
        assert calculate_state_tax(5_000, "california", None, "single") == 0.0

    def test_california_first_band_single(self):
        # $15,000 − $5,202 = $9,798 taxable → all in 1% band → $97.98
        tax = calculate_state_tax(15_000, "california", None, "single")
        assert pytest.approx(tax, abs=0.10) == 97.98

    def test_california_spans_bands_single(self):
        # $30,000 − $5,202 = $24,798 taxable
        # 1% on $10,412 = $104.12
        # 2% on $14,272 = $285.44  ($24,684 − $10,412 = $14,272)
        # 4% on $114    = $4.56    ($24,798 − $24,684 = $114)
        # total ≈ $394.12
        tax = calculate_state_tax(30_000, "california", None, "single")
        assert pytest.approx(tax, abs=1) == 394.12

    def test_california_married_higher_deduction(self):
        # $10,000 < $10,404 MFJ CA deduction → $0
        assert calculate_state_tax(10_000, "california", None, "married") == 0.0

    def test_unknown_state_type_returns_zero(self):
        assert calculate_state_tax(100_000, "unknown", None, "single") == 0.0


# ---------------------------------------------------------------------------
# calculate_ss_taxable_fraction
# ---------------------------------------------------------------------------

class TestSSTaxableFraction:
    def test_single_below_threshold(self):
        assert calculate_ss_taxable_fraction(20_000, "single") == 0.0

    def test_single_at_lower_threshold(self):
        assert calculate_ss_taxable_fraction(25_000, "single") == 0.0

    def test_single_between_thresholds(self):
        assert calculate_ss_taxable_fraction(30_000, "single") == 0.5

    def test_single_at_upper_threshold(self):
        assert calculate_ss_taxable_fraction(34_000, "single") == 0.5

    def test_single_above_upper_threshold(self):
        assert calculate_ss_taxable_fraction(50_000, "single") == 0.85

    def test_married_below_threshold(self):
        assert calculate_ss_taxable_fraction(30_000, "married") == 0.0

    def test_married_between_thresholds(self):
        assert calculate_ss_taxable_fraction(38_000, "married") == 0.5

    def test_married_above_upper_threshold(self):
        assert calculate_ss_taxable_fraction(60_000, "married") == 0.85

    def test_zero_income(self):
        assert calculate_ss_taxable_fraction(0, "single") == 0.0
