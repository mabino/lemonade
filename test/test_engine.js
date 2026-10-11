#!/usr/bin/env node
// Unit tests for the native Lemonade Stand engine
// (src/lemonade_engine.js), plain node, no dependencies.
//
// - Golden runs recorded from the original TypeScript engine
//   (joeyparrish/lemonade, Apache-2.0): same seed + decisions must give the
//   same day-by-day outcomes, so the ES5 port can't drift from the recovered
//   formulas.
// - Behaviour tests ported from that project's suite (constants, weather,
//   news events, demand bands including the $1.26 gap, economics, bust).
// - The Math.imul fallback (Synchronet's SpiderMonkey lacks Math.imul).
// - The door's own rules: daily plays, top ten, money formatting.
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

const ENGINE = path.join(__dirname, "..", "src", "lemonade_engine.js");
const E = require(ENGINE);
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("ok   " + name); }
  catch (e) { fail++; console.log("FAIL " + name + "\n     " + (e && e.message)); }
}

// --- fidelity to the original engine -----------------------------------------------
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "golden.json"), "utf8"));
test(`golden: ${golden.length} recorded runs replay identically`, () => {
  for (const run of golden) {
    let s = E.startRun(run.seed, 30);
    for (const d of run.decisions) s = E.advanceDay(s, d);
    assert.deepStrictEqual(s.history, run.history, "seed " + run.seed);
    assert.strictEqual(s.cashCents, run.finalCashCents);
    assert.ok(s.finished);
  }
});

// --- constants and setup -----------------------------------------------------------------
test("starts with a dollar, cost >= two cents, day one", () => {
  const s = E.startRun(1);
  assert.strictEqual(s.cashCents, 100);
  assert.ok(s.costPerGlassCents >= 2 && s.costPerGlassCents <= 6);
  assert.strictEqual(s.day, 1);
  assert.deepStrictEqual(s.history, []);
  assert.strictEqual(s.finished, false);
});
test("deterministic for a seed; state is plain JSON", () => {
  assert.deepStrictEqual(E.startRun(77), E.startRun(77));
  const s = E.startRun(77);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), s);
});
test("max affordable: floor(cash/cost), capped at 60000, never negative", () => {
  const s = E.startRun(1);
  assert.strictEqual(E.maxAffordableGlasses(s), Math.floor(100 / s.costPerGlassCents));
  assert.strictEqual(E.maxAffordableGlasses(Object.assign({}, s, { cashCents: 1e9 })), 60000);
  assert.strictEqual(E.maxAffordableGlasses(Object.assign({}, s, { cashCents: -500 })), 0);
});
test("validateDecision limits", () => {
  const s = E.startRun(1);
  assert.strictEqual(E.validateDecision(s, { glassesMade: 10, priceCents: 25 }), null);
  assert.match(E.validateDecision(s, { glassesMade: E.maxAffordableGlasses(s) + 1, priceCents: 25 }), /afford/i);
  assert.match(E.validateDecision(s, { glassesMade: 1, priceCents: 20001 }), /price/i);
  assert.notStrictEqual(E.validateDecision(s, { glassesMade: -1, priceCents: 25 }), null);
  assert.notStrictEqual(E.validateDecision(s, { glassesMade: 1.5, priceCents: 25 }), null);
  assert.notStrictEqual(E.validateDecision(s, { glassesMade: NaN, priceCents: 25 }), null);
});

// --- weather and news --------------------------------------------------------------------
test("weather: 71-105F, rain chance 0 or 1-69, about a third dry", () => {
  const rng = E.createRng(123); let dry = 0;
  for (let i = 0; i < 20000; i++) {
    const w = E.generateWeather(rng);
    assert.ok(w.temperatureF >= 71 && w.temperatureF <= 105);
    assert.ok(w.chanceOfRain === 0 || (w.chanceOfRain >= 1 && w.chanceOfRain <= 69));
    if (w.chanceOfRain === 0) dry++;
  }
  assert.ok(dry / 20000 > 0.28 && dry / 20000 < 0.34, "dry fraction " + dry / 20000);
});
test("rain: never when the chance is zero (and no draw happens)", () => {
  const rng = E.createRng(5), before = E.createRng(5);
  assert.strictEqual(E.resolveRain(0, rng), false);
  assert.strictEqual(rng.next(), before.next());
});
test("news events raise cost by 2/3/4 cents and stop at $0.12", () => {
  const seen = {}; const rng = E.createRng(9);
  for (let i = 0; i < 5000; i++) {
    const r = E.rollNewsEvent(2, rng);
    if (r.event) { seen[r.event] = r.cost - 2; }
  }
  assert.deepStrictEqual(seen, { sugar: 2, lemons: 3, cups: 4 });
  for (let i = 0; i < 100; i++) assert.deepStrictEqual(E.rollNewsEvent(12, rng), { cost: 12, event: null });
});

// --- demand ---------------------------------------------------------------------------------
test("demand bands by price, and the $1.26 gap keeps yesterday's", () => {
  const prev = [11, 22, 33, 44];
  assert.deepStrictEqual(E.selectCoefficients(prev, 12), [80, 90, 100, 100]);
  assert.deepStrictEqual(E.selectCoefficients(prev, 13), [70, 80, 90, 100]);
  assert.deepStrictEqual(E.selectCoefficients(prev, 125), [40, 50, 60, 70]);
  assert.deepStrictEqual(E.selectCoefficients(prev, 126), prev);
  assert.deepStrictEqual(E.selectCoefficients(prev, 127), [20, 30, 40, 50]);
  assert.deepStrictEqual(E.selectCoefficients(prev, 201), [0, 0, 0, 0]);
});
test("jitter: +1..10 hundredths capped at 100; none above $2.00", () => {
  const rng = E.createRng(3);
  for (let i = 0; i < 1000; i++) {
    const j = E.applyJitter([95, 50, 0, 100], 50, rng);
    assert.ok(j[0] >= 96 && j[0] <= 100 && j[1] >= 51 && j[1] <= 60 && j[3] === 100);
    assert.deepStrictEqual(E.applyJitter([0, 0, 0, 0], 201, rng), [0, 0, 0, 0]);
  }
});
test("temperature bands: 70-79, 80-89, 90-95, 96+", () => {
  assert.deepStrictEqual([71, 79, 80, 89, 90, 95, 96, 105].map(E.temperatureBandIndex), [0, 0, 1, 1, 2, 2, 3, 3]);
});

