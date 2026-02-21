# FuegoPro - Technical Architecture Design

**Version**: 1.0
**Date**: 2026-02-18
**Status**: Draft

---

## 1. System Overview

FuegoPro is a local web application with a clear client-server separation:

- **Frontend**: React SPA served by Vite dev server (or built static files)
- **Backend**: Python FastAPI server handling business logic, simulation, and persistence
- **Database**: SQLite single-file database
- **Data**: S&P 500 historical monthly returns loaded from file at startup

```
Browser (React + Vite)
        │
        │  HTTP/JSON REST API
        ▼
FastAPI Server (Python)
        │
        ├── SQLite Database (plans, results)
        └── Historical Returns (loaded into memory at startup)
```

All components run on localhost. The frontend communicates with the backend exclusively via a REST API, making future hosting straightforward — only the SQLite file path and CORS config need changing.

---

## 2. Project Structure

```
FuegoPro/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── database.py              # SQLite connection and session management
│   ├── models/
│   │   ├── db_models.py         # SQLAlchemy ORM models
│   │   └── schemas.py           # Pydantic request/response schemas
│   ├── routers/
│   │   ├── plans.py             # CRUD endpoints for plans
│   │   └── simulation.py        # Simulation run endpoints
│   ├── services/
│   │   ├── simulation.py        # Monte Carlo simulation engine
│   │   ├── tax.py               # Federal and state tax calculations
│   │   ├── withdrawal.py        # Tax-efficient withdrawal sequencing
│   │   └── rmd.py               # RMD calculation
│   ├── data/
│   │   └── historic_returns.py  # Load and parse historic-monthly.txt
│   └── config/
│       └── tax_brackets.py      # Federal and CA tax bracket constants
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── src/
│   │   ├── main.jsx             # React entry point
│   │   ├── App.jsx              # Root component, router
│   │   ├── api/
│   │   │   └── client.js        # Axios API client, all backend calls
│   │   ├── pages/
│   │   │   ├── PlansList.jsx    # Home screen
│   │   │   ├── PlanEditor.jsx   # Plan create/edit (tabbed)
│   │   │   ├── Simulation.jsx   # Simulation results screen
│   │   │   └── Compare.jsx      # Plan comparison screen
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   └── Layout.jsx
│   │   │   ├── plan/
│   │   │   │   ├── ProfileTab.jsx
│   │   │   │   ├── AccountsTab.jsx
│   │   │   │   ├── IncomeTab.jsx
│   │   │   │   └── ExpensesTab.jsx
│   │   │   ├── simulation/
│   │   │   │   ├── SuccessRate.jsx
│   │   │   │   ├── MedianChart.jsx
│   │   │   │   ├── PercentileBandChart.jsx
│   │   │   │   ├── AccountBalancesChart.jsx
│   │   │   │   └── DetailDrawer.jsx
│   │   │   └── shared/
│   │   │       ├── InlineForm.jsx
│   │   │       └── SimConfigPanel.jsx
│   │   └── store/
│   │       └── simConfig.js     # Global simulation config state
│
├── historic-monthly.txt
└── docs/
    ├── requirements.md
    └── architecture.md
```

---

## 3. Database Schema

SQLite via SQLAlchemy ORM. Eleven tables across two groups: plan data and simulation results.

### 3.1 plans

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto increment |
| name | TEXT | User-defined plan name |
| current_age | INTEGER | |
| planning_horizon | INTEGER | Max age |
| filing_status | TEXT | `single` or `married` |
| state_tax_type | TEXT | `none`, `moderate`, `california` |
| state_tax_rate | REAL | Flat rate for moderate states; null otherwise |
| last_simulated_at | DATETIME | Nullable |
| last_success_rate | REAL | Cached from last simulation run; nullable |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### 3.2 accounts

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| plan_id | INTEGER FK → plans.id | Cascade delete |
| name | TEXT | |
| tax_treatment | TEXT | `traditional`, `taxable_brokerage`, `cash_savings` |
| asset_class | TEXT | `stocks`, `bonds`, `savings` |
| balance | REAL | Current balance |
| annual_return_rate | REAL | For bonds/savings; null for stocks |
| gains_pct | REAL | % of withdrawals that are LTCG; for taxable_brokerage only |

