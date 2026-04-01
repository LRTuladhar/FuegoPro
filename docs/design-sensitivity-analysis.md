# Sensitivity Analysis — Design Document

## Overview

Add a sensitivity analysis feature that lets users pick one simulation parameter at a time, specify a min/max range to test, and see how portfolio outcomes and success rate change across all values in that range — graphed as a complete curve. Accessible as a sub-page of the Simulation page at `/plans/:id/simulate/sensitivity`.

---

## Parameters

| # | Parameter | Default Range | Step | How it modifies the simulation |
|---|-----------|---------------|------|-------------------------------|
| 1 | **Stock return adjustment** | -4% to +4% | 0.5% | Additive offset applied to every sampled historical annual return: `adjusted = sampled + offset` |
| 2 | **Inflation rate** | 1% to 5% | 0.25% | Overrides every expense's `inflation_rate` AND `plan.inflation_rate` (tax bracket indexing) with the chosen value |
| 3 | **Annual expenses** | -20% to +20% | 5% | Multiplier on every expense's `annual_amount`: `adjusted = base * (1 + pct_change)` |
| 4 | **Healthcare cost inflation** | 1% to 10% | 0.5% | Overrides `inflation_rate` only on expenses whose name contains "health" or "medical" (case-insensitive). Other expenses keep their original rates. |

Each parameter has a sensible default range, but the user can override the min and max via input fields before running the analysis.

---

## Simulation Approach

- Use **200 runs** per step (reduced from the default 1000) to keep total compute reasonable.
- The user provides a min and max value for the selected parameter. The backend computes step values across that range, runs simulations at each step in a single request, and returns the full array of results.
- All results are graphed at once — no slider interaction needed. The charts show the complete curve across the tested range.
- A single shared RNG seed is used across all steps so the only variable is the parameter being tested.

### Compute budget

Worst case (stock returns: -4% to +4% at 0.5% steps = 17 values):
`17 steps x 200 runs = 3,400 runs` — roughly 3.4x a normal simulation. Acceptable.

---

## Backend Changes

### 1. New dataclass: `SensitivityRequest` (in `simulation.py`)

```python
@dataclass
class SensitivityRequest:
    parameter:   str    # 'stock_return_offset' | 'inflation_rate' | 'expense_adjustment' | 'healthcare_inflation'
    min_value:   float
    max_value:   float
    step:        float
    num_runs:    int = 200
```

### 2. New dataclass: `SensitivityStepResult`

```python
@dataclass
class SensitivityStepResult:
    param_value:         float
    success_rate:        float
    portfolio_timeline:  List[AgePortfolioPoint]  # reuse existing dataclass
```

### 3. New function: `simulate_sensitivity()` (in `simulation.py`)

```python
def simulate_sensitivity(
    plan:    PlanInputs,
    request: SensitivityRequest,
    config:  SimulationConfig,
    seed:    int = 42,
) -> List[SensitivityStepResult]:
```

**Logic:**
1. Generate `step_values` from `min_value` to `max_value` by `step`.
2. Create a shared RNG with the fixed seed. Pre-sample **all** stock return sequences once upfront:
   ```python
   base_returns = np.zeros((num_runs, num_ages))
   for run_idx in range(num_runs):
       base_returns[run_idx] = sample_annual_returns(num_ages, rng, ...)
   ```
   This produces, say, 200 sequences of annual returns — each sequence covering the full planning horizon. These base sequences are **never modified in place** and are reused across all steps.
3. For each `step_value`:
   a. Deep-copy the plan inputs (accounts, expenses, etc.).
   b. Apply the parameter modification to the **copy**:
      - **stock_return_offset**: See detailed example below.
      - **inflation_rate**: Set `plan_copy.inflation_rate = step_value` and set `exp.inflation_rate = step_value` for all expenses.
      - **expense_adjustment**: Multiply `exp.annual_amount *= (1 + step_value)` for all expenses.
      - **healthcare_inflation**: For expenses matching "health" or "medical" in name (case-insensitive), set `exp.inflation_rate = step_value`. Leave others unchanged.
   c. For each of the `num_runs` pre-sampled return sequences, run `_simulate_one_run()` passing the (possibly offset) returns and the modified plan copy.
   d. Aggregate results across runs into `SensitivityStepResult` (success rate + portfolio percentile timeline).
4. Return the list of step results.

#### Stock return offset — detailed example

The `stock_return_offset` parameter answers: *"What if the market consistently under/overperforms its historical average by X% per year?"*

**Pre-sampling (done once):** 200 return sequences are sampled from historical S&P 500 data using block-bootstrap. Each sequence covers the full planning horizon. Example for one run over 4 years:
```
base_returns[run_42] = [+0.123, -0.081, +0.225, +0.037]
                       (12.3%, -8.1%, 22.5%, 3.7%)
```

