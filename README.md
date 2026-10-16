# Retirement Bridge Planner

A plain-English retirement planner for a couple. It gives one clear answer to "can you afford to retire?", the most you could safely spend each month, and what extra income would make your planned spending safe if the answer is not yet. It shows how long savings last in the "bridge" years before State Pension starts, what an extra pension would change, whether Marriage Allowance helps, and what to do with a tax-free lump sum (keep it as cash, split it and let the investment grow, or split it and take a yearly income).

- One static page (`index.html`), no build step, no server.
- All numbers are typed into the page and stay in your browser (`localStorage`). Nothing is sent anywhere.
- Figures in the repo are made-up examples. Replace them on the "Your numbers" page.
- Tax is basic rate only (20% above the personal allowance). State Pension age is worked out from each date of birth using current England, Wales and Northern Ireland rules.

This is a planning aid, not regulated financial advice.

## Privacy

Nothing you type is ever sent anywhere. There is no server, no account, no analytics and no cookies. The numbers are saved only in the browser's own storage on the device being used, so they are still there next time, and a "Delete my numbers" button removes them.

This is enforced, not just promised:

- The page contains no web addresses at all: no outside fonts, scripts, images or links to load, and no code that can send data.
- The standalone page also carries a Content Security Policy that makes the browser itself refuse any outside connection.
- `npm run test:privacy` scans the source for anything that could leak data. It was checked by injecting a fetch call, a beacon, an outside font, a cookie and an image ping: each one fails the test.
- The browser tests record every network request across the whole run and fail if there is any besides local files. They also confirm the app works with the internet switched off.

The only thing that travels over the internet is the page itself arriving, as with any website. The host (GitHub Pages) can see that the page was loaded, but never the numbers.

## Guided tour

The first time the page is opened with nothing saved, it starts a guided tour: one plain question per screen (dates of birth, pensions, State Pensions, spending, savings, lump sum, Marriage Allowance), with examples, "where do I find this?" help and live feedback such as the State Pension age. It ends with the answer. It can be skipped or restarted from the "Guided tour" link at the top of every page.

## What "safe" means

The plan page opens with a straight answer: **yes**, **close but not safe yet**, or **not yet**. A plan counts as safe only if it still works after all of this:

- An emergency fund of 6 months of your spending is in place by the end of the first year and is never touched.
- Spending is 5% higher than planned.
- First pension payments arrive a month late (pensions are paid in arrears).
- Prices rise 2.5% a year (the tax-free allowance is frozen until April 2031).
- Money coming in after the State Pensions start covers spending, so the savings last for life, not just to the end of the plan.

The page also works out the **safe maximum**: the highest monthly spending, with everything else as entered, that still passes all of that. It is found by trying higher and lower amounts, so "you could safely retire spending up to £X a month" is always a figure that has passed the test.

When the answer is not yet, the page works out the smallest extra yearly income, for each person separately, that would make it safe. It can be part-time work or anything else taxed as income. It stops at that person's State Pension age. Tax and National Insurance are taken off. A "Try this in my plan" button adds it so you can see the new answer.

## Phones

The phone layout is only used on small touch screens, where touch is the main way of pointing. There the tabs move to a bar at the bottom, tables turn into cards, and buttons get bigger. Laptops and PCs always get the full layout, even in a narrow or split-screen window, where the page simply wraps and the tables scroll.

## Tests

The calculations are checked in layers. Run `npm test` (plain Node, nothing to install). It runs the maths checks and the privacy checks.

1. **Hand-calculated figures.** Tax, income, ISA, savings and Marriage Allowance worked out on paper.
2. **An independent calculator.** A separate year-by-year implementation, compared with the monthly engine across 11 scenarios.
3. **Rules that must always hold**, checked on 400 random households: tax is never negative, Marriage Allowance never raises tax, the savings balance always equals the starting pot plus every month's money in and out, and so on.
4. **State Pension age** at every official boundary date, and monotonic over 35 years of birthdates.
5. **Lump sum maths** against compound interest and the annuity formula.
6. **Formatting** of pounds, signs and ages.

The suite was also tested by breaking the engine on purpose (64 deliberate bugs such as a wrong tax rate, a missing month of interest, a wrong National Insurance rate, an emergency fund of the wrong size or an investment reported a year late). All were caught.

`npm run test:ui` drives the real page in a headless browser. It needs Playwright:
`PLAYWRIGHT_MODULE=/path/to/node_modules/playwright CHROMIUM=/path/to/chromium npm run test:ui`

## Rules the model uses

- Each month: pensions and State Pensions in, tax out, spending out. The difference moves the savings pot.
- Tax: 20% of each person's pension plus State Pension above the personal allowance (£12,570). Private pension is treated as fully taxable.
- Marriage Allowance (optional): used only in months where one partner has income at or below the allowance and the other is a basic-rate taxpayer. £1,260 of allowance moves across, worth up to £252 a year. The giver's own allowance falls, so it is only used when it saves money overall.
- The plan runs until Person 1 is 70, or until 3 years after the later State Pension starts if that is later. The lump sum page looks on to age 90.
- The traffic light also turns amber or red if income stays below spending after the plan ends and the savings would run out before age 95 or 85.
- Lump sum: you choose how much goes into the savings pot and how much is invested. The investment grows each year at the growth rate you choose (above inflation). Optionally it also pays a yearly income, which stops if the pot runs out. The investment is shown separately and is not counted as savings in the traffic light.
- ISA income stops if the ISA pot would run out. First pension payments can be delayed by a set number of months (pensions are paid in arrears).
- The plan page has stress tests: payments a month late, 2.5% inflation with the allowance frozen, spending 10% higher, and all three.
- Known simplifications: tax is worked out month by month at the yearly rate (can slightly overstate tax in the year a State Pension starts); pensions start in the month of the birthday; no salary, one-off costs or care costs are modelled.
- Figures are in today's money. The allowance is frozen until April 2031, so inflation increases tax.

## Example figures

The page opens with round example numbers so each field is easy to recognise. Replace them on "Your numbers".

| Field | Example | What it means |
|---|---|---|
| Person 1 pension | £15,000 a year from age 60 | Workplace pension, before tax. The plan starts on this birthday |
| Person 2 pension | £0 from age 57 | Private pension. Most open at 55, or 57 from April 2028 |
| State Pensions | £12,547.60 each | Full new State Pension for 2026/27 |
| Spending | £1,500 a month | Everything you expect to spend: bills, food, housing, travel, holidays and treats |
| Cash savings | £20,000 | Easy-access savings today |
| Lump sum | £20,000, of which £2,000 to the savings pot, £18,000 invested | Tax-free lump sum on retirement |
| Income from the investment | 4% a year | Only used if you choose the yearly-income option |
| Growth | 3% a year above inflation | Used for the investment charts |
| Inflation, cash interest, payment delay | 0, 0, 0 months | Raise them to be more careful |