### 3.3 income_sources

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| plan_id | INTEGER FK → plans.id | Cascade delete |
| name | TEXT | |
| income_type | TEXT | `employment`, `social_security`, `pension`, `rental`, `401k_distribution`, `other` |
| annual_amount | REAL | For social_security: annual equivalent of monthly benefit |
| start_age | INTEGER | |
| end_age | INTEGER | |
| is_taxable | INTEGER | Boolean; relevant for `other` type |

### 3.4 expenses

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| plan_id | INTEGER FK → plans.id | Cascade delete |
| name | TEXT | |
| annual_amount | REAL | In today's dollars |
| start_age | INTEGER | |
| end_age | INTEGER | |
| inflation_rate | REAL | Annual inflation rate as decimal (e.g. 0.025) |

### 3.5 simulation_results

Header row for a simulation run. One row per plan (replaced on each re-run).

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| plan_id | INTEGER FK → plans.id | Unique; one result set per plan |
| num_runs | INTEGER | Config used for this run |
| lower_percentile | INTEGER | Percentile band lower bound used |
| upper_percentile | INTEGER | Percentile band upper bound used |
| success_rate | REAL | % of runs that did not fail |
| created_at | DATETIME | |

### 3.6 simulation_portfolio_timeline

Aggregated portfolio value percentiles by age. One row per age.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| result_id | INTEGER FK → simulation_results.id | Cascade delete |
| age | INTEGER | |
| p50 | REAL | Median total portfolio value |
| p_lower | REAL | Lower percentile total portfolio value |
| p_upper | REAL | Upper percentile total portfolio value |

### 3.7 simulation_account_timeline

Aggregated median balance per account per age. One row per account per age.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| result_id | INTEGER FK → simulation_results.id | Cascade delete |
| account_id | INTEGER FK → accounts.id | |
| account_name | TEXT | Denormalized for display; account may be renamed |
| age | INTEGER | |
| p50 | REAL | Median account balance at this age |

### 3.8 simulation_annual_detail

Tax breakdown for the median run, one row per age.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| result_id | INTEGER FK → simulation_results.id | Cascade delete |
| age | INTEGER | |
| tax_federal_ordinary | REAL | |
| tax_federal_ltcg | REAL | |
| tax_state | REAL | |
| effective_tax_rate | REAL | |

### 3.9 simulation_income_detail

Income breakdown for the median run. One row per income source per age.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| result_id | INTEGER FK → simulation_results.id | Cascade delete |
| age | INTEGER | |
| source_name | TEXT | Income source name |
| amount | REAL | |

### 3.10 simulation_expense_detail

Expense breakdown for the median run. One row per expense per age.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| result_id | INTEGER FK → simulation_results.id | Cascade delete |
| age | INTEGER | |
| expense_name | TEXT | Expense name |
| amount | REAL | Inflation-adjusted amount for this age |

### 3.11 simulation_config

Single-row global config table.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Always row id=1 |
| num_runs | INTEGER | Default 1000 |
| lower_percentile | INTEGER | Default 10 |
| upper_percentile | INTEGER | Default 90 |

---

## 4. REST API

Base URL: `http://localhost:8000/api`

### 4.1 Plans

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/plans` | List all plans (summary fields only) |
| POST | `/plans` | Create a new plan |
| GET | `/plans/{id}` | Get full plan with accounts, income, expenses |
| PUT | `/plans/{id}` | Update a plan |
| DELETE | `/plans/{id}` | Delete a plan and all related data |
| POST | `/plans/{id}/duplicate` | Duplicate a plan |

### 4.2 Simulation

| Method | Endpoint | Query/Body Params | Description |
|--------|----------|-------------------|-------------|
| POST | `/simulate/{plan_id}` | `num_runs`, `lower_percentile`, `upper_percentile`, `initial_market_regime` | Run simulation for a plan; returns result |
| GET | `/simulate/{plan_id}/results` | | Get cached results for a plan |
| POST | `/simulate/compare` | Body: `plan_ids`, `num_runs`, `lower_percentile`, `upper_percentile`, `initial_market_regime` | Run simulation for up to 3 plan IDs; returns all results |

**`initial_market_regime` parameter** (optional):
- Values: `'bear'`, `'bull'`, or `null` (default)
- Constraints: applies to all runs in that simulation
- When `'bear'` or `'bull'`: year 1 samples from that regime's pool, years 2+ follow Markov transitions

### 4.3 Config

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/config/simulation` | Get global simulation config |
| PUT | `/config/simulation` | Update global simulation config |

