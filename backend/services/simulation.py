"""
Monte Carlo simulation engine for FuegoPro retirement planning.

Integrates:
  - Block-bootstrap historical S&P 500 returns  (data/historic_returns.py)
  - IRS federal & California tax calculations    (services/tax.py)
  - IRS Uniform Lifetime Table RMDs              (services/rmd.py)
  - Tax-efficient withdrawal sequencing          (services/withdrawal.py)

Year-by-year loop for each run:
  1.  Collect active income sources (employment, SS, pension, rental, other)
  2.  Pull planned 401k distributions from traditional accounts
  3.  Take mandatory RMDs from traditional accounts
  4.  Compute inflation-adjusted expenses
  5.  Withdraw from non-traditional accounts to cover any expense shortfall
  6.  Compute taxes (federal ordinary + federal LTCG + state)
  7.  Withdraw to cover any remaining tax bill
  8.  Apply investment returns (stocks → historical, bonds/savings → fixed rate)
  9.  Record year-end balances and tax breakdown

After all runs:
  - Aggregate portfolio percentile bands per age
  - Aggregate median account balance per account per age
  - Identify the "median run" (final portfolio closest to median) and return
    its year-by-year income, expense, and tax detail

Public entry point:  simulate(plan, config, seed) → SimulationResult
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

from data.historic_returns import sample_annual_returns
from services.rmd import calculate_rmd
from services.tax import (
    calculate_federal_tax,
    calculate_ss_taxable_fraction,
    calculate_state_tax,
)
from services.withdrawal import AccountState, WithdrawalResult, withdraw_for_shortfall


# ---------------------------------------------------------------------------
# Input dataclasses
# ---------------------------------------------------------------------------

@dataclass
class IncomeSourceInput:
    name:          str
    income_type:   str            # 'employment' | 'social_security' | 'pension' |
                                  # 'rental' | '401k_distribution' | 'other'
    annual_amount: float
    start_age:     int
    end_age:       int
    is_taxable:    Optional[bool] = None   # used only for income_type='other'


@dataclass
class ExpenseInput:
    name:           str
    annual_amount:  float          # in today's dollars
    start_age:      int
    end_age:        int
    inflation_rate: float          # e.g. 0.025 = 2.5%


@dataclass
class PlanInputs:
    current_age:      int
    planning_horizon: int
    filing_status:    str          # 'single' | 'married'
    state_tax_type:   str          # 'none' | 'moderate' | 'california'
    state_tax_rate:   Optional[float]
    accounts:         List[AccountState]   # original balances; copied per run
    income_sources:   List[IncomeSourceInput]
    expenses:         List[ExpenseInput]


@dataclass
class SimulationConfig:
    num_runs:         int = 1000
    lower_percentile: int = 10
    upper_percentile: int = 90


# ---------------------------------------------------------------------------
# Output dataclasses
# ---------------------------------------------------------------------------

@dataclass
class AgePortfolioPoint:
    age:     int
    p50:     float
    p_lower: float
    p_upper: float


@dataclass
class AgeAccountPoint:
    account_id:   int
    account_name: str
    age:          int
    p50:          float


@dataclass
class AnnualDetail:
    age:                  int
    tax_federal_ordinary: float
    tax_federal_ltcg:     float
    tax_state:            float
    effective_tax_rate:   float


@dataclass
class IncomeDetail:
    age:         int
    source_name: str
    amount:      float


@dataclass
class ExpenseDetail:
    age:          int
    expense_name: str
    amount:       float


@dataclass
class SimulationResult:
    success_rate:       float
    portfolio_timeline: List[AgePortfolioPoint]
    account_timeline:   List[AgeAccountPoint]
    annual_detail:      List[AnnualDetail]
    income_detail:      List[IncomeDetail]
    expense_detail:     List[ExpenseDetail]


# ---------------------------------------------------------------------------
# Single-run helper
# ---------------------------------------------------------------------------

def _simulate_one_run(
    plan:          PlanInputs,
    accounts:      List[AccountState],   # already deep-copied for this run
    stock_returns: np.ndarray,           # pre-sampled annual returns, shape (num_ages,)
) -> Tuple[bool, np.ndarray, np.ndarray, List[dict], List[dict], List[dict]]:
    """
    Simulate one sequence of annual market returns for the full planning horizon.

    Returns
    -------
    survived        : True if expenses and taxes were met in every year.
    portfolio_vals  : shape (num_ages,)           — end-of-year total portfolio.
    account_vals    : shape (num_accounts, num_ages) — end-of-year per-account.
    annual_details  : list of dicts, one per year.
    income_details  : list of dicts, one per active income source per year.
    expense_details : list of dicts, one per active expense per year.
    """
    num_ages    = plan.planning_horizon
    n_accts     = len(accounts)
    current_age = plan.current_age

    portfolio_vals  = np.zeros(num_ages)
    account_vals    = np.zeros((n_accts, num_ages))
    annual_details:  List[dict] = []
    income_details:  List[dict] = []
    expense_details: List[dict] = []
    survived = True

    # References to traditional accounts; reused each year for RMDs / 401k pulls.
    traditional = [a for a in accounts if a.tax_treatment == "traditional"]

    for age_idx in range(num_ages):
        age           = current_age + age_idx
        years_elapsed = age_idx                  # age - current_age
        stock_return  = float(stock_returns[age_idx])

        # -------------------------------------------------------------------
        # Step 1 — Collect income sources active this year
        # -------------------------------------------------------------------
        ss_gross         = 0.0   # Social Security (gross; taxable fraction applied later)
        other_ordinary   = 0.0   # Fully taxable ordinary income (employment, pension, etc.)
        other_nontaxable = 0.0   # Non-taxable income (e.g. Roth-like; covers expenses)
        k401_planned     = 0.0   # Voluntary 401k / IRA distributions (user-specified)

        for src in plan.income_sources:
            if not (src.start_age <= age <= src.end_age):
                continue
            amt = src.annual_amount
            income_details.append({"age": age, "source_name": src.name, "amount": amt})

            if src.income_type == "social_security":
                ss_gross += amt
            elif src.income_type == "401k_distribution":
                k401_planned += amt
            elif src.income_type == "other":
                if src.is_taxable:
                    other_ordinary += amt
                else:
                    other_nontaxable += amt
            else:
                # employment | pension | rental → fully taxable ordinary income
                other_ordinary += amt

        # -------------------------------------------------------------------
        # Step 2 — Pull planned 401k distributions from traditional accounts
        # User has committed to taking this amount; it becomes ordinary income.
        # -------------------------------------------------------------------
        if k401_planned > 0.0 and traditional:
            wr_k401 = withdraw_for_shortfall(traditional, k401_planned)
            other_ordinary += wr_k401.ordinary_income   # always ordinary (pre-tax account)

        # -------------------------------------------------------------------
        # Step 3 — Mandatory RMDs from traditional accounts
        # Must be taken regardless of need; any excess covers expenses.
        # -------------------------------------------------------------------
        rmd_total = 0.0
        for acct in traditional:
            rmd    = calculate_rmd(acct.balance, age)
            actual = min(rmd, acct.balance)
            if actual > 0.0:
                acct.balance -= actual
                rmd_total    += actual

        # -------------------------------------------------------------------
        # Step 4 — Inflation-adjusted expenses for this year
        # -------------------------------------------------------------------
        total_expenses = 0.0
        for exp in plan.expenses:
            if not (exp.start_age <= age <= exp.end_age):
                continue
            adjusted = exp.annual_amount * ((1.0 + exp.inflation_rate) ** years_elapsed)
            total_expenses += adjusted
            expense_details.append({"age": age, "expense_name": exp.name, "amount": adjusted})

        # -------------------------------------------------------------------
        # Step 5 — Withdraw from accounts to cover expense shortfall
        # Order: cash_savings → taxable_brokerage → traditional
        # -------------------------------------------------------------------
        available_income  = other_ordinary + other_nontaxable + ss_gross + rmd_total
        expense_shortfall = max(0.0, total_expenses - available_income)
        wr_expense        = withdraw_for_shortfall(accounts, expense_shortfall)

        if wr_expense.shortfall > 0.0:
            survived = False

        # -------------------------------------------------------------------
        # Step 6 — Compute taxes
        # -------------------------------------------------------------------
        # Ordinary income from all pre-tax distributions this year
        pretax_distributions = rmd_total + wr_expense.ordinary_income

        # Social Security taxable fraction
        # Provisional income = non-SS ordinary + 0.5 × gross SS (IRS definition)
        provisional = other_ordinary + pretax_distributions + 0.5 * ss_gross
        ss_fraction = calculate_ss_taxable_fraction(provisional, plan.filing_status)
        taxable_ss  = ss_gross * ss_fraction

        total_ordinary = other_ordinary + pretax_distributions + taxable_ss
        ltcg_income    = wr_expense.ltcg_income

        # Federal tax split: compute with and without LTCG to isolate each component
        fed_ordinary_only = calculate_federal_tax(total_ordinary, 0.0, plan.filing_status)
        fed_total         = calculate_federal_tax(total_ordinary, ltcg_income, plan.filing_status)
        fed_ltcg          = fed_total - fed_ordinary_only

        # State tax: California taxes LTCG as ordinary income
        state_taxable = total_ordinary + (ltcg_income if plan.state_tax_type == "california" else 0.0)
        state_tax     = calculate_state_tax(
            state_taxable, plan.state_tax_type, plan.state_tax_rate, plan.filing_status
        )

        total_tax = fed_total + state_tax

        # -------------------------------------------------------------------
        # Step 7 — Withdraw from accounts to cover tax bill
        # Cash remaining after expenses covers taxes first; pull the rest.
        # -------------------------------------------------------------------
        cash_after_expenses = available_income + wr_expense.total_withdrawn - total_expenses
        tax_shortfall       = max(0.0, total_tax - cash_after_expenses)

        if tax_shortfall > 0.0:
            wr_tax = withdraw_for_shortfall(accounts, tax_shortfall)
            if wr_tax.shortfall > 0.0:
                survived = False

        # -------------------------------------------------------------------
        # Step 8 — Apply end-of-year investment returns
        # -------------------------------------------------------------------
        for acct in accounts:
            growth       = stock_return if acct.asset_class == "stocks" else acct.annual_return_rate
            acct.balance = max(0.0, acct.balance * (1.0 + growth))

        # -------------------------------------------------------------------
        # Step 9 — Record year-end state
        # -------------------------------------------------------------------
        portfolio_vals[age_idx] = sum(a.balance for a in accounts)
        for ai, acct in enumerate(accounts):
            account_vals[ai, age_idx] = acct.balance

        total_income_taxed = total_ordinary + ltcg_income
        eff_rate = total_tax / total_income_taxed if total_income_taxed > 0.0 else 0.0

        annual_details.append({
            "age":                  age,
            "tax_federal_ordinary": fed_ordinary_only,
            "tax_federal_ltcg":     fed_ltcg,
            "tax_state":            state_tax,
            "effective_tax_rate":   eff_rate,
        })

    return survived, portfolio_vals, account_vals, annual_details, income_details, expense_details


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def simulate(
    plan:   PlanInputs,
    config: SimulationConfig,
    seed:   Optional[int] = None,
) -> SimulationResult:
    """
    Run the Monte Carlo simulation.

    Parameters
    ----------
    plan   : PlanInputs built from the user's saved plan.
    config : SimulationConfig (num_runs, lower/upper percentile).
    seed   : Optional int — fixes the RNG for reproducible results.

    Returns
    -------
    SimulationResult with aggregated statistics (all runs) and detailed
    year-by-year breakdown from the run whose final portfolio is closest to
    the median (the "median run").
    """
    rng      = np.random.default_rng(seed)
    num_ages = plan.planning_horizon
    n_accts  = len(plan.accounts)

    # Pre-allocate arrays for all runs
    all_portfolio = np.zeros((config.num_runs, num_ages))
    all_accounts  = np.zeros((config.num_runs, n_accts, num_ages))

    successes  = 0
    all_annual:  List[List[dict]] = []
    all_income:  List[List[dict]] = []
    all_expense: List[List[dict]] = []

    for run_idx in range(config.num_runs):
        # Sample a full sequence of annual stock returns for this run
        stock_returns = sample_annual_returns(num_ages, rng)

        # Deep-copy account balances so each run starts from the same position
        accounts_copy = [
            AccountState(
                id=a.id,
                name=a.name,
                tax_treatment=a.tax_treatment,
                asset_class=a.asset_class,
                balance=a.balance,
                annual_return_rate=a.annual_return_rate or 0.0,
                gains_pct=a.gains_pct or 0.0,
            )
            for a in plan.accounts
        ]

        survived, pv, av, ann_det, inc_det, exp_det = _simulate_one_run(
            plan=plan,
            accounts=accounts_copy,
            stock_returns=stock_returns,
        )

        if survived:
            successes += 1

        all_portfolio[run_idx] = pv
        all_accounts[run_idx]  = av    # shape: (n_accts, num_ages)
        all_annual.append(ann_det)
        all_income.append(inc_det)
        all_expense.append(exp_det)

    # -----------------------------------------------------------------------
    # Success rate
    # -----------------------------------------------------------------------
    success_rate = successes / config.num_runs

    # -----------------------------------------------------------------------
    # Portfolio percentile bands per age
    # -----------------------------------------------------------------------
    portfolio_timeline: List[AgePortfolioPoint] = []
    for age_idx in range(num_ages):
        age  = plan.current_age + age_idx
        vals = all_portfolio[:, age_idx]
        portfolio_timeline.append(AgePortfolioPoint(
            age=age,
            p50=float(np.median(vals)),
            p_lower=float(np.percentile(vals, config.lower_percentile)),
            p_upper=float(np.percentile(vals, config.upper_percentile)),
        ))

    # -----------------------------------------------------------------------
    # Median account balance per account per age (across all runs)
    # -----------------------------------------------------------------------
    account_timeline: List[AgeAccountPoint] = []
    for ai, acct in enumerate(plan.accounts):
        for age_idx in range(num_ages):
            age  = plan.current_age + age_idx
            vals = all_accounts[:, ai, age_idx]
            account_timeline.append(AgeAccountPoint(
                account_id=acct.id,
                account_name=acct.name,
                age=age,
                p50=float(np.median(vals)),
            ))

    # -----------------------------------------------------------------------
    # Median run: year-by-year income / expense / tax detail
    # Defined as the run whose final portfolio value is closest to the median.
    # -----------------------------------------------------------------------
    final_vals   = all_portfolio[:, -1]
    median_final = float(np.median(final_vals))
    median_idx   = int(np.argmin(np.abs(final_vals - median_final)))

    annual_detail  = [AnnualDetail(**d)  for d in all_annual[median_idx]]
    income_detail  = [IncomeDetail(**d)  for d in all_income[median_idx]]
    expense_detail = [ExpenseDetail(**d) for d in all_expense[median_idx]]

    return SimulationResult(
        success_rate=success_rate,
        portfolio_timeline=portfolio_timeline,
        account_timeline=account_timeline,
        annual_detail=annual_detail,
        income_detail=income_detail,
        expense_detail=expense_detail,
    )