**Per-step offset (done for each test value):** The offset is added to every element of each base sequence. The base array is not mutated — a new offset array is created:
```python
offset_returns = base_returns[run_idx] + step_value
```

For `step_value = -0.02` (-2%):
```
offset_returns = [+0.103, -0.101, +0.205, +0.017]
                 (10.3%, -10.1%, 20.5%, 1.7%)
```

For `step_value = +0.02` (+2%):
```
offset_returns = [+0.143, -0.061, +0.245, +0.057]
                 (14.3%, -6.1%, 24.5%, 5.7%)
```

For `step_value = 0.0` (baseline — no change):
```
offset_returns = [+0.123, -0.081, +0.225, +0.037]  (identical to base)
```

**Why this works:** Every step uses the *same* random draws with only the offset changed, so differences in outcomes are entirely attributable to the return adjustment — not randomness in sampling. The 0% offset step reproduces baseline behavior exactly.

**What the output means:**
- `0%` = historical average (~10% nominal annual return for S&P 500)
- `-2%` = "what if the market consistently underperforms history by 2%/year?"
- `+2%` = "what if the market consistently outperforms history by 2%/year?"

### 4. New API endpoint (in `routers/simulation.py`)

```
POST /api/simulate/{plan_id}/sensitivity
```

**Request body (JSON):**
```json
{
  "parameter": "stock_return_offset",
  "min_value": -0.04,
  "max_value": 0.04,
  "step": 0.005,
  "num_runs": 200
}
```

**Response:**
```json
{
  "parameter": "stock_return_offset",
  "steps": [
    {
      "param_value": -0.04,
      "success_rate": 0.62,
      "portfolio_timeline": [
        { "age": 60, "p50": 1200000, "p_lower": 800000, "p_upper": 1600000 },
        ...
      ]
    },
    ...
  ]
}
```

**Pydantic schemas** (in `models/schemas.py`):
- `SensitivityRunRequest` — request body validation
- `SensitivityStepOut` — per-step result
- `SensitivityResultOut` — top-level response wrapper

**Validation:**
- `parameter` must be one of the 4 allowed values
- `min_value < max_value`
- `step > 0`
- `num_runs` between 10 and 1000 (default 200)
- Max 30 steps per request (reject if `(max - min) / step > 30`)

### 5. Plan-to-PlanInputs conversion

The existing router already converts a DB Plan to `PlanInputs` in the `POST /simulate/{plan_id}` handler. Extract that into a shared helper `_build_plan_inputs(plan_orm)` so the sensitivity endpoint can reuse it.

---

## Frontend Changes

### 1. New page: `SensitivityAnalysis.jsx` (in `frontend/src/pages/`)

**Route:** `/plans/:id/simulate/sensitivity`

**State:**
```
parameter      — selected parameter key (default: 'stock_return_offset')
rangeMin       — user-editable min value (initialized from parameter defaults)
rangeMax       — user-editable max value (initialized from parameter defaults)
results        — array of SensitivityStepResult from API (null initially)
running        — loading state
error          — error message
plan           — plan metadata (loaded on mount)
```

**Layout (top to bottom):**

1. **Header**: Plan name + "Sensitivity Analysis" title + back link to simulation page
2. **Parameter selector**: Row of 4 toggle buttons (like the market regime selector in SimConfigPanel)
   - "Stock Returns" | "Inflation" | "Expenses" | "Healthcare Inflation"
3. **Range inputs**: Two number fields — "Min" and "Max" — pre-filled with the parameter's default range. The user can adjust these before running.
4. **Run button**: "Analyze" — triggers the API call for the selected parameter with the user-specified range.
5. **Results section** (shown after run completes):
   - **Success rate curve**: LineChart with param_value on X-axis, success_rate (%) on Y-axis. All tested values plotted as a continuous line with dot markers. A vertical ReferenceLine marks the "baseline" value (0% for stock return offset, current plan inflation for inflation rate, etc.).
   - **Portfolio band chart**: AreaChart showing the median portfolio value (solid line) with a shaded area between p_lower and p_upper, plotted per tested param value. X-axis = parameter value, Y-axis = ending portfolio value. Shows how the final portfolio distribution shifts across the range.

Both charts render the full dataset at once — no slider or drill-down interaction needed. The user sees the complete picture immediately.

### 2. New API function (in `frontend/src/api/client.js`)

```javascript
export const runSensitivity = (planId, body) =>
  api.post(`/simulate/${planId}/sensitivity`, body)
```

### 3. Parameter definitions (in `SensitivityAnalysis.jsx`)

