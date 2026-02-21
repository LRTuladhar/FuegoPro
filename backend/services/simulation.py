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
    num_runs:              int = 1000
    lower_percentile:      int = 10
    upper_percentile:      int = 90
    initial_market_regime: Optional[str] = None  # 'bear' | 'bull' | None


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
    balance:      float
    band:         str = 'median'


@dataclass
class AnnualDetail:
    age:                  int
    tax_federal_ordinary: float
    tax_federal_ltcg:     float
    tax_state:            float
    effective_tax_rate:   float
    band:                 str = 'median'   # 'median' | 'lower' | 'upper'


@dataclass
class IncomeDetail:
    age:         int
    source_name: str
    amount:      float
    band:        str = 'median'


@dataclass
class ExpenseDetail:
    age:          int
    expense_name: str
    amount:       float
    band:         str = 'median'


@dataclass
class ReturnDetail:
    age:           int
    account_id:    int
    account_name:  str
    return_amount: float
    band:          str = 'median'


@dataclass
class SimulationResult:
    success_rate:            float
    portfolio_timeline:      List[AgePortfolioPoint]
    account_timeline:        List[AgeAccountPoint]
    annual_detail:           List[AnnualDetail]
    income_detail:           List[IncomeDetail]
    expense_detail:          List[ExpenseDetail]
    return_detail:           List[ReturnDetail]
    representative_returns:  dict  # {'lower': [...], 'median': [...], 'upper': [...]}


# ---------------------------------------------------------------------------
# Single-run helper
# ---------------------------------------------------------------------------

