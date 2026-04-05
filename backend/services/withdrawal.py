"""
Withdrawal sequencing for the FuegoPro simulation engine.

Accounts are drawn down in the order they appear in the user's plan.
Traditional accounts (401k/IRA) are only available once their start_age
is reached — the caller passes only active accounts, so eligibility is
already enforced before this function is called.

RMDs and user-planned 401k distributions are pulled before this function is
called for the general expense shortfall.
"""

from dataclasses import dataclass, field
from typing import List, Optional


# ---------------------------------------------------------------------------
# Account state (mutable within one simulation run)
# ---------------------------------------------------------------------------

@dataclass
class AccountState:
    """
    Runtime snapshot of one account in a single simulation run.
    balance is mutated in place as withdrawals and returns are applied.
    """
    id:                 int
    name:               str
    tax_treatment:      str    # 'traditional' | 'taxable_brokerage' | 'cash_savings'
    asset_class:        str    # 'stocks' | 'bonds' | 'savings'
    balance:            float
    annual_return_rate: Optional[float]  # None → use historical sampled return; number → constant annual rate
    gains_pct:          float  # fraction of brokerage withdrawal that is LTCG; 0.0 otherwise
    start_age:          Optional[int] = None  # if set, account is inactive until this age


# ---------------------------------------------------------------------------
# Withdrawal result
# ---------------------------------------------------------------------------

@dataclass
class WithdrawalResult:
    """Summary of one withdrawal round."""
    total_withdrawn: float = 0.0  # total dollars removed from accounts
    ordinary_income: float = 0.0  # amount taxable as ordinary income (from traditional)
    ltcg_income:     float = 0.0  # amount taxable as LTCG (from taxable brokerage)
    shortfall:       float = 0.0  # amount that could not be covered (all accounts dry)


def withdraw_for_shortfall(accounts: List[AccountState], amount: float) -> WithdrawalResult:
    """
    Withdraw *amount* from *accounts* in the order they are provided.

    Mutates account balances in place.  Drains each account in turn until
    the shortfall is met or every account is exhausted.

    Returns a WithdrawalResult summarising how much was taken and what tax
    categories the withdrawn dollars fall into.
    """
    result    = WithdrawalResult()
    remaining = amount

    for acct in accounts:
        if acct.balance <= 0.0 or remaining <= 0.0:
            continue
        withdrawal       = min(acct.balance, remaining)
        acct.balance    -= withdrawal
        remaining       -= withdrawal
        result.total_withdrawn += withdrawal

        if acct.tax_treatment == "traditional":
            result.ordinary_income += withdrawal
        elif acct.tax_treatment == "taxable_brokerage":
            result.ltcg_income += withdrawal * acct.gains_pct

    result.shortfall = max(0.0, remaining)
    return result