```javascript
const PARAMETERS = {
  stock_return_offset: {
    label: 'Stock Returns',
    unit: '%',
    defaultMin: -0.04, defaultMax: 0.04, step: 0.005,
    baseline: 0,
    format: v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`,
    displayFormat: v => `${(v * 100).toFixed(1)}`,  // for input fields (without % sign)
    description: 'Adjust annual stock returns from historical average',
  },
  inflation_rate: {
    label: 'Inflation Rate',
    unit: '%',
    defaultMin: 0.01, defaultMax: 0.05, step: 0.0025,
    baseline: null,  // read from plan's current expense avg
    format: v => `${(v * 100).toFixed(2)}%`,
    displayFormat: v => `${(v * 100).toFixed(2)}`,
    description: 'Override all expense inflation rates',
  },
  expense_adjustment: {
    label: 'Annual Expenses',
    unit: '%',
    defaultMin: -0.20, defaultMax: 0.20, step: 0.05,
    baseline: 0,
    format: v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
    displayFormat: v => `${(v * 100).toFixed(0)}`,
    description: 'Scale all annual expense amounts',
  },
  healthcare_inflation: {
    label: 'Healthcare Inflation',
    unit: '%',
    defaultMin: 0.01, defaultMax: 0.10, step: 0.005,
    baseline: null,  // read from plan's healthcare expense rate
    format: v => `${(v * 100).toFixed(1)}%`,
    displayFormat: v => `${(v * 100).toFixed(1)}`,
    description: 'Override inflation rate for healthcare expenses',
  },
}
```

When the user selects a parameter, the Min/Max input fields are pre-populated with `defaultMin` and `defaultMax`. The user can edit these before clicking "Analyze".

### 4. Navigation

- Add a button on the Simulation page (next to the existing "Debug" link): **"Sensitivity"** — navigates to `/plans/:id/simulate/sensitivity`
- Do NOT add to sidebar (it's a sub-page of simulation, like debug)

### 5. Charts

Both charts are built inline in `SensitivityAnalysis.jsx` using Recharts (no need to extract into separate components for now).

- **Success rate curve**: Recharts `LineChart`. X-axis = parameter value (formatted), Y-axis = success rate %. Single line with dot markers. Vertical `ReferenceLine` at the baseline value. Data is derived directly from the `results` array: `results.map(r => ({ value: format(r.param_value), successRate: r.success_rate * 100 }))`.

- **Ending portfolio band chart**: Recharts `ComposedChart` with an `Area` (shaded band between p_lower and p_upper at the final age) and a `Line` (median at the final age). X-axis = parameter value, Y-axis = dollar amount. Data is derived by pulling the **last age** from each step's `portfolio_timeline`: `results.map(r => { const last = r.portfolio_timeline.at(-1); return { value: format(r.param_value), p50: last.p50, p_lower: last.p_lower, p_upper: last.p_upper } })`.

---

## File Change Summary

| File | Change |
|------|--------|
| `backend/services/simulation.py` | Add `SensitivityRequest`, `SensitivityStepResult` dataclasses + `simulate_sensitivity()` function |
| `backend/routers/simulation.py` | Add `POST /simulate/{plan_id}/sensitivity` endpoint + extract `_build_plan_inputs()` helper |
| `backend/models/schemas.py` | Add `SensitivityRunRequest`, `SensitivityStepOut`, `SensitivityResultOut` Pydantic models |
| `frontend/src/pages/SensitivityAnalysis.jsx` | New page component (parameter selector, range inputs, charts) |
| `frontend/src/api/client.js` | Add `runSensitivity()` function |
| `frontend/src/App.jsx` | Add route for `/plans/:id/simulate/sensitivity` |
| `frontend/src/pages/Simulation.jsx` | Add "Sensitivity" navigation button |

---

## UX Flow

1. User runs a normal simulation on the Simulation page.
2. Clicks "Sensitivity" button to navigate to the sensitivity sub-page.
3. Selects a parameter (e.g., "Stock Returns") from the toggle buttons. Min/Max fields populate with defaults.
4. Optionally adjusts the min/max range.
5. Clicks "Analyze" — backend runs 200 sims x N steps, returns all results at once.
6. Two charts appear immediately:
   - **Success rate curve** — shows how success % changes across the parameter range, with a baseline marker.
   - **Ending portfolio band chart** — shows how the final portfolio's median and percentile spread change across the range.
7. User can switch parameters (or adjust the range) and re-run.

---

## Testing

**Backend:**
- Unit test `simulate_sensitivity()` with a small plan (2 accounts, 1 expense, 5-year horizon, 10 runs).
- Verify that stock_return_offset actually shifts returns (compare success rates at -4% vs +4%).
- Verify inflation_rate override applies to all expenses.
- Verify expense_adjustment scales amounts correctly.
- Verify healthcare_inflation only affects matching expenses.

**Frontend:**
- Manual: select each parameter, run analysis, verify both charts render.
- Adjust min/max range, re-run, verify charts update with new range.
- Verify baseline marker appears at correct position on success rate chart.

**Integration:**
- Run full flow via UI: create plan, simulate, navigate to sensitivity, run all 4 parameters.
