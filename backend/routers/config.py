"""
Simulation config API endpoints.

GET /api/config/simulation — return global simulation config (id=1)
PUT /api/config/simulation — update global simulation config
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.db_models import SimulationConfig as DBSimulationConfig
from models.schemas import SimConfigOut, SimConfigUpdate

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/simulation", response_model=SimConfigOut)
def get_sim_config(db: Session = Depends(get_db)):
    cfg = db.query(DBSimulationConfig).filter_by(id=1).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    return cfg


@router.put("/simulation", response_model=SimConfigOut)
def update_sim_config(data: SimConfigUpdate, db: Session = Depends(get_db)):
    if data.lower_percentile >= data.upper_percentile:
        raise HTTPException(
            status_code=422,
            detail="lower_percentile must be less than upper_percentile",
        )
    cfg = db.query(DBSimulationConfig).filter_by(id=1).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    cfg.num_runs = data.num_runs
    cfg.lower_percentile = data.lower_percentile
    cfg.upper_percentile = data.upper_percentile
    db.commit()
    db.refresh(cfg)
    return cfg
