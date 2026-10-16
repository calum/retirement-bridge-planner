# Retirement Bridge Planner: guide for Claude

A single-page web app for a UK couple in their 60s. It answers one question: **can we afford to retire, and what is the most we could safely spend each month?** It is a family tool, so the voice is "this app", never "we". It is a planning guide, not regulated financial advice, and it must never claim to be.

Repo: https://github.com/calum/retirement-bridge-planner (public). The example numbers in the repo are made up. Real family figures must never be committed (see "Real figures" below).

## Non-negotiables

These are product promises. Do not weaken them without the user saying so.

1. **Privacy: nothing is ever sent anywhere.** No `fetch`, XHR, beacons, sockets, workers, cookies, forms, images, outside fonts, scripts or links to load. The page has zero web addresses. Numbers live only in `localStorage` (key `retirement-bridge-v1`). The standalone page also has a Content Security Policy that blocks every outside connection. `tests/privacy.test.js` scans the source and the browser tests record every network request. Never add a dependency, a CDN, a Google Font, analytics, or a build step.
2. **Plain English for a 60-year-old with low financial literacy.** Short sentences, no jargon. The tests enforce: Flesch reading ease of 60 or more on the main pages, and none of these words anywhere: drawdown, SWR, annualised, decumulation, gap years, bridge years, buffer, ideal, essential.
3. **Voice:** say "this app", never "we", "our", "us" or "let's" (a test scans every page and tour step). No emoji. No marketing tone. Describe what happens, in order.
4. **Honest answers.** The app says "Not yet" when it is not yet. "Safe" only ever means "passes the safe test below".
5. **Mobile view only on touch devices.** Phone layout (bottom tab bar, tables as cards) is gated by `@media (max-width:640px) and (pointer:coarse)`. Laptops and PCs always get the full layout, even in a narrow window.

## What the answer is based on

All rules live in the engine (between `/*ENGINE_START*/` and `/*ENGINE_END*/` in `index.html`). Constants are at the top of that block.

- **Timeline:** monthly, from Person 1's chosen retirement date (`pensionDate[0]`, any day, not just a birthday; or today if that has passed) until Person 1 is 70 or 36 months after the later State Pension starts, whichever is later. Person 2's own pension starts on `pensionDate[1]`. Everything is in today's money. Dates are `YYYY-MM-DD` strings; the engine works in whole months (`monthIdx`).
- **Tax:** 20% basic rate only, per person, above the £12,570 personal allowance. Allowance is frozen until April 2031; with `inflation > 0` it shrinks in real terms until then. Higher-rate and Scottish tax are not modelled. Private pension is treated as fully taxable (the 25% tax-free part is ignored, which is cautious).
- **State Pension age:** from date of birth, England/Wales/NI rules: 66 up to 5 Apr 1960; 66 plus 1 to 11 months up to 5 Mar 1961; 67 up to 5 Apr 1977; then 68. Born before 6 Oct 1954 is not supported (the UI warns).
- **Earnings:** optional part-time earnings per person, until that person's own State Pension age. Employee National Insurance 8% above £12,570 of earnings (rate and threshold not re-verified online).
- **Marriage Allowance (optional toggle):** a person with income at or below the allowance gives £1,260 (10% of the allowance, rounded up to £10) to a basic-rate partner, worth up to £252 and never more than the tax owed. The giver's own allowance falls, so it is used only when it saves money overall. Checked against gov.uk.
- **Lump sum:** `lump` is split into `emergency` (into savings) and the rest invested. Three modes (`modeOf`): `cash` (`invest:false`), `grow` (`invest:true, drawdown:false`), `income` (`invest:true, drawdown:true`, yearly income `swr`% of the amount first invested). The investment grows at `growth`% above inflation. Income stops if the pot runs out (`lumpModel`).
- **Payments arrive late:** `payLag` months before first pension and State Pension payments (paid in arrears; gov.uk says the first State Pension payment can come up to 5 weeks after it starts).

### The "safe" test (`readiness`) and the safe maximum (`maxSafeSpend`)

A plan is **safe** when, under a safety margin, all of these hold:

- Margin (`stressedState`): spending 5% higher (`SPEND_MARGIN`), first payments at least 1 month late (`STRESS_LAG`), prices up at least 2.5% a year (`STRESS_INFLATION`).
- Savings never go below zero.
- The emergency fund (`RESERVE_MONTHS` = 6 months of the spending being tested) is in place by the end of the first year and never touched after (`minLater`).
- Income after the State Pensions start covers spending, so savings last for life: `assess` flags a "long-run" deficit if savings would run out before age 95 (warn) or 85 (bad).

Levels: `safe`; `tight` (works as entered, fails the margin); `no` (runs out as entered). `maxSafeSpend` searches for the highest monthly spending (rounded down to £10, ceiling £20,000) that is safe, with everything else as entered. Safety only gets worse as spending rises, which is what makes the search valid. `neededWork(s, person)` finds the smallest extra yearly earnings for one person that makes the planned spending safe.

The thresholds above (6 months, 5%, 1 month, 2.5%, 95 and 85) are product decisions. Do not change them on your own.

## Code map (`index.html`, one file, no build)

