# Lemonade Stand for Synchronet

A native JavaScript door for [Synchronet BBS](https://www.synchro.net/):
the classic *Lemonade* door game, with no registration and no play limits.

T&J Software's DOS *Lemonade* (1996) can no longer be registered, and the
unregistered copy allows one play a day and four game days. This is the
same game rewritten as a Synchronet door. Its engine is a port of
[joeyparrish/lemonade](https://github.com/joeyparrish/lemonade), which
recovered the original's formulas from its binary: weather, the sugar,
lemon and paper-cup price rises, demand by price and temperature (including
the original's $1.26 quirk), and economics. A golden-run test keeps this port
identical to that engine.

You start with $1.00 from your mother. Each day brings a forecast and a cost
per glass: decide how many glasses to make and what to charge. Rain means no
sales, but you still pay for every glass. After a season of 30 days (by
default), your cash is your score on the top ten.

- **ANSI art with bean characters.**
  - **Splash:** a bean running its lemonade stand.
  - **Each day:** a weather icon beside the forecast, and a happy, soggy or
    glum bean beside the results.
  - **News:** a shocked bean when sugar, lemons or cups go up.
  - **Season end:** a celebration, a CLOSED sign if you go bust, and a trophy
    for a top-ten finish.

  It's half-block pixel art drawn in code. Non-ANSI callers get the text
  only.
- **Saved after every day.** A dropped call loses nothing; the next visit
  picks the season up where it was.
- **Multi-node safe.** Player and score files are locked while they're
  written.
- **Sysop limits, if you want them.** Visits per day and days per visit are
  configurable, and both are unlimited if you choose.

## Install

Requires Synchronet 3.20 or later.

1. Copy `src/lemonade.js` to Synchronet's `exec/` (or `mods/`), and
   `src/lemonade_engine.js` and `src/lemonade_art.js` to `exec/load/` (or
   `mods/load/`).
2. In SCFG, under External Programs, add a program to a section:
   - **Command Line:** `?lemonade`
   - **Multiple Concurrent Users:** Yes
   - **Drop File Type:** None
   - **Native Executable / Use Shell / I/O intercept:** No
3. Optional, in `ctrl/modopts.ini`:

   ```ini
   [lemonade]
   plays_per_day = 3     ; visits a day in which a caller may play (0 = unlimited)
   days_per_play = 0     ; game days per visit (0 = unlimited)
   season_days   = 30    ; game days in a season
   ```

Saved games and the top ten go in `data/lemonade/` (`players.json`,
`scores.json`).

## Development

```
node test/test_engine.js && node test/test_art.js     # no dependencies
docker build -t lemonade-test . && docker run --rm lemonade-test
```

The engine (`src/lemonade_engine.js`) is pure and deterministic, with no
clock, no global randomness and no I/O, and it stays ES5. Synchronet's
SpiderMonkey has no `let`, `const`, arrow functions or `Math.imul`, and a
test enforces that. The same file loads in Synchronet (`load()`) and in node
(`require()`).

The art is drawn in code by `tools/make_art.py`, which writes
`src/lemonade_art.js` (don't edit that file by hand; CI checks it matches the
script). `python3 tools/preview_art.py art.html` renders every piece in a
browser, in VGA colors.

`test/fixtures/golden.json` holds runs recorded from the original TypeScript
engine. To re-record them, check out joeyparrish/lemonade, copy
`tools/record-golden.mts` into it, and run
`npx tsx record-golden.mts > golden.json`.
