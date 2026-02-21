# FuegoPro - Build Progress

Track of all build steps, their status, and key files produced.

---

## Step 1 — Project Scaffolding ✅

**Goal:** Set up the directory structure, backend, and frontend so they can communicate end-to-end.

**Completed:**
- Backend directory structure created: `models/`, `routers/`, `services/`, `data/`, `config/`
- FastAPI app created with CORS middleware and `/api/health` endpoint
- Python virtual environment set up in `backend/venv/`
- Dependencies installed: fastapi, uvicorn, sqlalchemy, pydantic, numpy
- React + Vite frontend scaffolded in `frontend/`
- Additional npm packages installed: react-router-dom, axios, recharts
- Vite proxy configured to forward `/api/*` → `http://localhost:9000`
- `src/api/client.js` created as the single axios client module

**Key files:**
- `backend/main.py` — FastAPI entry point
- `backend/requirements.txt` — Python dependencies
- `frontend/vite.config.js` — Vite config with proxy
- `frontend/src/api/client.js` — Axios API client

**Ports:** Backend on 9000, Frontend on 5173

---

## Step 2 — Database Models ✅

**Goal:** Define all SQLAlchemy ORM models and verify all 11 tables are created in SQLite on startup.

**Completed:**
- `database.py` written with engine, session factory, `get_db()` dependency, and `init_db()`
- Foreign key enforcement enabled via SQLite PRAGMA
- All 11 ORM models defined in `models/db_models.py`
- `init_db()` called on FastAPI startup event in `main.py`
- Default `simulation_config` row seeded on first startup (1000 runs, 10th–90th percentile)
- All 11 tables verified in `fuegopro.db`

**Key files:**
- `backend/database.py` — Engine, SessionLocal, Base, get_db(), init_db()
- `backend/models/db_models.py` — All 11 ORM models

**Tables created:**
- Plan data: `plans`, `accounts`, `income_sources`, `expenses`
- Simulation results: `simulation_results`, `simulation_portfolio_timeline`, `simulation_account_timeline`, `simulation_annual_detail`, `simulation_income_detail`, `simulation_expense_detail`
- Config: `simulation_config`

---

## Step 3 — Plans CRUD API ✅

**Goal:** Build backend routes for creating, reading, updating, deleting, and duplicating plans with all child records (accounts, income sources, expenses). Verify with direct API calls.

**Completed:**
- Pydantic schemas defined for Account, IncomeSource, Expense, Plan (create/update/summary/full output)
- All 6 plan CRUD endpoints implemented in `routers/plans.py`
- Plans router registered in `main.py`

**Key files:**
- `backend/models/schemas.py` — Pydantic request/response schemas
- `backend/routers/plans.py` — All plan CRUD endpoints

**Endpoints implemented:**
- `GET /api/plans` — list all plans (summary)
- `POST /api/plans` — create plan with child records
- `GET /api/plans/{id}` — get full plan with child records
- `PUT /api/plans/{id}` — replace plan and all children
- `DELETE /api/plans/{id}` — delete plan (cascades to children)
- `POST /api/plans/{id}/duplicate` — duplicate a plan with all children

---

## Step 4 — Plans UI ✅

**Goal:** Build the Plans List screen and Plan Editor (all four tabs) connected to the backend API.

**Completed:**
- React Router set up in `App.jsx` with routes for `/plans`, `/plans/new`, `/plans/:id`
- Sidebar + Layout shell with dark nav sidebar and light content area
- PlansList: table of plans with Edit / Copy / Delete actions and color-coded success rate
- PlanEditor: 4-tab form (Profile, Accounts, Income, Expenses) with save/create flow
- All four tab components with inline-editable rows and conditional fields
- Global CSS reset in `index.css`; page title updated in `index.html`

**Key files:**
- `frontend/src/pages/PlansList.jsx`
- `frontend/src/pages/PlanEditor.jsx`
- `frontend/src/components/layout/Layout.jsx`
- `frontend/src/components/layout/Sidebar.jsx`
- `frontend/src/components/plan/ProfileTab.jsx`
- `frontend/src/components/plan/AccountsTab.jsx`
- `frontend/src/components/plan/IncomeTab.jsx`
- `frontend/src/components/plan/ExpensesTab.jsx`

---

## Step 5 — Tax Engine ✅

**Goal:** Build the tax calculation module in isolation with unit tests.

**Completed:**
- 2024 federal and California bracket constants defined in `config/tax_brackets.py`
- All three tax functions implemented in `services/tax.py`
- LTCG stacking logic: LTCG income stacked on top of taxable ordinary income to find applicable rate
- SS fraction: simplified stepwise 0 / 0.5 / 0.85 based on IRS provisional income thresholds
- 29 unit tests written and passing in `tests/test_tax.py`
- pytest installed into venv

**Key files:**
- `backend/config/tax_brackets.py` — Federal ordinary, LTCG, CA brackets + deductions + SS thresholds
- `backend/services/tax.py` — `calculate_federal_tax`, `calculate_state_tax`, `calculate_ss_taxable_fraction`
- `backend/tests/test_tax.py` — 29 passing unit tests

