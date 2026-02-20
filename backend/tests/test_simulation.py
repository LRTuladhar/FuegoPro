"""
Unit and integration tests for services/withdrawal.py and services/simulation.py.

Run from the backend/ directory:
    python -m pytest tests/test_simulation.py -v
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import numpy as np

from services.withdrawal import AccountState, WithdrawalResult, withdraw_for_shortfall
from services.simulation import (
    AnnualDetail, ExpenseInput, IncomeSourceInput,
    PlanInputs, SimulationConfig, SimulationResult,
    simulate,
)


# ===========================================================================
# Helpers
# ===========================================================================

def make_account(
    id=1, name="Acct", tax_treatment="traditional", asset_class="stocks",
    balance=500_000.0, annual_return_rate=0.0, gains_pct=0.0,
):
    return AccountState(
        id=id, name=name, tax_treatment=tax_treatment, asset_class=asset_class,
        balance=balance, annual_return_rate=annual_return_rate, gains_pct=gains_pct,
    )


def make_plan(
    current_age=65, horizon=20, filing_status="single",
    state_tax_type="none", state_tax_rate=None,
    accounts=None, income_sources=None, expenses=None,
):
    return PlanInputs(
        current_age=current_age,
        planning_horizon=horizon,
        filing_status=filing_status,
        state_tax_type=state_tax_type,
        state_tax_rate=state_tax_rate,
        accounts=accounts or [],
        income_sources=income_sources or [],
        expenses=expenses or [],
    )


def cfg(num_runs=200, lower=10, upper=90):
    return SimulationConfig(num_runs=num_runs, lower_percentile=lower, upper_percentile=upper)


# ===========================================================================
# withdraw_for_shortfall
# ===========================================================================

class TestWithdrawForShortfall:

    def test_no_shortfall_returns_zero(self):
        acct = make_account(balance=100_000)
        r = withdraw_for_shortfall([acct], 0.0)
        assert r.total_withdrawn == 0.0
        assert r.shortfall == 0.0
        assert acct.balance == 100_000.0

    def test_single_cash_account_covers_shortfall(self):
        acct = make_account(tax_treatment="cash_savings", balance=50_000)
        r = withdraw_for_shortfall([acct], 10_000)
        assert pytest.approx(r.total_withdrawn) == 10_000.0
        assert r.ordinary_income == 0.0
        assert r.ltcg_income == 0.0
        assert r.shortfall == 0.0
        assert pytest.approx(acct.balance) == 40_000.0

    def test_single_traditional_account_generates_ordinary_income(self):
        acct = make_account(tax_treatment="traditional", balance=100_000)
        r = withdraw_for_shortfall([acct], 30_000)
        assert pytest.approx(r.ordinary_income) == 30_000.0
        assert r.ltcg_income == 0.0
        assert pytest.approx(acct.balance) == 70_000.0

    def test_brokerage_generates_ltcg_on_gains_pct(self):
        acct = make_account(tax_treatment="taxable_brokerage", balance=100_000, gains_pct=0.6)
        r = withdraw_for_shortfall([acct], 20_000)
        assert pytest.approx(r.ltcg_income) == 20_000 * 0.6
        assert r.ordinary_income == 0.0

    def test_brokerage_zero_gains_pct_no_ltcg(self):
        acct = make_account(tax_treatment="taxable_brokerage", balance=100_000, gains_pct=0.0)
        r = withdraw_for_shortfall([acct], 10_000)
        assert r.ltcg_income == 0.0

    def test_withdrawal_order_cash_before_brokerage_before_traditional(self):
        cash  = make_account(id=1, tax_treatment="cash_savings",      balance=5_000)
        brok  = make_account(id=2, tax_treatment="taxable_brokerage",  balance=5_000, gains_pct=0.5)
        trad  = make_account(id=3, tax_treatment="traditional",        balance=5_000)

        r = withdraw_for_shortfall([trad, brok, cash], 7_000)  # order in list shouldn't matter
        # Cash drained first (5000), then 2000 from brokerage
        assert pytest.approx(cash.balance) == 0.0
        assert pytest.approx(brok.balance) == 3_000.0
        assert trad.balance == 5_000.0   # untouched
        assert pytest.approx(r.total_withdrawn) == 7_000.0
        assert pytest.approx(r.ltcg_income) == 2_000 * 0.5

    def test_shortfall_when_accounts_insufficient(self):
        acct = make_account(balance=1_000)
        r = withdraw_for_shortfall([acct], 5_000)
        assert pytest.approx(r.shortfall) == 4_000.0
        assert pytest.approx(r.total_withdrawn) == 1_000.0
        assert acct.balance == 0.0

    def test_empty_account_list_returns_full_shortfall(self):
        r = withdraw_for_shortfall([], 10_000)
        assert r.shortfall == 10_000.0
        assert r.total_withdrawn == 0.0

    def test_account_with_zero_balance_skipped(self):
        empty = make_account(balance=0.0)
        full  = make_account(id=2, tax_treatment="traditional", balance=20_000)
        r = withdraw_for_shortfall([empty, full], 5_000)
        assert pytest.approx(r.total_withdrawn) == 5_000.0
        assert r.shortfall == 0.0


# ===========================================================================
# simulate() — structural checks
# ===========================================================================

class TestSimulateStructure:
    """Verify that simulate() returns correctly shaped output."""

    HORIZON = 10
    PLAN = make_plan(
        current_age=65, horizon=HORIZON,
        accounts=[make_account(balance=1_000_000)],
        income_sources=[IncomeSourceInput(
            name="SS", income_type="social_security",
            annual_amount=24_000, start_age=65, end_age=95,
        )],
        expenses=[ExpenseInput(
            name="Living", annual_amount=50_000,
            start_age=65, end_age=95, inflation_rate=0.025,
        )],
    )

    def test_returns_simulation_result(self):
        r = simulate(self.PLAN, cfg(num_runs=50), seed=0)
        assert isinstance(r, SimulationResult)

    def test_portfolio_timeline_length(self):
        r = simulate(self.PLAN, cfg(num_runs=50), seed=0)
        assert len(r.portfolio_timeline) == self.HORIZON

    def test_portfolio_timeline_ages(self):
        r = simulate(self.PLAN, cfg(num_runs=50), seed=0)
        ages = [pt.age for pt in r.portfolio_timeline]
        assert ages == list(range(65, 65 + self.HORIZON))

    def test_p_lower_le_p50_le_p_upper(self):
        r = simulate(self.PLAN, cfg(num_runs=100), seed=1)
        for pt in r.portfolio_timeline:
            assert pt.p_lower <= pt.p50 <= pt.p_upper

    def test_account_timeline_length(self):
        # 3 bands × 1 account × HORIZON ages
        r = simulate(self.PLAN, cfg(num_runs=50), seed=0)
        assert len(r.account_timeline) == 3 * self.HORIZON

    def test_annual_detail_length(self):
        r = simulate(self.PLAN, cfg(num_runs=50), seed=0)
        # 3 bands × HORIZON ages
        assert len(r.annual_detail) == 3 * self.HORIZON

    def test_annual_detail_fields(self):
        r = simulate(self.PLAN, cfg(num_runs=50), seed=0)
        d = r.annual_detail[0]
        assert isinstance(d, AnnualDetail)
        assert d.age == 65
        assert d.tax_federal_ordinary >= 0
        assert d.tax_federal_ltcg >= 0
        assert d.tax_state >= 0
        assert 0.0 <= d.effective_tax_rate <= 1.0

    def test_income_detail_has_entries(self):
        r = simulate(self.PLAN, cfg(num_runs=50), seed=0)
        assert len(r.income_detail) > 0

    def test_expense_detail_has_entries(self):
        r = simulate(self.PLAN, cfg(num_runs=50), seed=0)
        assert len(r.expense_detail) > 0

    def test_success_rate_between_0_and_1(self):
        r = simulate(self.PLAN, cfg(num_runs=100), seed=0)
        assert 0.0 <= r.success_rate <= 1.0


# ===========================================================================
# simulate() — economic sanity
# ===========================================================================

class TestSimulateEconomics:

    def test_near_100_pct_success_with_huge_wealth(self):
        """A plan with $10M and minimal expenses should almost always succeed."""
        plan = make_plan(
            accounts=[make_account(balance=10_000_000)],
            expenses=[ExpenseInput("Living", 30_000, 65, 84, 0.02)],
        )
        r = simulate(plan, cfg(num_runs=200), seed=42)
        assert r.success_rate >= 0.95

    def test_near_0_pct_success_with_no_wealth_and_large_expenses(self):
        """A plan with $0 and large expenses should almost always fail."""
        plan = make_plan(
            accounts=[make_account(balance=0.0)],
            expenses=[ExpenseInput("Living", 100_000, 65, 94, 0.02)],
        )
        r = simulate(plan, cfg(num_runs=200), seed=42)
        assert r.success_rate < 0.05

    def test_reproducibility_with_seed(self):
        plan = make_plan(
            accounts=[make_account(balance=800_000)],
            income_sources=[IncomeSourceInput("SS", "social_security", 20_000, 65, 90)],
            expenses=[ExpenseInput("Living", 60_000, 65, 84, 0.025)],
        )
        r1 = simulate(plan, cfg(num_runs=100), seed=7)
        r2 = simulate(plan, cfg(num_runs=100), seed=7)
        assert r1.success_rate == r2.success_rate
        assert r1.portfolio_timeline[0].p50 == r2.portfolio_timeline[0].p50

    def test_different_seeds_give_different_results(self):
        plan = make_plan(
            accounts=[make_account(balance=500_000)],
            expenses=[ExpenseInput("Living", 40_000, 65, 84, 0.025)],
        )
        r1 = simulate(plan, cfg(num_runs=100), seed=1)
        r2 = simulate(plan, cfg(num_runs=100), seed=2)
        # Extremely unlikely to be identical
        assert r1.success_rate != r2.success_rate or \
               r1.portfolio_timeline[5].p50 != r2.portfolio_timeline[5].p50

    def test_rmd_kicks_in_at_73(self):
        """Starting at 73, a traditional account should see mandatory distributions."""
        plan = make_plan(
            current_age=73,
            horizon=5,
            accounts=[make_account(tax_treatment="traditional", balance=500_000)],
            expenses=[ExpenseInput("Living", 10_000, 73, 77, 0.0)],
        )
        r = simulate(plan, cfg(num_runs=50), seed=0)
        # RMDs produce ordinary income; tax should be non-zero
        assert any(d.tax_federal_ordinary > 0 for d in r.annual_detail)

    def test_ss_taxability_applied(self):
        """High SS + other income should generate non-zero federal tax."""
        plan = make_plan(
            current_age=70,
            horizon=5,
            accounts=[make_account(balance=200_000)],
            income_sources=[
                IncomeSourceInput("SS", "social_security", 30_000, 70, 90),
                IncomeSourceInput("Pension", "pension", 30_000, 70, 90),
            ],
            expenses=[ExpenseInput("Living", 20_000, 70, 90, 0.0)],
        )
        r = simulate(plan, cfg(num_runs=50), seed=0)
        # Combined income > $34k single threshold → 85% of SS taxable → tax > 0
        assert all(d.tax_federal_ordinary > 0 for d in r.annual_detail)

    def test_california_state_tax_applied(self):
        plan = make_plan(
            state_tax_type="california",
            accounts=[make_account(balance=1_000_000)],
            income_sources=[IncomeSourceInput("Pension", "pension", 60_000, 65, 84)],
            expenses=[ExpenseInput("Living", 50_000, 65, 84, 0.0)],
        )
        r = simulate(plan, cfg(num_runs=50), seed=0)
        assert all(d.tax_state > 0 for d in r.annual_detail)

    def test_no_tax_with_no_state(self):
        plan = make_plan(
            state_tax_type="none",
            accounts=[make_account(
                tax_treatment="cash_savings", asset_class="savings",
                balance=2_000_000, annual_return_rate=0.04,
            )],
            expenses=[ExpenseInput("Living", 30_000, 65, 84, 0.0)],
        )
        r = simulate(plan, cfg(num_runs=50), seed=0)
        # Cash savings withdrawals: no ordinary income, no LTCG → $0 federal tax
        assert all(d.tax_state == 0.0 for d in r.annual_detail)
        assert all(d.tax_federal_ordinary == 0.0 for d in r.annual_detail)

    def test_inflation_increases_expenses_over_time(self):
        """Expense detail amounts should grow each year with inflation (median band)."""
        plan = make_plan(
            current_age=65,
            horizon=10,
            accounts=[make_account(balance=2_000_000)],
            expenses=[ExpenseInput("Living", 50_000, 65, 74, inflation_rate=0.03)],
        )
        r = simulate(plan, cfg(num_runs=50), seed=0)
        exp_amounts = [d.amount for d in r.expense_detail if d.band == 'median']
        # Amounts should be monotonically non-decreasing
        assert all(exp_amounts[i] <= exp_amounts[i + 1] for i in range(len(exp_amounts) - 1))

    def test_income_outside_age_range_excluded(self):
        """Income source outside the plan age range should not appear in income detail."""
        plan = make_plan(
            current_age=65,
            horizon=5,
            accounts=[make_account(balance=500_000)],
            income_sources=[
                IncomeSourceInput("Early Work", "employment", 80_000, 40, 64),  # before simulation
            ],
            expenses=[ExpenseInput("Living", 20_000, 65, 69, 0.0)],
        )
        r = simulate(plan, cfg(num_runs=50), seed=0)
        assert len(r.income_detail) == 0

    def test_multiple_accounts_all_appear_in_timeline(self):
        plan = make_plan(
            horizon=5,
            accounts=[
                make_account(id=1, name="Trad",  tax_treatment="traditional",      balance=300_000),
                make_account(id=2, name="Brok",  tax_treatment="taxable_brokerage", balance=200_000, gains_pct=0.7),
                make_account(id=3, name="Cash",  tax_treatment="cash_savings",      balance=100_000),
            ],
            expenses=[ExpenseInput("Living", 40_000, 65, 69, 0.0)],
        )
        r = simulate(plan, cfg(num_runs=50), seed=0)
        # 3 bands × 3 accounts × 5 ages = 45 entries
        assert len(r.account_timeline) == 45
        names = {pt.account_name for pt in r.account_timeline}
        assert names == {"Trad", "Brok", "Cash"}