---

## 5. Simulation Engine

The simulation runs entirely in Python on the backend. It is CPU-bound; NumPy is used throughout for performance.

### 5.1 Historical Returns

- `historic-monthly.txt` is parsed once at server startup
- Monthly `Change %` values are extracted and stored as a NumPy array of floats
- All simulation runs sample from this array with replacement

### 5.1a Market Regime Classification

At module startup, `historic_returns.py` pre-computes regime classification and Markov transition probabilities:

**Regime Pools** (for regime-constrained sampling):
- `BEAR_START_INDICES`: Start indices of all 12-month historical windows producing negative annual returns
- `BULL_START_INDICES`: Start indices of all 12-month historical windows producing non-negative annual returns

**Markov Transition Probabilities** (computed from non-overlapping annual windows):
- `P_BULL_STAY`: Probability a bull year is followed by another bull year
- `P_BEAR_STAY`: Probability a bear year is followed by another bear year
- Example values from S&P 500 history since 1970: P_BULL_STAY ≈ 0.75, P_BEAR_STAY ≈ 0.45

These are pre-computed constants used by the sampling function when a user specifies an initial market regime.

### 5.2 Simulation Algorithm (per run)

```
for each simulation run (1..N):
    initialise account balances from plan data
    set initial_regime = user-specified regime (or random if none specified)

    for each year (current_age..planning_horizon):
        1. GROWTH
           for each stock account:
               if user specified regime (bear/bull):
                   sample 12 monthly returns from the current regime's historical pool
               else:
                   sample 12 monthly returns uniformly from all historical data
               apply compounded monthly returns to balance
           for each bond/savings account:
               apply fixed annual return rate to balance

           (if regime was specified, transition to next year's regime via Markov chain:
            next_regime = bull if random() < P_BULL_STAY else bear
                          if current regime is bull
                        = bear if random() < P_BEAR_STAY else bull
                          if current regime is bear)

        2. INCOME
           sum all income sources active this year
           calculate SS taxable portion based on combined income

        3. RMDs (if age >= 73)
           for each traditional account:
               rmd = balance / irs_life_expectancy_factor(age)
               withdraw rmd from account (floor at $0)
               add rmd to ordinary income

        4. EXPENSES
           sum all inflation-adjusted expenses active this year
           net_need = total_expenses - total_income (floor at 0)

        5. WITHDRAWALS (tax-efficient sequencing)
           if net_need > 0:
               draw from taxable brokerage accounts first
               then from traditional accounts
           track ordinary income and LTCG income from withdrawals

        6. TAXES
           calculate federal ordinary income tax (progressive brackets)
           calculate federal LTCG tax
           calculate state tax (per state bucket)
           add taxes to total cash need; withdraw tax amount from accounts
           (repeat withdrawal sequencing for tax amount)

        7. BALANCE CHECK
           if total portfolio balance <= 0: mark run as failed, break

        8. RECORD (in-memory only during simulation)
           accumulate per-year balances for each account
           accumulate per-year income, expenses, tax breakdown

    store run outcome (success/fail) and yearly data

After all N runs complete:
    compute percentiles (p50, p_lower, p_upper) across all runs for portfolio and accounts
    identify the median run for annual income/expense/tax detail
    persist aggregated results to normalized simulation tables (see §3.5–3.10)
```

### 5.3 Tax Calculation Module

Encapsulated in `services/tax.py`. Pure functions, no side effects.

```
calculate_federal_tax(ordinary_income, ltcg_income, filing_status) → tax_amount
calculate_state_tax(ordinary_income, state_type, flat_rate, filing_status) → tax_amount
calculate_ss_taxable_fraction(combined_income, filing_status) → fraction (0, 0.5, or 0.85)
```

Tax brackets stored as constants in `config/tax_brackets.py`:
- Federal ordinary income brackets (single + MFJ)
- Federal LTCG brackets (single + MFJ)
- California state income brackets (single + MFJ)

These are defined as data constants so they can be updated annually without touching logic.

