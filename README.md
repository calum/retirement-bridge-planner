# Retirement Bridge Planner

A plain-English retirement planner for a couple. It shows how long savings last in the "bridge" years before State Pension starts, what an extra pension would change, whether Marriage Allowance helps, and whether to invest a tax-free lump sum or keep it as cash.

- One static page (`index.html`), no build step, no server.
- All numbers are typed into the page and stay in your browser (`localStorage`). Nothing is sent anywhere.
- Figures in the repo are made-up examples. Replace them on the "Your numbers" page.
- Tax is basic rate only (20% above the personal allowance). State Pension age is worked out from each date of birth using current England, Wales and Northern Ireland rules.

This is a planning aid, not regulated financial advice.

## Tests

The calculations are checked in layers. Run `npm test` (plain Node, nothing to install).

1. **Hand-calculated figures.** Tax, income, ISA, savings and Marriage Allowance worked out on paper.
2. **An independent calculator.** A separate year-by-year implementation, compared with the monthly engine across 11 scenarios.
3. **Rules that must always hold**, checked on 400 random households: tax is never negative, Marriage Allowance never raises tax, the savings balance always equals the starting pot plus every month's money in and out, and so on.
4. **State Pension age** at every official boundary date, and monotonic over 35 years of birthdates.
5. **Lump sum maths** against compound interest and the annuity formula.
6. **Formatting** of pounds, signs and ages.

The suite was also tested by breaking the engine on purpose (35 deliberate bugs such as a wrong tax rate, a missing month of interest or a wrong traffic-light threshold). All were caught.

`npm run test:ui` drives the real page in a headless browser. It needs Playwright:
`PLAYWRIGHT_MODULE=/path/to/node_modules/playwright CHROMIUM=/path/to/chromium npm run test:ui`

## Rules the model uses

- Each month: pensions and State Pensions in, tax out, spending out. The difference moves the savings pot.
- Tax: 20% of each person's pension plus State Pension above the personal allowance (£12,570). Private pension is treated as fully taxable.
- Marriage Allowance (optional): used only in months where one partner has income at or below the allowance and the other is a basic-rate taxpayer. £1,260 of allowance moves across, worth up to £252 a year. The giver's own allowance falls, so it is only used when it saves money overall.
- The plan runs until Person 1 is 70, or until 3 years after the later State Pension starts if that is later. The lump sum page looks on to age 90.
- The traffic light also turns amber or red if income stays below spending after the plan ends and the savings would run out before age 95 or 85.
- ISA income stops if the ISA pot would run out. First pension payments can be delayed by a set number of months (pensions are paid in arrears).
- The plan page has stress tests: payments a month late, 2.5% inflation with the allowance frozen, spending 10% higher, and all three.
- Known simplifications: tax is worked out month by month at the yearly rate (can slightly overstate tax in the year a State Pension starts); pensions start in the month of the birthday; no salary, one-off costs or care costs are modelled.
- Figures are in today's money. The allowance is frozen until April 2031, so inflation increases tax.
