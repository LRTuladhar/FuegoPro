from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Account
# ---------------------------------------------------------------------------

class AccountBase(BaseModel):
    name: str
    tax_treatment: str       # 'traditional' | 'taxable_brokerage' | 'cash_savings'
    asset_class: str         # 'stocks' | 'bonds' | 'savings'
    balance: float
    annual_return_rate: Optional[float] = None
    gains_pct: Optional[float] = None


class AccountCreate(AccountBase):
    pass


class AccountOut(AccountBase):
    id: int
    plan_id: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Income Source
# ---------------------------------------------------------------------------

class IncomeSourceBase(BaseModel):
    name: str
    income_type: str         # 'employment' | 'social_security' | 'pension' | 'rental' | '401k_distribution' | 'other'
    annual_amount: float
    start_age: int
    end_age: int
    is_taxable: Optional[bool] = None


class IncomeSourceCreate(IncomeSourceBase):
    pass


class IncomeSourceOut(IncomeSourceBase):
    id: int
    plan_id: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Expense
# ---------------------------------------------------------------------------

class ExpenseBase(BaseModel):
    name: str
    annual_amount: float
    start_age: int
    end_age: int
    inflation_rate: float


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseOut(ExpenseBase):
    id: int
    plan_id: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Plan
# ---------------------------------------------------------------------------

class PlanBase(BaseModel):
    name: str
    current_age: int
    planning_horizon: int
    filing_status: str       # 'single' | 'married'
    state_tax_type: str      # 'none' | 'moderate' | 'california'
    state_tax_rate: Optional[float] = None


class PlanCreate(PlanBase):
    accounts: list[AccountCreate] = []
    income_sources: list[IncomeSourceCreate] = []
    expenses: list[ExpenseCreate] = []


class PlanUpdate(PlanBase):
    accounts: list[AccountCreate] = []
    income_sources: list[IncomeSourceCreate] = []
    expenses: list[ExpenseCreate] = []


class PlanSummary(BaseModel):
    """Lightweight plan row for the plans list screen."""
    id: int
    name: str
    current_age: int
    planning_horizon: int
    filing_status: str
    state_tax_type: str
    last_simulated_at: Optional[datetime] = None
    last_success_rate: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PlanOut(PlanSummary):
    """Full plan with all child records."""
    state_tax_rate: Optional[float] = None
    accounts: list[AccountOut] = []
    income_sources: list[IncomeSourceOut] = []
    expenses: list[ExpenseOut] = []


# ---------------------------------------------------------------------------
# Simulation results
# ---------------------------------------------------------------------------

class PortfolioTimelinePoint(BaseModel):
    age: int
    p50: float
    p_lower: float
    p_upper: float

    class Config:
        from_attributes = True


class AccountTimelinePoint(BaseModel):
    account_id: int
    account_name: str
    age: int
    band: str
    balance: float

    class Config:
        from_attributes = True


class AnnualDetailOut(BaseModel):
    band: str
    age: int
    tax_federal_ordinary: float
    tax_federal_ltcg: float
    tax_state: float
    effective_tax_rate: float

    class Config:
        from_attributes = True


class IncomeDetailOut(BaseModel):
    band: str
    age: int
    source_name: str
    amount: float

    class Config:
        from_attributes = True


class ExpenseDetailOut(BaseModel):
    band: str
    age: int
    expense_name: str
    amount: float

    class Config:
        from_attributes = True


class ReturnDetailOut(BaseModel):
    band: str
    age: int
    account_id: int
    account_name: str
    return_amount: float

    class Config:
        from_attributes = True


class SimulationResultOut(BaseModel):
    plan_id: int
    success_rate: float
    num_runs: int
    lower_percentile: int
    upper_percentile: int
    created_at: datetime
    portfolio_timeline: list[PortfolioTimelinePoint] = []
    account_timeline: list[AccountTimelinePoint] = []
    annual_detail: list[AnnualDetailOut] = []
    income_detail: list[IncomeDetailOut] = []
    expense_detail: list[ExpenseDetailOut] = []
    return_detail: list[ReturnDetailOut] = []

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------

class ComparePlanResult(BaseModel):
    plan_id: int
    plan_name: str
    success_rate: float
    num_runs: int
    lower_percentile: int
    upper_percentile: int
    portfolio_timeline: list[PortfolioTimelinePoint] = []


class CompareRequest(BaseModel):
    plan_ids: list[int]
    num_runs: Optional[int] = None
    lower_percentile: Optional[int] = None
    upper_percentile: Optional[int] = None


# ---------------------------------------------------------------------------
# Simulation config
# ---------------------------------------------------------------------------

class SimConfigOut(BaseModel):
    num_runs: int
    lower_percentile: int
    upper_percentile: int

    class Config:
        from_attributes = True


class SimConfigUpdate(BaseModel):
    num_runs: int
    lower_percentile: int
    upper_percentile: int
