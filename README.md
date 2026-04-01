# FuegoPro

Early retirement planning app with Monte Carlo simulation.

## Running the App

You need two terminals — one for the backend, one for the frontend.

### Terminal 1 — Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 9000
```

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## First-Time Setup

Only needed once after cloning.

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

## Simulation Engine

The core simulation runs a **Monte Carlo retirement model** — the entry point is
`backend/services/simulation.py: simulate(plan, config, seed)`.

### High-level flow

1. **1,000 runs** (configurable). Each run samples a unique sequence of annual
   stock returns from block-bootstrapped S&P 500 history
   (`backend/data/historic_returns.py`).
2. **Year-by-year loop** inside each run (`_simulate_one_run`). For each year:
   - Collect active income (employment, SS, pension, rental, other)
   - Add bond interest as ordinary income (taxable brokerage bond accounts only)
   - Take mandatory RMDs from traditional accounts (age ≥ 73, IRS Uniform Lifetime Table)
   - Compute inflation-adjusted expenses
   - Withdraw from accounts in tax-efficient order (cash → brokerage → traditional) to cover any shortfall
   - Calculate federal + state taxes (ordinary income and LTCG via stacking method)
   - Withdraw again if needed to cover the tax bill
   - Apply end-of-year investment returns (stocks use the sampled return; bonds/savings use a fixed rate)
   - Record end-of-year balances and tax breakdown
3. **Aggregation** across all runs:
   - `portfolio_timeline` — cross-sectional percentile bands (p_lower / p50 / p_upper) at each age
   - Three **representative runs** selected — the actual runs whose final portfolio is closest to each percentile band's final value

### Key files

| File | Purpose |
|------|---------|
| `backend/services/simulation.py` | Monte Carlo engine — `simulate()` and `_simulate_one_run()` |
| `backend/services/withdrawal.py` | Tax-efficient withdrawal sequencing; tracks LTCG via `gains_pct` |
| `backend/services/tax.py` | Federal (ordinary + LTCG stacking) and California state tax |
| `backend/services/rmd.py` | IRS Uniform Lifetime Table RMD calculations |
| `backend/config/tax_brackets.py` | 2024 federal and California tax brackets and thresholds |
| `backend/data/historic_returns.py` | Block-bootstrap sampler for S&P 500 historical returns |
| `backend/routers/simulation.py` | REST endpoints: `POST /simulate/{plan_id}`, `GET /simulate/{plan_id}/results`, `GET /simulate/{plan_id}/debug` |
| `backend/models/db_models.py` | SQLite schema — `SimulationResult` and its child timeline/detail tables |

### Two output datasets (important distinction)

The simulation produces two fundamentally different datasets, both stored per plan:

- **Statistical** (`portfolio_timeline`): at each age, cross-sectional percentiles
  taken across *all* 1,000 runs independently. Used for the portfolio value band
  chart. The p50 line at age 70 is the median across all runs at that age — it
  may not correspond to any single realistic run.
- **Scenario** (`account_timeline`, `annual_detail`, etc.): data from three
  specific representative runs (lower / median / upper) selected by which run's
  *final* portfolio landed closest to each percentile. These are internally
  consistent year-by-year paths used for the account balance chart, tax detail,
  income/expense breakdown, and the debug table.

### Account types and tax treatment

| `tax_treatment` | `asset_class` | Growth taxed as |
|-----------------|---------------|-----------------|
| `traditional` | `stocks` | Ordinary income on withdrawal (RMD or discretionary) |
| `taxable_brokerage` | `stocks` | LTCG on gains fraction (`gains_pct`) at withdrawal |
| `taxable_brokerage` | `bonds` | Ordinary income annually (interest); principal does not compound separately |
| `cash_savings` | `savings` | Ordinary income annually (interest) |

`gains_pct` on a taxable brokerage stock account tracks the fraction of current
balance that is unrealized gain. It starts from the user-supplied value and is
updated each year: `(old_gains + return_amount) / new_balance`. Withdrawals
generate `withdrawal × gains_pct` of LTCG income.

### Inflation and bracket indexing

All income is deflated to 2024 real dollars before applying tax brackets, then
the resulting tax is re-inflated. This is equivalent to indexing the bracket
thresholds to the plan's inflation rate each year, preventing bracket creep. The
bracket *rates* are fixed at 2024 law.
