# FuegoPro - Retirement Planning App
## Product Requirements Document

**Version**: 1.0
**Date**: 2026-02-18
**Status**: Draft

---

## 1. Overview

FuegoPro is a local web application for early retirement planning. It allows users to model their financial future through Monte Carlo simulation, accounting for assets, income sources, expenses, and tax implications. Users can create, save, and compare multiple retirement plans.

---

## 2. User Profile

The user enters the following at the plan level:

- **Current age**
- **Planning horizon** (maximum age, e.g. 95)

---

## 3. Assets

### 3.1 Account Types

Each account has two defining attributes:

**Tax Treatment**
- `Traditional` / Pre-tax (e.g. Traditional 401k, Traditional IRA) — contributions were pre-tax; withdrawals taxed as ordinary income
- `Taxable Brokerage` — post-tax contributions; gains taxed at long-term capital gains rates
- `Cash / Savings` — savings accounts, money market, CDs; interest taxed as ordinary income

*Note: Roth accounts are not supported in v1.*

**Asset Class** (one per account)
- `Stocks` — returns modeled via Monte Carlo simulation using historical monthly S&P 500 returns
- `Bonds` — user specifies expected annual return rate
- `Savings / Cash` — user specifies expected annual return rate

### 3.2 Account Fields

Each account requires:
- Name / label
- Tax treatment (Traditional or Taxable Brokerage or Cash/Savings)
- Asset class (Stocks, Bonds, or Savings/Cash)
- Current balance
- For Bonds and Savings: expected annual return rate (%)
- For Taxable Brokerage accounts: percentage of withdrawals assumed to be long-term capital gains

### 3.3 Allocation

- Each account holds a **single asset class** — no mixed allocations within an account
- Allocations are **fixed** for the life of the plan (no glide path in v1)

---

## 4. Income Sources

Users can add multiple income sources, each with a start age and end age.

### 4.1 Supported Income Types

| Type | Tax Treatment |
|------|--------------|
| Employment / Self-Employment | Ordinary income (federal + state) |
| Social Security | 0–85% taxable depending on combined income (federal); state treatment per state bucket |
| Pension | Ordinary income |
| Rental Income | Ordinary income |
| 401(k) Distribution | Ordinary income (for Traditional accounts) |
| Other | User specifies whether taxable |

### 4.2 Social Security

- User specifies estimated **monthly benefit** and **start age** (62–70)
- Taxable portion calculated per IRS rules based on **combined income** (AGI + non-taxable interest + 50% of SS benefits):
  - Combined income < $25,000 (single) / $32,000 (married): 0% taxable
  - $25,000–$34,000 (single) / $32,000–$44,000 (married): up to 50% taxable
  - Above those thresholds: up to 85% taxable
- Filing status (single / married filing jointly) is a plan-level setting

### 4.3 Income Fields

Each income source requires:
- Name / label
- Type (from list above)
- Annual amount
- Start age
- End age
- Taxable (yes/no) — for "Other" type only

---

## 5. Expenses

Users can add multiple expense items, each with a time horizon and inflation rate.

### 5.1 Expense Fields

