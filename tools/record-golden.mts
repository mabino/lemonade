// Run from a checkout of joeyparrish/lemonade (see README): records golden
// runs from the original TypeScript engine for test/fixtures/golden.json.
import { startRun, advanceDay } from "./src/engine/game.ts";
// Deterministic decision script (no Math.random) so the fixture is reproducible.
function lcg(s: number) { return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296; }
const out: any[] = [];
const prices = [126, 0, 1, 12, 13, 25, 50, 75, 125, 150, 200, 201, 20000, 10, 30];
for (let g = 0; g < 40; g++) {
  const r = lcg(1000 + g);
  const seed = Math.floor(r() * 4294967296) >>> 0;
  let s = startRun(seed);
  const decisions: any[] = [];
  while (!s.finished) {
    const max = Math.min(60000, Math.floor(s.cashCents / s.costPerGlassCents));
    const d = { glassesMade: Math.floor(r() * (max + 1)), priceCents: prices[Math.floor(r() * prices.length)] };
    decisions.push(d); s = advanceDay(s, d);
  }
  out.push({ seed, decisions, history: s.history, finalCashCents: s.cashCents, days: s.history.length });
}
console.log(JSON.stringify(out));