### 5.4 RMD Module

Encapsulated in `services/rmd.py`.

```
get_life_expectancy_factor(age) → float   # IRS Uniform Lifetime Table lookup
calculate_rmd(balance, age) → float
```

IRS Uniform Lifetime Table stored as a lookup dictionary constant.

---

## 6. Frontend Architecture

### 6.1 Routing

React Router with four routes:

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | PlansList | Home — list of plans |
| `/plans/:id/edit` | PlanEditor | Create or edit a plan |
| `/plans/:id/simulate` | Simulation | Simulation results |
| `/compare` | Compare | Plan comparison |

### 6.2 State Management

No global state library (Redux etc.) needed at this scale. State is managed as follows:

- **Plan data**: fetched from API on demand, local component state while editing
- **Simulation results**: fetched from API, held in component state on the Simulation page
- **Simulation config**: held in a lightweight React Context (`SimConfigContext`) so it is shared between Simulation and Compare screens without prop drilling
  - Global settings: `numRuns`, `lowerPct`, `upperPct` (persisted to database)
  - Per-run settings: `initialRegime` (ephemeral, not persisted) — added to local state on Simulation/Compare pages
- **UI state** (drawer open/closed, active tab, etc.): local component state

### 6.3 API Client

A single `api/client.js` module wraps all backend calls using Axios. All components import from this module — no direct `fetch` calls in components. This isolates the API contract in one place.

```js
// example shape
export const getPlans = () => axios.get('/api/plans')
export const getPlan = (id) => axios.get(`/api/plans/${id}`)
export const createPlan = (data) => axios.post('/api/plans', data)
export const runSimulation = (planId) => axios.post(`/api/simulate/${planId}`)
// etc.
```

### 6.4 Chart Components

All charts use Recharts. Key chart types:

| Component | Recharts Type | Notes |
|-----------|--------------|-------|
| MedianChart | LineChart | Single line, median portfolio value |
| PercentileBandChart | ComposedChart | AreaChart for band + Line for median |
| AccountBalancesChart | LineChart | Multiple lines, legend click toggles visibility |

---

## 7. Key Design Decisions & Rationale

### 7.1 Simulation runs on the backend
The Monte Carlo simulation is CPU-intensive (up to 10,000 runs × 50 years × tax calculations). Running it in Python with NumPy on the backend is significantly faster than JavaScript in the browser. It also keeps the simulation logic centralized and testable.

### 7.2 Simulation results stored in normalized tables
Simulation output is stored across six normalized tables rather than a JSON blob. This keeps the data transparent and directly inspectable in SQLite, follows standard relational design, and makes it straightforward to add new fields. Only aggregated percentile results are stored — not raw per-run data — keeping row counts small (one row per age per account). If the user changes percentile config, they re-run the simulation; this is the expected workflow.

### 7.3 Raw per-run data is not persisted
The simulation accumulates per-run data in memory only. After all runs complete, percentiles are computed and only the aggregated results are written to the database. Storing raw per-run data (e.g. 10,000 runs × 50 years × 5 accounts = 2.5M rows) would bloat the database with no practical benefit, since re-running is fast.

### 7.4 Tax brackets as data constants
Tax brackets change annually. Keeping them as plain data constants (not hardcoded into logic) makes them easy to update each year without touching calculation code.

### 7.5 No ORM for simulation result writes
SQLAlchemy ORM is used for plan CRUD (clean, safe). Bulk inserts for simulation result rows (portfolio timeline, account timeline, detail tables) use raw SQL for performance.

### 7.5 Single-file SQLite
The entire database is a single `.db` file, making backup, migration, and future server deployment trivial.

---

## 8. Development Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 9000
```

### Frontend
```bash
cd frontend
npm install
npm run dev   # Vite dev server on port 5173
```

Vite is configured to proxy `/api` requests to `localhost:9000` during development, so no CORS issues locally.

---

## 9. Future Portability Notes

To deploy to a hosted server:
- Replace SQLite with PostgreSQL (SQLAlchemy makes this a one-line change)
- Set `CORS_ORIGINS` env var to the hosted domain
- Serve the built React static files via FastAPI or a CDN
- Move the SQLite `.db` file or migrate data to PostgreSQL

No other architectural changes required.

---

*End of Document*
