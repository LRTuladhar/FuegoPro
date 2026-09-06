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
   - Withdraw from accounts in user-defined plan order to cover any shortfall
     (traditional accounts are locked until age 60, regardless of `start_age`)
   - Calculate federal + state taxes (ordinary income and LTCG via stacking method)
   - Withdraw again if needed to cover the tax bill
   - Apply end-of-year investment returns (stocks use the sampled return or a fixed
     constant rate; bonds/savings use a fixed rate)
   - Record end-of-year balances and tax breakdown
3. **Aggregation** across all runs:
   - `portfolio_timeline` — cross-sectional percentile bands (p_lower / p50 / p_upper) at each age
   - Three **representative runs** selected — the actual runs whose final portfolio is closest to each percentile band's final value

### Key files

| File | Purpose |
|------|---------|
| `backend/services/simulation.py` | Monte Carlo engine — `simulate()`, `_simulate_one_run()`, `simulate_sensitivity()`, `simulate_debug()` |
| `backend/services/withdrawal.py` | Sequential withdrawal from accounts in plan order; tracks LTCG via `gains_pct` |
| `backend/services/tax.py` | Federal (ordinary + LTCG stacking) and California state tax |
| `backend/services/rmd.py` | IRS Uniform Lifetime Table RMD calculations |
| `backend/config/tax_brackets.py` | 2024 federal and California tax brackets and thresholds |
| `backend/data/historic_returns.py` | Block-bootstrap sampler for S&P 500 historical returns |
| `backend/routers/simulation.py` | REST endpoints: `POST /simulate/{plan_id}`, `GET /simulate/{plan_id}/results`, `GET /simulate/{plan_id}/debug`, `POST /simulate/{plan_id}/sensitivity`, `POST /simulate/compare` |
| `backend/routers/plans.py` | CRUD for plans: list, create, get, update, delete, duplicate |
| `backend/routers/config.py` | Global simulation config defaults |
| `backend/models/db_models.py` | SQLite schema — plans, accounts, income sources, expenses, simulation result tables |

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
| `taxable_brokerage` | `bonds` | Ordinary income annually (interest); withdrawals are basis-free |
| `cash_savings` | `savings` | Ordinary income annually (interest) |

`gains_pct` on a taxable brokerage stock account tracks the fraction of current
balance that is unrealized gain. It starts from the user-supplied value and is
updated each year: `(old_gains + return_amount) / new_balance`. Withdrawals
generate `withdrawal × gains_pct` of LTCG income.

### Stock return modes

Each stock account independently uses one of two return modes:

- **Historical** (default, leave Return Rate blank): annual returns are sampled
  from block-bootstrapped S&P 500 history. The initial market regime (bear/bull/random)
  and stock return offset settings apply to these accounts.
- **Constant rate** (enter a decimal, e.g. `0.07` for 7%): the account grows at
  that fixed rate every year. Market regime and return offset are ignored for
  constant-rate accounts.

### Withdrawal order

Accounts are drawn down in the order they appear in the user's Assets list.
Drag-and-drop reordering in the plan editor controls this sequence directly.
Constraints:

- **Traditional accounts (401k/IRA)** cannot be withdrawn before age 60,
  regardless of the account's `Start Age` setting.
- **RMDs** (age ≥ 73) are taken before any discretionary withdrawal.
- After expense withdrawals, a second withdrawal pass covers the resulting tax bill.

### Inflation and bracket indexing

All income is deflated to 2024 real dollars before applying tax brackets, then
the resulting tax is re-inflated. This is equivalent to indexing the bracket
thresholds to the plan's inflation rate each year, preventing bracket creep. The
bracket *rates* are fixed at 2024 law.

### Social Security taxation

The taxable fraction of SS benefits is computed using the IRS provisional income
formula each year:

- Provisional income = non-SS AGI + 0.5 × SS gross
- Single filer: 0% (≤ $25k), 50% ($25k–$34k), 85% (> $34k)
- Married filing jointly: 0% (≤ $32k), 50% ($32k–$44k), 85% (> $44k)

