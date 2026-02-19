"""
Tax-efficient withdrawal sequencing for the FuegoPro simulation engine.

Withdrawal order (most to least tax-efficient):
  1. cash_savings      — already after-tax; withdrawals generate no taxable income
  2. taxable_brokerage — only the gains_pct fraction is LTCG; basis is tax-free
  3. traditional       — full withdrawal amount is ordinary income

RMDs and user-planned 401k distributions are pulled before this function is
called for the general expense shortfall.
"""

from dataclasses import dataclass
from typing import List


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
    annual_return_rate: float  # 0.0 for stocks (caller uses historical return instead)
    gains_pct:          float  # fraction of brokerage withdrawal that is LTCG; 0.0 otherwise


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


# ---------------------------------------------------------------------------
# Withdrawal order
# ---------------------------------------------------------------------------

_ORDER = ("cash_savings", "taxable_brokerage", "traditional")


def withdraw_for_shortfall(accounts: List[AccountState], amount: float) -> WithdrawalResult:
    """
    Withdraw *amount* from *accounts* in tax-efficient order.

    Mutates account balances in place.  Iterates over the tax-treatment order
    and drains accounts of each type before moving to the next.  Stops as soon
    as the shortfall is met or every account is exhausted.

    Returns a WithdrawalResult summarising how much was taken and what tax
    categories the withdrawn dollars fall into.
    """
    result    = WithdrawalResult()
    remaining = amount

    for treatment in _ORDER:
        if remaining <= 0.0:
            break
        for acct in accounts:
            if acct.tax_treatment != treatment or acct.balance <= 0.0 or remaining <= 0.0:
                continue
            withdrawal       = min(acct.balance, remaining)
            acct.balance    -= withdrawal
            remaining       -= withdrawal
            result.total_withdrawn += withdrawal

            if treatment == "traditional":
                result.ordinary_income += withdrawal
            elif treatment == "taxable_brokerage":
                result.ltcg_income += withdrawal * acct.gains_pct

    result.shortfall = max(0.0, remaining)
    return result