Each expense requires:
- Name / label
- Annual amount (in today's dollars)
- Start age
- End age
- Annual inflation rate (%) — applied to grow the expense each year of the simulation

### 5.2 Healthcare

Healthcare is entered as a standard expense item. No ACA subsidy modeling in v1. Users are expected to estimate their own net healthcare costs.

---

## 6. Tax Calculations

Tax calculations are applied annually within each simulation run.

### 6.1 Federal Income Tax

- Progressive tax brackets applied to **ordinary taxable income**
- Ordinary income includes: Traditional account withdrawals, employment income, Social Security taxable portion, pension, rental income
- Tax brackets updated to reflect current year (stored in app config, updateable)
- Filing status: Single or Married Filing Jointly (plan-level setting)

### 6.2 Long-Term Capital Gains Tax (Federal)

- Applied to gains on **Taxable Brokerage** withdrawals
- User specifies what % of withdrawals from a taxable brokerage account are gains
- LTCG rates: 0%, 15%, 20% based on taxable income thresholds
- LTCG income does not stack on top of ordinary income for bracket purposes — standard IRS stacking rules apply

### 6.3 State Income Tax

Three state buckets:

| Bucket | Treatment |
|--------|-----------|
| **No Income Tax** | TX, FL, WA, NV, WY, SD, AK, NH, TN — 0% state tax |
| **Moderate Tax States** | All other states — user specifies a single flat effective rate (%) |
| **California** | Full progressive bracket modeling using current CA tax rates |

- User selects their state bucket at the plan level
- For California: progressive brackets applied to state taxable income (which follows federal AGI with CA-specific adjustments)
- Social Security is **not taxed** at the state level in California or most states — the app will not apply state tax to SS income

### 6.4 Required Minimum Distributions (RMDs)

- Automatically calculated and enforced starting at **age 73**
- Applies to all **Traditional / Pre-tax** accounts
- RMD amount calculated annually using IRS Uniform Lifetime Table (life expectancy factor based on age)
- RMD formula: `Account Balance / Life Expectancy Factor`
- RMDs are treated as ordinary income for tax purposes
- If RMD exceeds spending needs, excess is modeled as going to a taxable account (or noted as surplus taxable income)

### 6.5 Tax-Efficient Withdrawal Sequencing

When funds are needed to cover expenses, the simulation draws from accounts in the following order:

1. Income sources (Social Security, pension, employment, etc.)
2. Taxable Brokerage accounts
3. Traditional / Pre-tax accounts
4. RMDs are taken first from Traditional accounts regardless of need

---

## 7. Monte Carlo Simulation

### 7.1 Historical Return Data

- Source: S&P 500 monthly returns (`historic-monthly.txt`)
- Format: Date, Price, Monthly Change %
- The simulation samples from the historical monthly return distribution

### 7.2 Simulation Mechanics

- Each simulation run covers the full planning horizon year by year
- For each year:
  - Apply monthly returns to stock accounts (12 random samples from historical data, with replacement)
  - Apply fixed annual return rate to bond and savings accounts
  - Apply income sources active in that year
  - Apply inflation-adjusted expenses for that year
  - Apply tax-efficient withdrawals to cover expense shortfall
  - Apply RMDs if age ≥ 73
  - Calculate taxes owed (federal + state)
  - Update account balances
- A run "fails" if the total portfolio balance reaches $0 before the planning horizon

### 7.2a Market Regime Control

Users can optionally specify an initial market regime to stress-test or model specific scenarios:

**Initial Market Selection** (per-simulation parameter, not persisted):
- **Random** (default) — Year 1 returns sampled uniformly from all historical years
- **Bear start** — Year 1 constrained to a historically bear market year (negative annual return)
- **Bull start** — Year 1 constrained to a historically bull market year (non-negative annual return)

**Markov Chain Transitions** (Years 2+):
- For "Bear start" or "Bull start" scenarios, years 2 through N transition stochastically via a Markov chain
- Transition probabilities (P(bull|bull), P(bear|bear)) are empirically derived from non-overlapping annual windows in the historical S&P 500 data
- This creates realistic regime persistence: bull markets tend to persist, bear markets tend to be shorter-lived
- Example: ~75% probability a bull year is followed by another bull year; ~55% probability a bear year is followed by another bear year
- "Random" mode is unaffected and uses the original block bootstrap sampling for all years

### 7.3 Simulation Configuration

**Global Settings** (apply across all plans being compared):

| Parameter | Default | Range |
|-----------|---------|-------|
| Number of runs | 1,000 | 100 – 10,000 |
| Lower percentile band | 10th | 1st – 49th |
| Upper percentile band | 90th | 51st – 99th |

**Per-Run Settings** (can be set for each simulation run):

| Parameter | Default | Options |
|-----------|---------|---------|
| Initial market regime | Random | Random, Bear start, Bull start |

---

## 8. Plans

### 8.1 Plan Management

- Users can create, name, edit, duplicate, and delete plans
- Up to ~20 plans stored in the local SQLite database
- No user authentication required (single-user local app)
- Each plan stores: user profile, all accounts, all income sources, all expenses, plan-level settings (filing status, state bucket)

### 8.2 Plan-Level Settings

- Current age
- Planning horizon (max age)
- Filing status (Single / Married Filing Jointly)
- State tax bucket (No Tax / Moderate — with flat rate / California)

---

## 9. Simulation Output

### 9.1 Primary View (always visible)

Displayed for each plan being simulated:

- **Probability of success** — % of runs where portfolio does not reach $0
- **Median portfolio value** — year-by-year chart of the 50th percentile run
- **Percentile band chart** — shaded area chart showing the lower-to-upper percentile band of portfolio value across all runs, year by year

### 9.2 Detail View (on demand)

Accessible via a separate panel/modal for a selected plan and a selected year or year range:

- **Annual income breakdown** — income by source
- **Annual expense breakdown** — expenses by category
- **Tax breakdown** — federal ordinary income tax, federal LTCG tax, state tax, total effective tax rate

---

## 10. Plan Comparison

- Up to **3 plans** can be selected and compared simultaneously
- The primary view (success probability, median value, percentile band) is shown side by side or overlaid for all selected plans
- Simulation configuration settings are **shared** across all compared plans (not per-plan)

---

## 11. User Interface

### 11.1 Overall Layout

A **persistent left sidebar** for navigation with the main content area to the right. Single-page app — no full page reloads.

Sidebar items:
- **Plans** — list of saved plans (home screen)
- **Compare** — plan comparison view
- **Simulate** — simulation results view
- Settings icon — opens simulation configuration panel

---

### 11.2 Screen: Plans List

The home/landing screen. Displays a card or table row per saved plan showing:
- Plan name
- Current age / planning horizon
- Last simulated date
- Success probability from last simulation run (if available)
- Actions: Edit, Duplicate, Delete

A prominent **"New Plan"** button at the top.

---

### 11.3 Screen: Plan Editor

Opens when creating or editing a plan. Uses a **tabbed layout** with four tabs:

**Tab 1 — Profile & Settings**
- Plan name
- Current age, planning horizon
- Filing status (Single / Married Filing Jointly)
- State tax bucket selection + flat rate input if Moderate is selected

**Tab 2 — Accounts**
- Table of existing accounts: name, tax treatment, asset class, balance, return rate
- "Add Account" button opens an inline form or slide-in panel
- Edit / Delete action per row

**Tab 3 — Income Sources**
- Table of income sources: name, type, annual amount, start age, end age
- "Add Income" button opens inline form
- Edit / Delete action per row

**Tab 4 — Expenses**
- Table of expenses: name, annual amount, inflation rate, start age, end age
- "Add Expense" button opens inline form
- Edit / Delete action per row

A **"Save Plan"** button is always visible at the top right. A **"Run Simulation"** button next to it navigates to the Simulation Results screen for this plan.

---

### 11.4 Screen: Simulation Results

**Top bar:**
- Current plan name
- Simulation config summary (e.g. "1,000 runs · 10th–90th percentile") with a **"Configure"** link opening a settings panel
- **"Run"** button
- Progress indicator shown while simulation is running

**Main content — four panels stacked vertically:**

**Panel 1 — Success Rate**
- Large prominent percentage (e.g. "87% probability of success")
- Color indicator: green (≥ 80%), yellow (50–79%), red (< 50%)

**Panel 2 — Median Portfolio Value**
- Line chart, year by year from current age to planning horizon
- X-axis: age, Y-axis: portfolio value in dollars
- "View Details" link below opens the Detail Drawer

**Panel 3 — Percentile Band**
- Shaded area chart showing the band between lower and upper percentile
- Median line overlaid through the middle
- Same X/Y axes as Panel 2
- "View Details" link below opens the Detail Drawer

**Panel 4 — Account Balances Over Time**
- Multi-line chart showing the median balance of each account across the planning horizon
- Each account has its own colored line
- Legend with **clickable account name chips** to toggle individual accounts on/off
- X-axis: age, Y-axis: balance in dollars
- "View Details" link below opens the Detail Drawer

---

### 11.5 Detail Drawer (on demand)

Slides in from the right when any "View Details" link is clicked. Contains:
- Age / year selector (slider or dropdown) to pick a specific year
- **Income breakdown** — each income source and amount for that year
- **Expense breakdown** — each expense and amount for that year
- **Tax breakdown** — federal ordinary income tax, federal LTCG tax, state tax, total effective tax rate

Closeable with an X button.

---

### 11.6 Screen: Compare

**Top section:**
- Three plan selector dropdowns (Plan 1 required; Plan 2 and 3 optional)
- Shared simulation config summary with **"Configure"** link
- **"Run Comparison"** button

**Summary section — three columns (one per plan):**
- Plan name
- Success rate (large, color-coded)
- Median final portfolio value
- **"View Simulation Details"** link — navigates to the full Simulation Results screen for that plan

The Compare screen shows summary metrics only. Full charts and detail are accessed via the per-plan "View Simulation Details" link.

---

### 11.7 UI Principles

- No modals for data entry — prefer inline forms or slide-in panels to preserve context
- Simulation progress is shown explicitly — runs are not instant at high counts
- All monetary values displayed in **today's dollars** by default
- Laptop screen optimized — no mobile/responsive requirement in v1

---

## 13. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Charts | Recharts |
| Backend | Python + FastAPI |
| Database | SQLite |
| ORM | SQLAlchemy (or raw SQL) |

- Runs entirely on local machine
- Architecture designed to be portable to a hosted web server in future (no local-only dependencies beyond SQLite file path)

---

## 14. Out of Scope (v1)

- Roth accounts (Roth IRA, Roth 401k)
- Roth conversion ladders
- Glide path / automatic asset allocation shifts
- ACA subsidy modeling
- Cost basis tracking for taxable accounts (user specifies gains % instead)
- AMT (Alternative Minimum Tax)
- Medicare IRMAA surcharges
- Multi-user / authentication
- Cloud hosting / deployment
- Mobile / responsive design

---

*End of Document*