// --- a day ------------------------------------------------------------------------------------
test("economics: cost on glasses made, sales on glasses sold", () => {
  const s0 = E.startRun(5);
  const s1 = E.advanceDay(s0, { glassesMade: 20, priceCents: 10 });
  const o = s1.history[0];
  assert.strictEqual(o.totalCostCents, 20 * s0.costPerGlassCents);
  assert.strictEqual(o.totalSalesCents, o.glassesSold * 10);
  assert.strictEqual(s1.cashCents, s0.cashCents + o.totalSalesCents - o.totalCostCents);
  assert.strictEqual(s1.day, 2);
});
test("a rained-out day sells nothing but still bills the batch", () => {
  for (let seed = 0; seed < 5000; seed++) {
    const s = E.startRun(seed);
    if (s.pendingWeather.chanceOfRain < 60) continue;
    const n = Math.min(10, E.maxAffordableGlasses(s));
    const o = E.advanceDay(s, { glassesMade: n, priceCents: 10 }).history[0];
    if (!o.rained) continue;
    assert.strictEqual(o.glassesSold, 0);
    assert.strictEqual(o.profitCents, -n * s.costPerGlassCents);
    return;
  }
  throw new Error("no rained-out day found");
});
test("a season lasts its configured length; finished state is inert", () => {
  let s = E.startRun(1, 7);
  for (let i = 0; i < 7 && !s.finished; i++) s = E.advanceDay(s, { glassesMade: 0, priceCents: 0 });
  assert.ok(s.finished);
  assert.strictEqual(E.advanceDay(s, { glassesMade: 0, priceCents: 0 }), s);
});
test("going bust ends the season early", () => {
  let s = E.startRun(1);
  s = E.advanceDay(s, { glassesMade: E.maxAffordableGlasses(s), priceCents: 20000 });   // sells nothing
  assert.ok(s.finished && E.wentBust(s));
});

// --- Math.imul fallback (SpiderMonkey 1.8.5 has none) ----------------------------------------
test("engine without Math.imul gives identical results", () => {
  const src = fs.readFileSync(ENGINE, "utf8");
  const noImulMath = Object.create(Math); noImulMath.imul = undefined;
  const ctx = vm.createContext({ Math: noImulMath, module: { exports: {} } });
  vm.runInContext(src, ctx);
  const E2 = ctx.module.exports;
  for (const run of golden.slice(0, 10)) {
    let s = E2.startRun(run.seed, 30);
    for (const d of run.decisions) s = E2.advanceDay(s, d);
    assert.strictEqual(JSON.stringify(s.history), JSON.stringify(run.history));
  }
});

// --- door rules ---------------------------------------------------------------------------------
test("plays per day: counted per calendar day, unlimited when <= 0", () => {
  let r = {};
  assert.strictEqual(E.playsLeft(r, "2026-10-11", 3), 3);
  r = E.usePlay(r, "2026-10-11"); r = E.usePlay(r, "2026-10-11");
  assert.strictEqual(E.playsLeft(r, "2026-10-11", 3), 1);
  r = E.usePlay(r, "2026-10-11");
  assert.strictEqual(E.playsLeft(r, "2026-10-11", 3), 0);
  assert.strictEqual(E.playsLeft(r, "2026-10-12", 3), 3);                   // a new day
  assert.strictEqual(E.usePlay(r, "2026-10-12").playsUsed, 1);
  assert.strictEqual(E.playsLeft(r, "2026-10-12", 0), Infinity);
});
test("top ten: sorted by cash, ties keep the earlier, capped, rank reported", () => {
  let scores = [];
  for (const c of [500, 900, 100]) scores = E.addScore(scores, { name: "p" + c, cashCents: c }).scores;
  assert.deepStrictEqual(scores.map(s => s.cashCents), [900, 500, 100]);
  const tie = E.addScore(scores, { name: "tie", cashCents: 500 });
  assert.strictEqual(tie.rank, 3);
  let full = [];
  for (let i = 10; i >= 1; i--) full = E.addScore(full, { name: "x", cashCents: i * 100 }).scores;
  const low = E.addScore(full, { name: "low", cashCents: 50 });
  assert.strictEqual(low.rank, 0); assert.strictEqual(low.scores.length, 10);
  const top = E.addScore(full, { name: "top", cashCents: 5000 });
  assert.strictEqual(top.rank, 1); assert.strictEqual(top.scores[0].name, "top"); assert.strictEqual(top.scores.length, 10);
});
test("money formatting", () => {
  assert.strictEqual(E.formatCents(0), "$0.00");
  assert.strictEqual(E.formatCents(5), "$0.05");
  assert.strictEqual(E.formatCents(-1234), "-$12.34");
  assert.strictEqual(E.formatCents(123456789), "$1,234,567.89");
});
test("engine is ES5: no let/const/arrows/template strings", () => {
  const src = fs.readFileSync(ENGINE, "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/\b(let|const)\s/.test(src), "let/const");
  assert.ok(!/=>/.test(src), "arrow");
  assert.ok(!/`/.test(src), "template string");
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
