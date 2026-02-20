"""
Simulation API endpoints.

POST /api/simulate/{plan_id}         — run simulation, persist and return results
GET  /api/simulate/{plan_id}/results — return cached results (404 if none)
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from database import get_db
from models.db_models import (
    Plan,
    SimulationAnnualDetail,
    SimulationExpenseDetail,
    SimulationIncomeDetail,
    SimulationAccountTimeline,
    SimulationPortfolioTimeline,
    SimulationReturnDetail,
    SimulationConfig as DBSimulationConfig,
)
from models.db_models import SimulationResult as DBSimulationResult
from models.schemas import ComparePlanResult, CompareRequest, SimulationResultOut
from services.simulation import (
    ExpenseInput,
    IncomeSourceInput,
    PlanInputs,
    SimulationConfig,
    simulate,
)
from services.withdrawal import AccountState

router = APIRouter(prefix="/api/simulate", tags=["simulation"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_result(plan_id: int, db: Session) -> DBSimulationResult:
    """Load a simulation result with all child rows eagerly; 404 if missing."""
    result = (
        db.query(DBSimulationResult)
        .options(
            selectinload(DBSimulationResult.portfolio_timeline),
            selectinload(DBSimulationResult.account_timeline),
            selectinload(DBSimulationResult.annual_detail),
            selectinload(DBSimulationResult.income_detail),
            selectinload(DBSimulationResult.expense_detail),
            selectinload(DBSimulationResult.return_detail),
        )
        .filter_by(plan_id=plan_id)
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="No simulation results found for this plan")
    return result


def _build_plan_inputs(plan: Plan) -> PlanInputs:
    """Convert ORM Plan (with loaded relationships) to simulation PlanInputs."""
    accounts = [
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
    income_sources = [
        IncomeSourceInput(
            name=s.name,
            income_type=s.income_type,
            annual_amount=s.annual_amount,
            start_age=s.start_age,
            end_age=s.end_age,
            is_taxable=s.is_taxable,
        )
        for s in plan.income_sources
    ]
    expenses = [
        ExpenseInput(
            name=e.name,
            annual_amount=e.annual_amount,
            start_age=e.start_age,
            end_age=e.end_age,
            inflation_rate=e.inflation_rate,
        )
        for e in plan.expenses
    ]
    return PlanInputs(
        current_age=plan.current_age,
        planning_horizon=plan.planning_horizon,
        filing_status=plan.filing_status,
        state_tax_type=plan.state_tax_type,
        state_tax_rate=plan.state_tax_rate,
        accounts=accounts,
        income_sources=income_sources,
        expenses=expenses,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/compare", response_model=list[ComparePlanResult])
def compare_plans(body: CompareRequest, db: Session = Depends(get_db)):
    """Run simulations for up to 3 plans and return results side-by-side (not persisted)."""
    if not (1 <= len(body.plan_ids) <= 3):
        raise HTTPException(status_code=400, detail="Provide between 1 and 3 plan IDs")

    cfg_row = db.query(DBSimulationConfig).filter_by(id=1).first()
    config = SimulationConfig(
        num_runs=body.num_runs if body.num_runs is not None else cfg_row.num_runs,
        lower_percentile=body.lower_percentile if body.lower_percentile is not None else cfg_row.lower_percentile,
        upper_percentile=body.upper_percentile if body.upper_percentile is not None else cfg_row.upper_percentile,
    )

    results = []
    for plan_id in body.plan_ids:
        plan = db.query(Plan).filter(Plan.id == plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found")
        plan_inputs = _build_plan_inputs(plan)
        sim = simulate(plan_inputs, config)
        # Update cached rate so the Plans list reflects the compare result
        plan.last_success_rate = sim.success_rate
        plan.last_simulated_at = datetime.utcnow()
        results.append({
            "plan_id": plan.id,
            "plan_name": plan.name,
            "success_rate": sim.success_rate,
            "num_runs": config.num_runs,
            "lower_percentile": config.lower_percentile,
            "upper_percentile": config.upper_percentile,
            "portfolio_timeline": [
                {"age": pt.age, "p50": pt.p50, "p_lower": pt.p_lower, "p_upper": pt.p_upper}
                for pt in sim.portfolio_timeline
            ],
        })
    db.commit()
    return results


@router.post("/{plan_id}", response_model=SimulationResultOut)
def run_simulation(
    plan_id: int,
    num_runs: Optional[int] = Query(default=None, ge=10, le=10000),
    lower_percentile: Optional[int] = Query(default=None, ge=1, le=49),
    upper_percentile: Optional[int] = Query(default=None, ge=51, le=99),
    db: Session = Depends(get_db),
):
    # Load plan with all child rows
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Load global simulation config (always id=1), then apply any per-run overrides
    cfg_row = db.query(DBSimulationConfig).filter_by(id=1).first()
    config = SimulationConfig(
        num_runs=num_runs if num_runs is not None else cfg_row.num_runs,
        lower_percentile=lower_percentile if lower_percentile is not None else cfg_row.lower_percentile,
        upper_percentile=upper_percentile if upper_percentile is not None else cfg_row.upper_percentile,
    )

    # Run Monte Carlo simulation
    plan_inputs = _build_plan_inputs(plan)
    result      = simulate(plan_inputs, config)

    # Remove any existing results for this plan (cascade deletes children)
    db.query(DBSimulationResult).filter_by(plan_id=plan_id).delete()

    # Persist header
    db_result = DBSimulationResult(
        plan_id=plan_id,
        num_runs=config.num_runs,
        lower_percentile=config.lower_percentile,
        upper_percentile=config.upper_percentile,
        success_rate=result.success_rate,
    )
    db.add(db_result)
    db.flush()   # get db_result.id before inserting children

    # Persist portfolio timeline
    for pt in result.portfolio_timeline:
        db.add(SimulationPortfolioTimeline(
            result_id=db_result.id,
            age=pt.age, p50=pt.p50, p_lower=pt.p_lower, p_upper=pt.p_upper,
        ))

    # Persist account timeline (all three bands)
    for at in result.account_timeline:
        db.add(SimulationAccountTimeline(
            result_id=db_result.id,
            account_id=at.account_id, account_name=at.account_name,
            age=at.age, band=at.band, balance=at.balance,
        ))

    # Persist annual tax detail (all three bands)
    for ad in result.annual_detail:
        db.add(SimulationAnnualDetail(
            result_id=db_result.id,
            band=ad.band,
            age=ad.age,
            tax_federal_ordinary=ad.tax_federal_ordinary,
            tax_federal_ltcg=ad.tax_federal_ltcg,
            tax_state=ad.tax_state,
            effective_tax_rate=ad.effective_tax_rate,
        ))

    # Persist income detail (all three bands)
    for inc in result.income_detail:
        db.add(SimulationIncomeDetail(
            result_id=db_result.id,
            band=inc.band,
            age=inc.age, source_name=inc.source_name, amount=inc.amount,
        ))

    # Persist expense detail (all three bands)
    for exp in result.expense_detail:
        db.add(SimulationExpenseDetail(
            result_id=db_result.id,
            band=exp.band,
            age=exp.age, expense_name=exp.expense_name, amount=exp.amount,
        ))

    # Persist investment return detail (all three bands)
    for ret in result.return_detail:
        db.add(SimulationReturnDetail(
            result_id=db_result.id,
            band=ret.band,
            age=ret.age,
            account_id=ret.account_id,
            account_name=ret.account_name,
            return_amount=ret.return_amount,
        ))

    # Update plan's cached simulation fields
    plan.last_simulated_at = datetime.utcnow()
    plan.last_success_rate = result.success_rate

    db.commit()

    # Return with all child rows loaded
    return _load_result(plan_id, db)


@router.get("/{plan_id}/results", response_model=SimulationResultOut)
def get_results(plan_id: int, db: Session = Depends(get_db)):
    return _load_result(plan_id, db)
