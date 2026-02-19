"""
Required Minimum Distribution (RMD) module.

Uses the IRS Uniform Lifetime Table (2022 update, effective for RMDs beginning
2022) to compute annual RMDs for account owners of traditional IRAs, 401(k)s,
and other pre-tax accounts.

RMD start age: 73 (SECURE Act 2.0, signed Dec 2022, effective Jan 2023).
"""

# ---------------------------------------------------------------------------
# IRS Uniform Lifetime Table (2022 revision)
# Key: age, Value: distribution period (life expectancy factor)
# Ages above 120 use the factor 2.0 per IRS guidance.
# ---------------------------------------------------------------------------

UNIFORM_LIFETIME_TABLE: dict = {
    72: 27.4,  74: 25.5,  76: 23.7,  78: 22.0,  80: 20.2,
    73: 26.5,  75: 24.6,  77: 22.9,  79: 21.1,  81: 19.4,
    82: 18.5,  84: 16.8,  86: 15.2,  88: 13.7,  90: 12.2,
    83: 17.7,  85: 16.0,  87: 14.4,  89: 12.9,  91: 11.5,
    92: 10.8,  94:  9.5,  96:  8.4,  98:  7.3, 100:  6.4,
    93: 10.1,  95:  8.9,  97:  7.8,  99:  6.8, 101:  6.0,
    102: 5.6, 104:  4.9, 106:  4.3, 108:  3.9, 110:  3.5,
    103: 5.2, 105:  4.6, 107:  4.1, 109:  3.7, 111:  3.4,
    112: 3.3, 114:  3.0, 116:  2.8, 118:  2.5, 120:  2.0,
    113: 3.1, 115:  2.9, 117:  2.7, 119:  2.3,
}

# SECURE Act 2.0: RMDs start at 73 for anyone born after 1950.
# (Rises to 75 in 2033, but we use 73 for current planning purposes.)
RMD_START_AGE: int = 73


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_life_expectancy_factor(age: int) -> float:
    """
    Return the IRS Uniform Lifetime Table distribution period for *age*.

    Raises ValueError for ages below 72 (not in the table; no RMD applies).
    Ages above 120 return 2.0 per IRS guidance.
    """
    if age < 72:
        raise ValueError(f"Age {age} is below the minimum table age of 72")
    return UNIFORM_LIFETIME_TABLE.get(age, 2.0)


def calculate_rmd(balance: float, age: int) -> float:
    """
    Return the Required Minimum Distribution amount for the year.

    balance : account balance as of December 31 of the *prior* year.
    age     : account owner's age during the distribution year.

    Returns 0.0 if age < RMD_START_AGE (73) or balance <= 0.

    Formula: RMD = prior_year_balance / life_expectancy_factor
    """
    if age < RMD_START_AGE or balance <= 0:
        return 0.0
    return balance / get_life_expectancy_factor(age)
