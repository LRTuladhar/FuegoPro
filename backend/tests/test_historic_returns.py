"""
Unit tests for backend/data/historic_returns.py

Run from the backend/ directory:
    python -m pytest tests/test_historic_returns.py -v
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pytest

from data.historic_returns import (
    MONTHLY_RETURNS,
    get_monthly_returns,
    sample_annual_returns,
)


class TestMonthlyReturnsArray:
    def test_array_is_nonempty(self):
        assert len(MONTHLY_RETURNS) > 0

    def test_expected_row_count(self):
        # 672 data rows in historic-monthly.txt (673 lines minus 1 header)
        assert len(MONTHLY_RETURNS) == 672

    def test_dtype_is_float64(self):
        assert MONTHLY_RETURNS.dtype == np.float64

    def test_values_are_decimal_fractions_not_percentages(self):
        # A value of e.g. 1.37 would mean 137% — implausible
        assert np.all(np.abs(MONTHLY_RETURNS) < 1.0)

    def test_values_within_plausible_monthly_range(self):
        # Worst S&P 500 month ~−26% (Oct 1987); best ~+16% (Oct 1974 recovery)
        assert np.all(MONTHLY_RETURNS > -0.30)
        assert np.all(MONTHLY_RETURNS < 0.25)

    def test_mean_is_positive(self):
        # Long-run monthly average should be modestly positive
        assert MONTHLY_RETURNS.mean() > 0

    def test_get_monthly_returns_matches_module_array(self):
        np.testing.assert_array_equal(get_monthly_returns(), MONTHLY_RETURNS)

    def test_no_nan_or_inf(self):
        assert np.all(np.isfinite(MONTHLY_RETURNS))


class TestSampleAnnualReturns:
    def test_correct_output_length(self):
        rng = np.random.default_rng(42)
        assert len(sample_annual_returns(30, rng)) == 30

    def test_zero_years_returns_empty_array(self):
        rng = np.random.default_rng(0)
        result = sample_annual_returns(0, rng)
        assert len(result) == 0
        assert result.dtype == np.float64

    def test_dtype_is_float64(self):
        rng = np.random.default_rng(0)
        assert sample_annual_returns(10, rng).dtype == np.float64

    def test_values_within_plausible_annual_range(self):
        # Over 1000 draws no single year should be below -70% or above +100%
        rng = np.random.default_rng(7)
        result = sample_annual_returns(1000, rng)
        assert np.all(result > -0.70)
        assert np.all(result < 1.00)

    def test_no_nan_or_inf(self):
        rng = np.random.default_rng(3)
        assert np.all(np.isfinite(sample_annual_returns(500, rng)))

    def test_same_seed_reproducible(self):
        r1 = sample_annual_returns(30, np.random.default_rng(99))
        r2 = sample_annual_returns(30, np.random.default_rng(99))
        np.testing.assert_array_equal(r1, r2)

    def test_different_seeds_differ(self):
        r1 = sample_annual_returns(30, np.random.default_rng(1))
        r2 = sample_annual_returns(30, np.random.default_rng(2))
        assert not np.array_equal(r1, r2)

    def test_single_year(self):
        rng = np.random.default_rng(5)
        result = sample_annual_returns(1, rng)
        assert result.shape == (1,)
        assert np.isfinite(result[0])

    def test_long_run_mean_near_historical_average(self):
        # Over many draws the mean annual return should be near the historical
        # geometric mean (~7–10% real). Using nominal returns here so expecting ~10%.
        rng = np.random.default_rng(0)
        result = sample_annual_returns(50_000, rng)
        assert 0.05 < result.mean() < 0.18