---

## Step 6 — RMD Module ✅

**Goal:** Build the RMD calculation module with the IRS Uniform Lifetime Table.

**Completed:**
- Full IRS Uniform Lifetime Table (2022 revision, ages 72–120+) in `services/rmd.py`
- RMD start age set to 73 per SECURE Act 2.0
- Ages above 120 default to factor 2.0 per IRS guidance
- 22 unit tests passing in `tests/test_rmd.py`

**Key files:**
- `backend/services/rmd.py` — `get_life_expectancy_factor`, `calculate_rmd`
- `backend/tests/test_rmd.py` — 22 passing unit tests

---

## Step 7 — Historical Returns Loader ✅

**Goal:** Parse `historic-monthly.txt`, extract monthly return percentages, load into a NumPy array at server startup.

**Completed:**
- 672 monthly S&P 500 returns parsed from `historic-monthly.txt` (Feb 1970 – Jan 2026)
- Array stored oldest-first as `MONTHLY_RETURNS` (float64 NumPy array), loaded once at import
- `sample_annual_returns(years, rng)` uses block bootstrap: draws random 12-month windows to preserve short-term autocorrelation
- 17 unit tests passing in `tests/test_historic_returns.py`

**Key files:**
- `backend/data/historic_returns.py` — loader, `get_monthly_returns()`, `sample_annual_returns()`
- `backend/tests/test_historic_returns.py` — 17 passing unit tests

---

## Step 8 — Simulation Engine ✅

**Goal:** Build the Monte Carlo simulation loop integrating tax engine, RMD module, withdrawal sequencing, and historical returns.

**Completed:**
- `withdrawal.py`: `AccountState`, `WithdrawalResult`, `withdraw_for_shortfall()` — drains cash → brokerage → traditional in tax-efficient order
- `simulation.py`: full `PlanInputs` / `SimulationConfig` / `SimulationResult` dataclasses + `simulate()` entry point
- Year loop: income collection → 401k distributions → RMDs → expenses → expense-shortfall withdrawals → tax computation (federal ordinary + LTCG split, state) → tax-shortfall withdrawals → end-of-year growth
- SS taxable fraction computed per-year from provisional income
- California LTCG included in state taxable income
- Median run identified by final portfolio value closest to cross-run median
- 30 tests passing; full suite: 98/98 in 0.37s

**Key files:**
- `backend/services/withdrawal.py` — `AccountState`, `withdraw_for_shortfall()`
- `backend/services/simulation.py` — `simulate(plan, config, seed) → SimulationResult`
- `backend/tests/test_simulation.py` — 30 passing tests

---

## Step 9 — Simulation API & Results Persistence ✅

**Goal:** Wire the simulation engine to the API endpoint. Persist aggregated results to normalized simulation tables.

**Completed:**
- Simulation Pydantic output schemas added to `models/schemas.py` (`PortfolioTimelinePoint`, `AccountTimelinePoint`, `AnnualDetailOut`, `IncomeDetailOut`, `ExpenseDetailOut`, `SimulationResultOut`)
- `routers/simulation.py` created with both endpoints; `selectinload` used for eager relationship loading
- `plan.last_simulated_at` and `plan.last_success_rate` updated after each run
- Simulation router registered in `main.py`

**Key files:**
- `backend/routers/simulation.py` — Simulation endpoints
- `backend/models/schemas.py` — Simulation output schemas appended

**Endpoints:**
- `POST /api/simulate/{plan_id}` — run simulation, persist and return results
- `GET /api/simulate/{plan_id}/results` — fetch cached results

---

## Step 10 — Simulation Results UI ✅

**Goal:** Build the Simulation Results screen with all four panels and the detail drawer.

**Completed:**
- `Simulation.jsx` page: loads plan + cached results, "Run Simulation" / "Re-run" button, empty state, error banner
- `SuccessRate.jsx`: large color-coded percentage with Strong / Moderate / At Risk label
- `PercentileBandChart.jsx`: 3-line Recharts chart (p_lower dashed orange, p50 solid blue, p_upper dashed blue)
- `MedianChart.jsx`: minimal single-line p50 chart
- `AccountBalancesChart.jsx`: one line per account with auto-assigned colors
- `DetailDrawer.jsx`: three collapsible panels — Tax Breakdown, Income Detail, Expense Detail (pivoted tables)
- `App.jsx`: `/plans/:id/simulate` route added
- `PlansList.jsx`: "Simulate" button added to each plan row
- `client.js`: `runSimulation` and `getSimulationResults` added

**Key files:**
- `frontend/src/pages/Simulation.jsx`
- `frontend/src/components/simulation/SuccessRate.jsx`
- `frontend/src/components/simulation/MedianChart.jsx`
- `frontend/src/components/simulation/PercentileBandChart.jsx`
- `frontend/src/components/simulation/AccountBalancesChart.jsx`
- `frontend/src/components/simulation/DetailDrawer.jsx`

---

## Step 11 — Compare Screen ✅

**Goal:** Build the Compare screen with plan selectors and summary columns.

