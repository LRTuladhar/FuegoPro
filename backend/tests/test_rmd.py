"""
Unit tests for backend/services/rmd.py

Run from the backend/ directory:
    python -m pytest tests/test_rmd.py -v
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from services.rmd import calculate_rmd, get_life_expectancy_factor, RMD_START_AGE


class TestGetLifeExpectancyFactor:
    def test_age_72(self):
        assert get_life_expectancy_factor(72) == 27.4

    def test_age_73(self):
        assert get_life_expectancy_factor(73) == 26.5

    def test_age_80(self):
        assert get_life_expectancy_factor(80) == 20.2

    def test_age_90(self):
        assert get_life_expectancy_factor(90) == 12.2

    def test_age_100(self):
        assert get_life_expectancy_factor(100) == 6.4

    def test_age_120(self):
        assert get_life_expectancy_factor(120) == 2.0

    def test_age_above_120_returns_2(self):
        # IRS guidance: use 2.0 for ages beyond the table
        assert get_life_expectancy_factor(121) == 2.0
        assert get_life_expectancy_factor(130) == 2.0

    def test_age_below_72_raises(self):
        with pytest.raises(ValueError):
            get_life_expectancy_factor(71)

    def test_age_zero_raises(self):
        with pytest.raises(ValueError):
            get_life_expectancy_factor(0)

    def test_factor_decreases_with_age(self):
        # Each successive age should have a smaller (or equal) factor
        ages = range(72, 121)
        factors = [get_life_expectancy_factor(a) for a in ages]
        for i in range(1, len(factors)):
            assert factors[i] <= factors[i - 1], f"Factor did not decrease at age {72 + i}"


class TestCalculateRmd:
    def test_rmd_start_age_is_73(self):
        assert RMD_START_AGE == 73

    def test_age_72_no_rmd(self):
        # No RMD before start age
        assert calculate_rmd(1_000_000, 72) == 0.0

    def test_age_below_start_returns_zero(self):
        assert calculate_rmd(1_000_000, 60) == 0.0

    def test_zero_balance_returns_zero(self):
        assert calculate_rmd(0, 75) == 0.0

    def test_negative_balance_returns_zero(self):
        assert calculate_rmd(-10_000, 80) == 0.0

    def test_age_73_calculation(self):
        # $500,000 / 26.5 ≈ $18,867.92
        rmd = calculate_rmd(500_000, 73)
        assert pytest.approx(rmd, abs=0.01) == 500_000 / 26.5

    def test_age_80_calculation(self):
        rmd = calculate_rmd(1_000_000, 80)
        assert pytest.approx(rmd, abs=0.01) == 1_000_000 / 20.2

    def test_age_90_calculation(self):
        rmd = calculate_rmd(200_000, 90)
        assert pytest.approx(rmd, abs=0.01) == 200_000 / 12.2

    def test_age_120_calculation(self):
        rmd = calculate_rmd(100_000, 120)
        assert pytest.approx(rmd, abs=0.01) == 100_000 / 2.0

    def test_age_above_120_uses_factor_2(self):
        rmd = calculate_rmd(100_000, 125)
        assert pytest.approx(rmd, abs=0.01) == 50_000.0

    def test_rmd_grows_as_age_increases(self):
        # Same balance → older age → larger RMD (smaller factor)
        rmd_75 = calculate_rmd(500_000, 75)
        rmd_85 = calculate_rmd(500_000, 85)
        rmd_95 = calculate_rmd(500_000, 95)
        assert rmd_85 > rmd_75
        assert rmd_95 > rmd_85

    def test_rmd_proportional_to_balance(self):
        # Double the balance → double the RMD
        rmd_1m = calculate_rmd(1_000_000, 80)
        rmd_2m = calculate_rmd(2_000_000, 80)
        assert pytest.approx(rmd_2m, abs=0.01) == rmd_1m * 2
