from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


# ---------------------------------------------------------------------------
# Plan data tables
# ---------------------------------------------------------------------------

class Plan(Base):
    __tablename__ = "plans"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    name              = Column(String, nullable=False)
    current_age       = Column(Integer, nullable=False)
    planning_horizon  = Column(Integer, nullable=False)
    filing_status     = Column(String, nullable=False)  # 'single' | 'married'
    state_tax_type    = Column(String, nullable=False)  # 'none' | 'moderate' | 'california'
    state_tax_rate    = Column(Float, nullable=True)    # flat rate for 'moderate' only
    last_simulated_at = Column(DateTime, nullable=True)
    last_success_rate = Column(Float, nullable=True)    # cached from last simulation run
    created_at        = Column(DateTime, default=datetime.utcnow)
    updated_at        = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    accounts         = relationship("Account",       back_populates="plan", cascade="all, delete-orphan")
    income_sources   = relationship("IncomeSource",  back_populates="plan", cascade="all, delete-orphan")
    expenses         = relationship("Expense",       back_populates="plan", cascade="all, delete-orphan")
    simulation_result = relationship("SimulationResult", back_populates="plan",
                                     cascade="all, delete-orphan", uselist=False)


class Account(Base):
    __tablename__ = "accounts"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    plan_id            = Column(Integer, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    name               = Column(String, nullable=False)
    tax_treatment      = Column(String, nullable=False)  # 'traditional' | 'taxable_brokerage' | 'cash_savings'
    asset_class        = Column(String, nullable=False)  # 'stocks' | 'bonds' | 'savings'
    balance            = Column(Float, nullable=False)
    annual_return_rate = Column(Float, nullable=True)    # bonds/savings only; null for stocks
    gains_pct          = Column(Float, nullable=True)    # taxable_brokerage only: % of withdrawals that are LTCG

    plan = relationship("Plan", back_populates="accounts")


class IncomeSource(Base):
    __tablename__ = "income_sources"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    plan_id       = Column(Integer, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    name          = Column(String, nullable=False)
    income_type   = Column(String, nullable=False)
    # 'employment' | 'social_security' | 'pension' | 'rental' | '401k_distribution' | 'other'
    annual_amount = Column(Float, nullable=False)
    start_age     = Column(Integer, nullable=False)
    end_age       = Column(Integer, nullable=False)
    is_taxable    = Column(Boolean, nullable=True)  # only used for income_type='other'

    plan = relationship("Plan", back_populates="income_sources")


class Expense(Base):
    __tablename__ = "expenses"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    plan_id        = Column(Integer, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    name           = Column(String, nullable=False)
    annual_amount  = Column(Float, nullable=False)   # in today's dollars
    start_age      = Column(Integer, nullable=False)
    end_age        = Column(Integer, nullable=False)
    inflation_rate = Column(Float, nullable=False)   # e.g. 0.025 for 2.5%

    plan = relationship("Plan", back_populates="expenses")


# ---------------------------------------------------------------------------
# Simulation result tables
# ---------------------------------------------------------------------------

class SimulationResult(Base):
    """Header row for a simulation run. One row per plan, replaced on each re-run."""
    __tablename__ = "simulation_results"
    __table_args__ = (UniqueConstraint("plan_id"),)

    id               = Column(Integer, primary_key=True, autoincrement=True)
    plan_id          = Column(Integer, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False)
    num_runs         = Column(Integer, nullable=False)
    lower_percentile = Column(Integer, nullable=False)
    upper_percentile = Column(Integer, nullable=False)
    success_rate     = Column(Float, nullable=False)
    created_at       = Column(DateTime, default=datetime.utcnow)

    plan              = relationship("Plan", back_populates="simulation_result")
    portfolio_timeline = relationship("SimulationPortfolioTimeline", back_populates="result",
                                      cascade="all, delete-orphan")
    account_timeline  = relationship("SimulationAccountTimeline",   back_populates="result",
                                      cascade="all, delete-orphan")
    annual_detail     = relationship("SimulationAnnualDetail",      back_populates="result",
                                      cascade="all, delete-orphan")
    income_detail     = relationship("SimulationIncomeDetail",      back_populates="result",
                                      cascade="all, delete-orphan")
    expense_detail    = relationship("SimulationExpenseDetail",     back_populates="result",
                                      cascade="all, delete-orphan")
    return_detail     = relationship("SimulationReturnDetail",      back_populates="result",
                                      cascade="all, delete-orphan")


class SimulationPortfolioTimeline(Base):
    """Aggregated total portfolio value percentiles by age. One row per age."""
    __tablename__ = "simulation_portfolio_timeline"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    result_id = Column(Integer, ForeignKey("simulation_results.id", ondelete="CASCADE"), nullable=False)
    age       = Column(Integer, nullable=False)
    p50       = Column(Float, nullable=False)   # median portfolio value
    p_lower   = Column(Float, nullable=False)   # lower percentile value
    p_upper   = Column(Float, nullable=False)   # upper percentile value

    result = relationship("SimulationResult", back_populates="portfolio_timeline")


class SimulationAccountTimeline(Base):
    """Account balance per band per account per age. band: 'median' | 'lower' | 'upper'."""
    __tablename__ = "simulation_account_timeline"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    result_id    = Column(Integer, ForeignKey("simulation_results.id", ondelete="CASCADE"), nullable=False)
    account_id   = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    account_name = Column(String, nullable=False)  # denormalized; account may be renamed later
    age          = Column(Integer, nullable=False)
    band         = Column(String, nullable=False)
    balance      = Column(Float, nullable=False)

    result = relationship("SimulationResult", back_populates="account_timeline")


class SimulationAnnualDetail(Base):
    """Tax breakdown per band per age. band: 'median' | 'lower' | 'upper'."""
    __tablename__ = "simulation_annual_detail"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    result_id            = Column(Integer, ForeignKey("simulation_results.id", ondelete="CASCADE"), nullable=False)
    band                 = Column(String, nullable=False)
    age                  = Column(Integer, nullable=False)
    tax_federal_ordinary = Column(Float, nullable=False)
    tax_federal_ltcg     = Column(Float, nullable=False)
    tax_state            = Column(Float, nullable=False)
    effective_tax_rate   = Column(Float, nullable=False)

    result = relationship("SimulationResult", back_populates="annual_detail")


class SimulationIncomeDetail(Base):
    """Income breakdown per band. band: 'median' | 'lower' | 'upper'."""
    __tablename__ = "simulation_income_detail"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    result_id   = Column(Integer, ForeignKey("simulation_results.id", ondelete="CASCADE"), nullable=False)
    band        = Column(String, nullable=False)
    age         = Column(Integer, nullable=False)
    source_name = Column(String, nullable=False)
    amount      = Column(Float, nullable=False)

    result = relationship("SimulationResult", back_populates="income_detail")


class SimulationExpenseDetail(Base):
    """Expense breakdown per band. band: 'median' | 'lower' | 'upper'."""
    __tablename__ = "simulation_expense_detail"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    result_id    = Column(Integer, ForeignKey("simulation_results.id", ondelete="CASCADE"), nullable=False)
    band         = Column(String, nullable=False)
    age          = Column(Integer, nullable=False)
    expense_name = Column(String, nullable=False)
    amount       = Column(Float, nullable=False)

    result = relationship("SimulationResult", back_populates="expense_detail")


class SimulationReturnDetail(Base):
    """Investment return per account per band per age. band: 'median' | 'lower' | 'upper'."""
    __tablename__ = "simulation_return_detail"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    result_id     = Column(Integer, ForeignKey("simulation_results.id", ondelete="CASCADE"), nullable=False)
    band          = Column(String, nullable=False)
    age           = Column(Integer, nullable=False)
    account_id    = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    account_name  = Column(String, nullable=False)
    return_amount = Column(Float, nullable=False)

    result = relationship("SimulationResult", back_populates="return_detail")


# ---------------------------------------------------------------------------
# Global config table
# ---------------------------------------------------------------------------

class SimulationConfig(Base):
    """Single-row global simulation config. Always id=1."""
    __tablename__ = "simulation_config"

    id               = Column(Integer, primary_key=True)
    num_runs         = Column(Integer, nullable=False, default=1000)
    lower_percentile = Column(Integer, nullable=False, default=10)
    upper_percentile = Column(Integer, nullable=False, default=90)