**Completed:**
- `POST /api/simulate/compare` endpoint added to `routers/simulation.py` (before `/{plan_id}` to avoid routing conflict)
- `CompareRequest` and `ComparePlanResult` schemas added to `models/schemas.py`
- Compare runs fresh in-memory simulations for 1–3 plan IDs using global config (not persisted)
- `Compare.jsx` page: 3 plan selector dropdowns, inline config params, "Run Compare" button
- Results: per-plan success rate cards, combined p50 portfolio timeline chart, summary table with final portfolio values
- `compareSimulations` function added to `api/client.js`
- `/compare` route added to `App.jsx`; Compare link added to Sidebar

**Key files:**
- `frontend/src/pages/Compare.jsx`
- `backend/routers/simulation.py` — compare endpoint added
- `backend/models/schemas.py` — CompareRequest, ComparePlanResult schemas

---

## Step 12 — Simulation Config ✅

**Goal:** Expose global simulation config via API and add the config panel UI.

**Completed:**
- `backend/routers/config.py` created with `GET /api/config/simulation` and `PUT /api/config/simulation`
- Validation: rejects updates where lower_percentile ≥ upper_percentile
- `SimConfigOut` and `SimConfigUpdate` schemas added to `models/schemas.py`
- Config router registered in `main.py`
- `frontend/src/store/simConfig.js` — React Context (`SimConfigProvider`, `useSimConfig`) that loads global config on app mount
- `frontend/src/components/shared/SimConfigPanel.jsx` — full settings form with save button and success/error feedback
- `frontend/src/pages/Settings.jsx` — settings page using SimConfigPanel
- `App.jsx` wrapped with `SimConfigProvider`; `/settings` route added; Settings link pushed to sidebar bottom
- `Simulation.jsx` now initialises local per-run config from global context defaults instead of hardcoded values

**Key files:**
- `backend/routers/config.py` — Config endpoints
- `frontend/src/store/simConfig.js` — SimConfigProvider + useSimConfig hook
- `frontend/src/components/shared/SimConfigPanel.jsx` — global settings form
- `frontend/src/pages/Settings.jsx`

**Endpoints:**
- `GET /api/config/simulation`
- `PUT /api/config/simulation`

---

## Step 13 — Bear/Bull Market Regime Feature ✅

**Goal:** Add market regime control to the simulation. Users can optionally specify an initial market regime (Bear, Bull, or Random) for the first year; subsequent years follow a Markov chain with historically-calibrated transition probabilities.

**Completed:**

**Backend:**
- Regime classification logic added to `historic_returns.py`:
  - Pre-computes `BEAR_START_INDICES` and `BULL_START_INDICES` at module startup by classifying all 12-month windows as bear (< 0% annual return) or bull (≥ 0%)
  - Empirically computes `P_BULL_STAY` and `P_BEAR_STAY` from non-overlapping annual windows
- `sample_annual_returns()` signature updated to accept optional `first_year_regime: Optional[str]` parameter
  - When `'bear'` or `'bull'`: year 0 samples from that regime's pool; years 1+ follow Markov chain transitions
  - When `None`: unchanged block-bootstrap behavior (backward compatible)
- `SimulationConfig` dataclass updated with `initial_market_regime: Optional[str] = None` field
- Both simulation endpoints (`POST /api/simulate/{plan_id}` and `POST /api/simulate/compare`) accept `initial_market_regime` query/body parameter with validation

**Frontend:**
- `SimConfigPanel.jsx` (simulation-specific) updated with a 3-button toggle: "Random", "Bear start", "Bull start"
- `Simulation.jsx` initializes local `simConfig` with `initialRegime: 'random'`; passes `initial_market_regime` to API
- `Compare.jsx` similarly adds regime toggle in inline config row; passes `initial_market_regime` to compare endpoint
- All state wiring preserves backward compatibility: "Random" omits the parameter (defaults to None on backend)

**Testing:**
- 10 new unit tests added to `tests/test_historic_returns.py`:
  - Verify `BEAR_START_INDICES` and `BULL_START_INDICES` are non-empty
  - Verify all indices in each pool produce the expected sign of annual returns
  - Verify transition probabilities are in [0, 1]
  - Test regime-constrained sampling (bear/bull first year always produces negative/non-negative)
  - Test Markov transition logic
  - Test error handling for invalid regime values
- **All 27 tests pass** (17 original + 10 new)

**Key files modified/added:**
- `backend/data/historic_returns.py` — regime classification, Markov logic, enhanced `sample_annual_returns()`
- `backend/services/simulation.py` — `SimulationConfig` updated with regime field
- `backend/routers/simulation.py` — both endpoints updated with regime parameter and validation
- `backend/models/schemas.py` — `CompareRequest` schema updated
- `frontend/src/components/simulation/SimConfigPanel.jsx` — regime toggle UI added
- `frontend/src/pages/Simulation.jsx` — regime state + API wiring
- `frontend/src/pages/Compare.jsx` — regime state + API wiring
- `backend/tests/test_historic_returns.py` — 10 new regime tests

---

*Last updated: Step 13 complete — Bear/Bull market regime feature fully implemented*
