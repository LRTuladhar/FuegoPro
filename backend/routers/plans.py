from typing import Union

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.db_models import Account, Expense, IncomeSource, Plan
from models.db_models import SimulationResult as DBSimulationResult
from models.schemas import PlanCreate, PlanOut, PlanSummary, PlanUpdate

router = APIRouter(prefix="/api/plans", tags=["plans"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_plan_or_404(plan_id: int, db: Session) -> Plan:
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


def _replace_children(plan: Plan, payload: Union[PlanCreate, PlanUpdate], db: Session) -> None:
    """Delete existing child rows and insert fresh ones from the payload.

    Simulation results are deleted first so that the DB-level cascade clears
    simulation_account_timeline rows (which reference accounts.id) before the
    accounts themselves are deleted — avoiding a FK constraint violation.
    Editing a plan inherently invalidates its previous simulation results anyway.
    """
    # Clear stale simulation results (DB cascade removes simulation_account_timeline etc.)
    db.query(DBSimulationResult).filter_by(plan_id=plan.id).delete()
    plan.last_simulated_at = None
    plan.last_success_rate = None
    db.flush()

    db.query(Account).filter(Account.plan_id == plan.id).delete()
    db.query(IncomeSource).filter(IncomeSource.plan_id == plan.id).delete()
    db.query(Expense).filter(Expense.plan_id == plan.id).delete()

    for a in payload.accounts:
        db.add(Account(plan_id=plan.id, **a.model_dump()))
    for i in payload.income_sources:
        db.add(IncomeSource(plan_id=plan.id, **i.model_dump()))
    for e in payload.expenses:
        db.add(Expense(plan_id=plan.id, **e.model_dump()))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[PlanSummary])
def list_plans(db: Session = Depends(get_db)):
    return db.query(Plan).order_by(Plan.created_at.desc()).all()


@router.post("", response_model=PlanOut, status_code=201)
def create_plan(payload: PlanCreate, db: Session = Depends(get_db)):
    plan = Plan(
        name=payload.name,
        current_age=payload.current_age,
        planning_horizon=payload.planning_horizon,
        filing_status=payload.filing_status,
        state_tax_type=payload.state_tax_type,
        state_tax_rate=payload.state_tax_rate,
    )
    db.add(plan)
    db.flush()  # get plan.id before inserting children

    for a in payload.accounts:
        db.add(Account(plan_id=plan.id, **a.model_dump()))
    for i in payload.income_sources:
        db.add(IncomeSource(plan_id=plan.id, **i.model_dump()))
    for e in payload.expenses:
        db.add(Expense(plan_id=plan.id, **e.model_dump()))

    db.commit()
    db.refresh(plan)
    return plan


@router.get("/{plan_id}", response_model=PlanOut)
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    return _get_plan_or_404(plan_id, db)


@router.put("/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, payload: PlanUpdate, db: Session = Depends(get_db)):
    plan = _get_plan_or_404(plan_id, db)

    plan.name = payload.name
    plan.current_age = payload.current_age
    plan.planning_horizon = payload.planning_horizon
    plan.filing_status = payload.filing_status
    plan.state_tax_type = payload.state_tax_type
    plan.state_tax_rate = payload.state_tax_rate

    _replace_children(plan, payload, db)

    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=204)
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = _get_plan_or_404(plan_id, db)
    db.delete(plan)
    db.commit()


@router.post("/{plan_id}/duplicate", response_model=PlanOut, status_code=201)
def duplicate_plan(plan_id: int, db: Session = Depends(get_db)):
    original = _get_plan_or_404(plan_id, db)

    copy = Plan(
        name=f"{original.name} (copy)",
        current_age=original.current_age,
        planning_horizon=original.planning_horizon,
        filing_status=original.filing_status,
        state_tax_type=original.state_tax_type,
        state_tax_rate=original.state_tax_rate,
    )
    db.add(copy)
    db.flush()

    for a in original.accounts:
        db.add(Account(
            plan_id=copy.id,
            name=a.name,
            tax_treatment=a.tax_treatment,
            asset_class=a.asset_class,
            balance=a.balance,
            annual_return_rate=a.annual_return_rate,
            gains_pct=a.gains_pct,
        ))
    for i in original.income_sources:
        db.add(IncomeSource(
            plan_id=copy.id,
            name=i.name,
            income_type=i.income_type,
            annual_amount=i.annual_amount,
            start_age=i.start_age,
            end_age=i.end_age,
            is_taxable=i.is_taxable,
        ))
    for e in original.expenses:
        db.add(Expense(
            plan_id=copy.id,
            name=e.name,
            annual_amount=e.annual_amount,
            start_age=e.start_age,
            end_age=e.end_age,
            inflation_rate=e.inflation_rate,
        ))

    db.commit()
    db.refresh(copy)
    return copy
