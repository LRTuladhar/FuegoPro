"""
2024 federal and California tax constants.

All dollar amounts are nominal 2024 figures.  The simulation engine does NOT
inflate brackets over time — this is a deliberate simplification consistent
with using historical real returns (which already embed inflation).
"""

# ---------------------------------------------------------------------------
# Federal ordinary income brackets  (rate, upper_bound)
# Final entry always has upper_bound = inf
# ---------------------------------------------------------------------------

FEDERAL_ORDINARY: dict[str, list[tuple[float, float]]] = {
    "single": [
        (0.10,  11_600),
        (0.12,  47_150),
        (0.22, 100_525),
        (0.24, 191_950),
        (0.32, 243_725),
        (0.35, 609_350),
        (0.37, float("inf")),
    ],
    "married": [
        (0.10,  23_200),
        (0.12,  94_300),
        (0.22, 201_050),
        (0.24, 383_900),
        (0.32, 487_450),
        (0.35, 731_200),
        (0.37, float("inf")),
    ],
}

# ---------------------------------------------------------------------------
# Federal long-term capital gains brackets  (rate, upper_bound)
# LTCG income is stacked on top of taxable ordinary income when finding rate.
# ---------------------------------------------------------------------------

FEDERAL_LTCG: dict[str, list[tuple[float, float]]] = {
    "single": [
        (0.00,  47_025),
        (0.15, 518_900),
        (0.20, float("inf")),
    ],
    "married": [
        (0.00,  94_050),
        (0.15, 583_750),
        (0.20, float("inf")),
    ],
}

# ---------------------------------------------------------------------------
# Federal standard deduction
# ---------------------------------------------------------------------------

FEDERAL_STANDARD_DEDUCTION: dict[str, float] = {
    "single":  14_600.0,
    "married": 29_200.0,
}

# ---------------------------------------------------------------------------
# California ordinary income brackets  (rate, upper_bound)
# Includes the 1% Mental Health Services Tax surtax on income > $1 M.
# ---------------------------------------------------------------------------

CA_BRACKETS: dict[str, list[tuple[float, float]]] = {
    "single": [
        (0.010,    10_412),
        (0.020,    24_684),
        (0.040,    38_959),
        (0.060,    54_081),
        (0.080,    68_350),
        (0.093,   349_137),
        (0.103,   418_961),
        (0.113,   698_274),
        (0.123, 1_000_000),
        (0.133, float("inf")),   # 12.3% + 1% MHST
    ],
    "married": [
        (0.010,    20_824),
        (0.020,    49_368),
        (0.040,    77_918),
        (0.060,   108_162),
        (0.080,   136_700),
        (0.093,   698_274),
        (0.103,   837_922),
        (0.113, 1_000_000),
        (0.123, 1_396_548),
        (0.133, float("inf")),
    ],
}

# ---------------------------------------------------------------------------
# California standard deduction (much smaller than federal)
# ---------------------------------------------------------------------------

CA_STANDARD_DEDUCTION: dict[str, float] = {
    "single":   5_202.0,
    "married": 10_404.0,
}

# ---------------------------------------------------------------------------
# Social Security provisional income thresholds
# provisional_income = non-SS AGI + tax-exempt interest + 0.5 * SS benefits
# ---------------------------------------------------------------------------

SS_THRESHOLDS: dict[str, tuple[float, float]] = {
    "single":  (25_000.0, 34_000.0),
    "married": (32_000.0, 44_000.0),
}