def _simulate_one_run(
    plan:          PlanInputs,
    accounts:      List[AccountState],   # already deep-copied for this run
    stock_returns: np.ndarray,           # pre-sampled annual returns, shape (num_ages,)
    capture_debug: bool = False,
) -> Tuple[bool, np.ndarray, np.ndarray, List[dict], List[dict], List[dict], List[dict], Optional[List[dict]]]:
    """
    Simulate one sequence of annual market returns for the full planning horizon.

    Parameters
    ----------
    plan          : PlanInputs with user configuration
    accounts      : List[AccountState], already deep-copied for this run
    stock_returns : pre-sampled annual returns, shape (num_ages,)
    capture_debug : if True, capture detailed per-year calculations

    Returns
    -------
    survived        : True if expenses and taxes were met in every year.
    portfolio_vals  : shape (num_ages,)           — end-of-year total portfolio.
    account_vals    : shape (num_accounts, num_ages) — end-of-year per-account.
    annual_details  : list of dicts, one per year.
    income_details  : list of dicts, one per active income source per year.
    expense_details : list of dicts, one per active expense per year.
    return_details  : list of dicts, one per account per year.
    debug_rows      : list of detailed per-year dicts (or None if capture_debug=False).
    """
    num_ages    = plan.planning_horizon
    n_accts     = len(accounts)
    current_age = plan.current_age

    portfolio_vals  = np.zeros(num_ages)
    account_vals    = np.zeros((n_accts, num_ages))
    annual_details:  List[dict] = []
    income_details:  List[dict] = []
    expense_details: List[dict] = []
    return_details:  List[dict] = []
    debug_rows:      List[dict] = [] if capture_debug else None
    survived = True

    # References to traditional accounts; reused each year for RMDs / 401k pulls.
    traditional = [a for a in accounts if a.tax_treatment == "traditional"]

    # Track per-account RMDs for debug output
    rmd_by_account = {}

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

        for src in plan.income_sources:
            if not (src.start_age <= age <= src.end_age):
                continue
            amt = src.annual_amount
            income_details.append({"age": age, "source_name": src.name, "amount": amt})

            if src.income_type == "social_security":
                ss_gross += amt
            elif src.income_type == "other":
                if src.is_taxable:
                    other_ordinary += amt
                else:
                    other_nontaxable += amt
            else:
                # employment | rental → fully taxable ordinary income
                other_ordinary += amt

        # -------------------------------------------------------------------
        # Step 1b — Annual bond interest from taxable brokerage accounts
        # Interest is taxed as ordinary income each year; withdrawals from
        # these accounts carry no additional tax (basis already taxed here).
        # -------------------------------------------------------------------
        for acct in accounts:
            if acct.tax_treatment == "taxable_brokerage" and acct.asset_class == "bonds":
                interest = acct.balance * acct.annual_return_rate
                if interest > 0.0:
                    other_ordinary += interest
                    income_details.append({
                        "age": age,
                        "source_name": f"{acct.name} Interest",
                        "amount": interest,
                    })

        # -------------------------------------------------------------------
        # Step 2 — Mandatory RMDs from traditional accounts
        # Must be taken regardless of need; any excess covers expenses.
        # -------------------------------------------------------------------
        rmd_total = 0.0
        rmd_by_account = {}  # Reset for this year
        for acct in traditional:
            rmd    = calculate_rmd(acct.balance, age)
            actual = min(rmd, acct.balance)
            rmd_by_account[acct.id] = actual  # Track for debug
            if actual > 0.0:
                acct.balance -= actual
                rmd_total    += actual

        # -------------------------------------------------------------------
        # Step 3 — Inflation-adjusted expenses for this year
        # -------------------------------------------------------------------
        total_expenses = 0.0
        for exp in plan.expenses:
            if not (exp.start_age <= age <= exp.end_age):
                continue
            adjusted = exp.annual_amount * ((1.0 + exp.inflation_rate) ** years_elapsed)
            total_expenses += adjusted
            expense_details.append({"age": age, "expense_name": exp.name, "amount": adjusted})

        # -------------------------------------------------------------------
        # Step 4 — Withdraw from accounts to cover expense shortfall
        # Order: cash_savings → taxable_brokerage → traditional
        # -------------------------------------------------------------------
        available_income  = other_ordinary + other_nontaxable + ss_gross + rmd_total
        expense_shortfall = max(0.0, total_expenses - available_income)

        # Snapshot balances before expense withdrawal (for per-account debug)
        if capture_debug:
            pre_expense_snap = {acct.id: acct.balance for acct in accounts}

        wr_expense        = withdraw_for_shortfall(accounts, expense_shortfall)

        if wr_expense.shortfall > 0.0:
            survived = False

        # -------------------------------------------------------------------
        # Step 5 — Compute taxes
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
        # Step 6 — Withdraw from accounts to cover tax bill
        # Cash remaining after expenses covers taxes first; pull the rest.
        # -------------------------------------------------------------------
        cash_after_expenses = available_income + wr_expense.total_withdrawn - total_expenses
        tax_shortfall       = max(0.0, total_tax - cash_after_expenses)

        # Snapshot balances before tax withdrawal (for per-account debug)
        if capture_debug:
            pre_tax_snap = {acct.id: acct.balance for acct in accounts}

        if tax_shortfall > 0.0:
            wr_tax = withdraw_for_shortfall(accounts, tax_shortfall)
            if wr_tax.shortfall > 0.0:
                survived = False

        # -------------------------------------------------------------------
        # Step 7 — Apply end-of-year investment returns
        # -------------------------------------------------------------------
        for acct in accounts:
            growth        = stock_return if acct.asset_class == "stocks" else acct.annual_return_rate
            bal_before    = acct.balance
            acct.balance  = max(0.0, acct.balance * (1.0 + growth))
            return_amount = acct.balance - bal_before
            return_details.append({
                "age":           age,
                "account_id":    acct.id,
                "account_name":  acct.name,
                "return_amount": return_amount,
            })

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

        # -------------------------------------------------------------------
        # Debug capture: detailed per-year intermediate values
        # -------------------------------------------------------------------
        if capture_debug:
            # Build per-account detail
            account_rows = []
            for ai, acct in enumerate(accounts):
                growth_rate = stock_return if acct.asset_class == "stocks" else acct.annual_return_rate
                rmd_amt = rmd_by_account.get(acct.id, 0.0)
                end_bal = account_vals[ai, age_idx]

                # Compute balance before growth by reversing growth calculation
                if growth_rate != 0:
                    bal_before_growth = end_bal / (1.0 + growth_rate)
                else:
                    bal_before_growth = end_bal

                # Per-account withdrawal amounts derived from balance snapshots
                withdrawn_expense = pre_expense_snap.get(acct.id, 0.0) - pre_tax_snap.get(acct.id, 0.0)
                withdrawn_tax     = pre_tax_snap.get(acct.id, 0.0) - bal_before_growth

                account_rows.append({
                    "account_id":         acct.id,
                    "account_name":       acct.name,
                    "tax_treatment":      acct.tax_treatment,
                    "asset_class":        acct.asset_class,
                    "start_balance":      pre_expense_snap.get(acct.id, 0.0),
                    "growth_rate":        growth_rate,
                    "rmd_amount":         rmd_amt,
                    "end_balance":        end_bal,
                    "withdrawn_expense":  max(0.0, withdrawn_expense),
                    "withdrawn_tax":      max(0.0, withdrawn_tax),
                })

            # Build income detail for this year
            income_sources_detail = []
            for src in plan.income_sources:
                if src.start_age <= age <= src.end_age:
                    income_sources_detail.append({
                        "name":           src.name,
                        "income_type":    src.income_type,
                        "gross_amount":   src.annual_amount,
                        "is_active":      True,
                    })
            # Step 1b bond interest: taxable brokerage bond accounts generate
            # ordinary income each year. Balance at Step 1b equals pre_expense_snap
            # for brokerage accounts (RMDs do not apply to them).
            for acct in accounts:
                if acct.tax_treatment == "taxable_brokerage" and acct.asset_class == "bonds":
                    bal_at_1b = pre_expense_snap.get(acct.id, 0.0)
                    interest  = bal_at_1b * acct.annual_return_rate
                    if interest > 0.0:
                        income_sources_detail.append({
                            "name":        f"{acct.name} Interest",
                            "income_type": "bond_interest",
                            "gross_amount": interest,
                            "is_active":   True,
                        })

            # Build expense detail for this year
            expense_items_detail = []
            for exp in plan.expenses:
                if exp.start_age <= age <= exp.end_age:
                    adjusted = exp.annual_amount * ((1.0 + exp.inflation_rate) ** years_elapsed)
                    expense_items_detail.append({
                        "name":            exp.name,
                        "base_amount":     exp.annual_amount,
                        "inflation_rate":  exp.inflation_rate,
                        "adjusted_amount": adjusted,
                        "is_active":       True,
                    })

            # Compute tax withdrawal info
            tax_withdrawal_info = {
                "tax_shortfall":    tax_shortfall,
                "total_withdrawn":  0.0,
                "ordinary_income":  0.0,
                "ltcg_income":      0.0,
                "shortfall":        0.0,
            }
            if tax_shortfall > 0.0 and 'wr_tax' in locals():
                tax_withdrawal_info = {
                    "tax_shortfall":    tax_shortfall,
                    "total_withdrawn":  wr_tax.total_withdrawn,
                    "ordinary_income":  wr_tax.ordinary_income,
                    "ltcg_income":      wr_tax.ltcg_income,
                    "shortfall":        wr_tax.shortfall,
                }

            # Build the complete debug row for this age
            debug_row = {
                "age":              age,
                "accounts":         account_rows,
                "income": {
                    "sources":                  income_sources_detail,
                    "ss_gross":                 ss_gross,
                    "ss_fraction":              ss_fraction,
                    "taxable_ss":               taxable_ss,
                    "provisional_income":       provisional,
                    "rmd_total":                rmd_total,
                    "total_gross_income":       available_income,
                    "other_ordinary":           other_ordinary,
                    "other_nontaxable":         other_nontaxable,
                    "available_income":         available_income,
                },
                "expenses": {
                    "items":          expense_items_detail,
                    "total_expenses": total_expenses,
                },
                "expense_withdrawal": {
                    "net_need":       expense_shortfall,
                    "total_withdrawn": wr_expense.total_withdrawn,
                    "ordinary_income": wr_expense.ordinary_income,
                    "ltcg_income":     wr_expense.ltcg_income,
                    "shortfall":       wr_expense.shortfall,
                },
                "tax": {
                    "total_ordinary_income": total_ordinary,
                    "total_ltcg_income":     ltcg_income,
                    "state_taxable_income":  state_taxable,
                    "federal_ordinary_tax":  fed_ordinary_only,
                    "federal_ltcg_tax":      fed_ltcg,
                    "state_tax":             state_tax,
                    "total_tax":             total_tax,
                    "effective_tax_rate":    eff_rate,
                },
                "tax_withdrawal":  tax_withdrawal_info,
                "portfolio_end":   portfolio_vals[age_idx],
                "failed":          not survived,
            }
            debug_rows.append(debug_row)

    return survived, portfolio_vals, account_vals, annual_details, income_details, expense_details, return_details, debug_rows


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
    all_portfolio     = np.zeros((config.num_runs, num_ages))
    all_accounts      = np.zeros((config.num_runs, n_accts, num_ages))
    all_stock_returns = np.zeros((config.num_runs, num_ages))

    successes  = 0
    all_annual:  List[List[dict]] = []
    all_income:  List[List[dict]] = []
    all_expense: List[List[dict]] = []
    all_return:  List[List[dict]] = []

    for run_idx in range(config.num_runs):
        # Sample a full sequence of annual stock returns for this run
        stock_returns = sample_annual_returns(
            num_ages, rng, first_year_regime=config.initial_market_regime
        )
        all_stock_returns[run_idx] = stock_returns

        # Deep-copy account balances so each run starts from the same position
        accounts_copy = [
            AccountState(
                id=a.id,
                name=a.name,
                tax_treatment=a.tax_treatment,
                asset_class=a.asset_class,
                balance=a.balance,
                annual_return_rate=a.annual_return_rate or 0.0,
                # Bond interest is taxed annually (Step 1b); withdrawals are tax-free.
                gains_pct=0.0 if (a.tax_treatment == "taxable_brokerage" and a.asset_class == "bonds") else (a.gains_pct or 0.0),
            )
            for a in plan.accounts
        ]

        survived, pv, av, ann_det, inc_det, exp_det, ret_det, _ = _simulate_one_run(
            plan=plan,
            accounts=accounts_copy,
            stock_returns=stock_returns,
            capture_debug=False,
        )

        if survived:
            successes += 1

        all_portfolio[run_idx] = pv
        all_accounts[run_idx]  = av    # shape: (n_accts, num_ages)
        all_annual.append(ann_det)
        all_income.append(inc_det)
        all_expense.append(exp_det)
        all_return.append(ret_det)

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
    # Representative runs: median, lower-band, upper-band
    # Each is the run whose final portfolio value is closest to that
    # percentile's value across all runs.
    # -----------------------------------------------------------------------
    final_vals    = all_portfolio[:, -1]
    median_final  = float(np.median(final_vals))
    p_lower_final = float(np.percentile(final_vals, config.lower_percentile))
    p_upper_final = float(np.percentile(final_vals, config.upper_percentile))

    median_idx = int(np.argmin(np.abs(final_vals - median_final)))
    lower_idx  = int(np.argmin(np.abs(final_vals - p_lower_final)))
    upper_idx  = int(np.argmin(np.abs(final_vals - p_upper_final)))

    # -----------------------------------------------------------------------
    # Account balances per representative run per account per age
    # -----------------------------------------------------------------------
    account_timeline: List[AgeAccountPoint] = []
    for band_name, run_idx in [('lower', lower_idx), ('median', median_idx), ('upper', upper_idx)]:
        for ai, acct in enumerate(plan.accounts):
            for age_idx in range(num_ages):
                age = plan.current_age + age_idx
                account_timeline.append(AgeAccountPoint(
                    account_id=acct.id,
                    account_name=acct.name,
                    age=age,
                    balance=float(all_accounts[run_idx, ai, age_idx]),
                    band=band_name,
                ))

    annual_detail: List[AnnualDetail] = (
        [AnnualDetail(band='lower',  **d) for d in all_annual[lower_idx]] +
        [AnnualDetail(band='median', **d) for d in all_annual[median_idx]] +
        [AnnualDetail(band='upper',  **d) for d in all_annual[upper_idx]]
    )
    income_detail: List[IncomeDetail] = (
        [IncomeDetail(band='lower',  **d) for d in all_income[lower_idx]] +
        [IncomeDetail(band='median', **d) for d in all_income[median_idx]] +
        [IncomeDetail(band='upper',  **d) for d in all_income[upper_idx]]
    )
    expense_detail: List[ExpenseDetail] = (
        [ExpenseDetail(band='lower',  **d) for d in all_expense[lower_idx]] +
        [ExpenseDetail(band='median', **d) for d in all_expense[median_idx]] +
        [ExpenseDetail(band='upper',  **d) for d in all_expense[upper_idx]]
    )
    return_detail: List[ReturnDetail] = (
        [ReturnDetail(band='lower',  **d) for d in all_return[lower_idx]] +
        [ReturnDetail(band='median', **d) for d in all_return[median_idx]] +
        [ReturnDetail(band='upper',  **d) for d in all_return[upper_idx]]
    )

    representative_returns = {
        'lower':  all_stock_returns[lower_idx].tolist(),
        'median': all_stock_returns[median_idx].tolist(),
        'upper':  all_stock_returns[upper_idx].tolist(),
    }

    return SimulationResult(
        success_rate=success_rate,
        portfolio_timeline=portfolio_timeline,
        account_timeline=account_timeline,
        annual_detail=annual_detail,
        income_detail=income_detail,
        expense_detail=expense_detail,
        return_detail=return_detail,
        representative_returns=representative_returns,
    )


def simulate_debug(
    plan:          PlanInputs,
    stock_returns: Optional[np.ndarray] = None,
) -> List[dict]:
    """
    Run a single simulation with full debug capture.

    If stock_returns is provided (a pre-computed return sequence from a
    representative run), that sequence is used directly — reproducing the
    exact run stored in the simulation result.  If omitted, a fresh random
    sequence is generated with seed=42 for fallback use.

    Returns
    -------
    List[dict] : one dict per simulated year with full calculation details
    """
    import copy

    num_ages = plan.planning_horizon

    if stock_returns is None:
        rng = np.random.default_rng(42)
        stock_returns = sample_annual_returns(num_ages, rng, first_year_regime=None)

    accounts_copy = [copy.deepcopy(a) for a in plan.accounts]

    _, _, _, _, _, _, _, debug_rows = _simulate_one_run(
        plan=plan,
        accounts=accounts_copy,
        stock_returns=stock_returns,
        capture_debug=True,
    )

    return debug_rows