### Mortgage interest deduction

For mortgage expenses, the interest portion is tracked annually in nominal dollars,
deflated to base-year dollars, and compared against the standard deduction. The
larger of standard vs. itemized is applied.

---

## Features

### Plans

- Create, edit, duplicate, and delete retirement plans
- Each plan stores: profile (age, horizon, filing status, state tax), accounts, income sources, and expenses

### Accounts (Assets)

Fields: name, tax treatment, asset class, balance, start age, return rate, LTCG %

- **Tax treatment**: Traditional (pre-tax) · Taxable Brokerage · Cash/Savings
- **Asset class**: Stocks · Bonds · Savings
- **Return Rate**: Leave blank for stocks to use historical simulation; enter a decimal (e.g. `0.07`) for a constant annual rate
- **Start Age**: Account sits frozen (no growth, no withdrawals) until this age
- **LTCG %**: For taxable brokerage stocks — the fraction of current balance that is unrealized gain (used for tax calculations)
- Accounts are withdrawn in the order they appear in the list (drag to reorder)

### Income Sources

Types: Employment · Social Security · Pension · Rental · 401k Distribution · Other (taxable or non-taxable)

Each source has a start and end age.

### Expenses

Types:
- **Standard**: Annual amount in today's dollars, with a per-expense inflation rate
- **Mortgage**: Computes the fixed P+I payment from remaining balance, interest rate, and remaining periods (months); interest portion is tracked for itemized deduction

### Simulation Config

| Parameter | Default | Description |
|-----------|---------|-------------|
| Runs | 1,000 | Monte Carlo iterations |
| Lower band | 20th pct | Lower percentile for band display |
| Upper band | 80th pct | Upper percentile for band display |
| Initial Market | Random | Force bear or bull market as first year |
| Market Return Adjustment | 0% | Offset added to every sampled return (for historical-mode stock accounts only) |

### Sensitivity Analysis

Vary one parameter across a range and see how success rate and portfolio value change:

- **Stock Return Offset**: How sensitive is the plan to better/worse market returns?
- **Inflation Rate**: What if inflation runs higher or lower?
- **Expense Adjustment**: How does scaling all expenses up/down affect outcomes?
- **Healthcare Inflation**: Isolate the impact of healthcare cost growth

### Year-by-Year Debug View

Step through each year of a representative run and inspect:

- Account balances: start, growth rate, RMDs, withdrawals (expense & tax), end
- Income breakdown: each source, SS provisional income calculation, taxable SS amount
- Expense breakdown: each active expense with inflation adjustment
- Withdrawal detail: how much was drawn from which accounts and what tax it generated
- Tax detail: ordinary income, LTCG, federal/state tax, effective rate
- Cashflow Sankey diagram

### Plan Comparison

Compare up to 3 plans side-by-side with a shared simulation config. Shows success
rates and overlaid portfolio timeline charts.

---

## API Reference

### Plans

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/plans` | List all plans |
| `POST` | `/api/plans` | Create plan |
| `GET` | `/api/plans/{id}` | Get plan |
| `PUT` | `/api/plans/{id}` | Update plan |
| `DELETE` | `/api/plans/{id}` | Delete plan |
| `POST` | `/api/plans/{id}/duplicate` | Clone plan |

### Simulation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/simulate/{id}` | Run Monte Carlo; persist and return results |
| `GET` | `/api/simulate/{id}/results` | Fetch cached results |
| `GET` | `/api/simulate/{id}/debug?band=median` | Full year-by-year trace for a representative run |
| `POST` | `/api/simulate/{id}/sensitivity` | Sensitivity analysis over a parameter range |
| `POST` | `/api/simulate/compare` | Side-by-side comparison (not persisted) |

### Config

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config/simulation` | Get global simulation defaults |
| `PUT` | `/api/config/simulation` | Update global simulation defaults |