- Head: `<title>`, viewport meta, one `<style>` block with theme tokens (light, dark via `prefers-color-scheme`, and `[data-theme]`).
- **Engine** (`ENGINE_START` to `ENGINE_END`): `defaultState`, `spaMonths`, `dateAtAge`, `simulate`, `summarise`, `assess`, `stressedState`, `readiness`, `neededWork`, `maxSafeSpend`, `lumpModel`. Pure functions, no DOM. Tests load this block directly.
- **Formatters** (`FORMAT_START` to `FORMAT_END`): `money`, `axisMoney`, `ageText`.
- UI helpers, hand-written SVG charts (`heroChart`, `potChart`, `lineChart`), `verdict`, `answerHTML`, glossary, `cardify` (turns tables into cards on phones).
- `pages.plan | pot | whatif | lump | numbers | tour | privacy`, each with `build()` (HTML once), `update()` (refresh live parts, runs on every input), optional `bind()`.
- Router: hash routes (`#plan` and so on). With no hash and `tourSeen` false it redirects to `#tour`.
- State object `S`, saved by `save()`, loaded by `load()`, wiped by `wipe()`. `load()` migrates old saves (renamed or removed keys). **Adding or renaming a state key means: default in `defaultState`, a migration in `load()`, and a test.** Existing migrations: two spending figures became `spend`; `pensionAge` (an age) became `pensionDate` (a date, via `dateAtAge`); saves without `drawdown` keep taking an income; saves without `tourSeen` skip the tour.
- Inputs use `data-key="path.0"` bound generically in `bindCommon`. Names are shown with `nm(i)` or `nmx(i)` (escaped, live-updating). Anything user-typed that goes into HTML or a tooltip must go through `esc()`.

State keys: `names, dob, dobConfirmed, pension, pensionDate, sp, work, spend, cash, lump, emergency, swr, invest, drawdown, inflation, cashReal, growth, marriage, payLag, extra2, tourSeen`.

## Commands

```
npm test                 # engine maths checks + privacy source scan (plain Node, no install)
npm run test:privacy
npm run test:mutation    # breaks the engine on purpose; every break must be caught (about 3 minutes)
npm run test:ui          # real browser run (needs Playwright, see below)
```

UI tests need Playwright and Chromium. In the cloud environment these exist already:

```
PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright CHROMIUM=/opt/pw-browsers/chromium node tests/ui.smoke.js
```

Never run `playwright install`. Elsewhere, install Playwright and point the two variables at it.

## How to work on this

1. Read the relevant part of `index.html` first. Make the smallest change that does the job.
2. **Test first for money logic.** Engine rules go in `tests/engine.test.js` in three layers: numbers worked out by hand on paper (with the working in a comment), an independent year-by-year calculator (`refPlan`) compared with the monthly engine, and randomised property checks (seeded). Behaviour goes in `tests/ui.smoke.js`.
3. **Mutation-check every new rule.** Add an entry to `MUTATIONS` in `tests/mutation.js` (search string, broken replacement) for each new calculation rule or threshold. If it "survives", the tests have a gap: add a test, do not delete the mutation. If a refactor makes a search string "missing", update the string.
4. Run `npm test`, `npm run test:ui` and `npm run test:mutation` before committing logic changes.
5. Look at it. Take screenshots at a desktop width (about 1000px) and a phone (390px, `isMobile:true, hasTouch:true`), light and dark. Check there is no sideways scroll.
6. Update `README.md` when user-visible behaviour changes. Keep wording plain.
7. Commit to `main` and push. Use the commit trailers the session supplies. Verify with `gh api repos/calum/retirement-bridge-planner/branches/main --jq .commit.sha` against `git rev-parse HEAD` (a "push negotiation failed ... proceeding anyway" message is harmless).

### Testing lessons learned (save yourself the time)

- Do not pick test figures that sit exactly on a boundary (for example spending that equals savings divided by 441). Rounding noise decides the result. Use a clear margin.
- Playwright: navigating to the same URL with a different `#hash` does not reload the page. The `go()` helper clears `localStorage` and then calls `reload()`. Full-page screenshots switch off touch emulation afterwards, so do not mix them with media-query checks in one page object.
- Headless Chromium shows dates in US format. Date inputs take `YYYY-MM-DD` with `fill`.
- A mutation test that fails to be caught usually means a missing scenario (for example "works as entered but is close to the margin"), not a bad mutation.

## Environment notes (Claude Code on the web)

- Sessions cannot create GitHub repos, enable GitHub Pages, or use GraphQL (`gh api` is limited to repo-scoped REST). **GitHub Pages is not enabled yet.** The owner must turn it on in the repo: Settings, Pages, "Deploy from a branch", `main`, `/ (root)`. Then the site is `https://calum.github.io/retirement-bridge-planner/`.
- `.nojekyll` is present. The page is a single static file.
- The standalone `index.html` starts with four extra lines (`<!doctype html>`, `<html lang>`, charset meta, Content Security Policy meta). A copy published as a Claude artifact must not have them (the artifact host adds its own skeleton and CSP). Strip those four lines for that.

## Real figures (private)

The family's own figures were used as defaults in a private copy published as a Claude artifact. They are deliberately not in this repo, in tests, or in this file. Do not ask for them to be added. If the user asks you to update that private copy, ask them for the artifact URL and the figures, replace the defaults in `defaultState()` (and nothing else), strip the four standalone lines, and publish with the Artifact tool using the same URL. A local-only parity test (`spreadsheet-parity.test.js`) checked the engine against the family's original spreadsheet to the penny; it is also not in the repo.

## Known simplifications (stated to users on the Your numbers page)

- Tax is worked out monthly at the yearly rate. This can slightly overstate tax in the year a State Pension starts.
- Pensions start in the month of the birthday. No one-off costs, care costs or house moves. Spending is flat in today's money.
- No Scottish or higher-rate tax. Private pension is treated as fully taxable.
- Neither person has a salary unless `work` is entered. Cash interest and investment growth are "above inflation" and default to 0 and 3.

## Ideas not done yet

A save-to-file backup (nothing is stored online, so a lost browser means lost numbers), a printable summary, exact tax-year tax, a "retire earlier or later" what-if (needs LGPS early-retirement factors), stress-testing the investment in the main plan, the 25% tax-free part of private pensions.
