// lemonade_engine.js -- the game behind The Bean Board's native Lemonade Stand.
//
// A port to ES5 JavaScript (Synchronet's SpiderMonkey has no let/const/arrow
// functions or Math.imul) of the engine in joeyparrish/lemonade
// (https://github.com/joeyparrish/lemonade), which recreates T&J Software's
// Lemonade v4.20 BBS door from formulas recovered out of the original binary.
// That project is licensed under the Apache License 2.0, as is this one; see
// LICENSE.md and NOTICE. Changes from it: ES5
// syntax, a configurable season length, and the door rules at the bottom
// (daily play allowance, top ten), which are this port's own.
//
// Pure and deterministic: no clock, no global random source, no I/O. State is
// plain JSON, so a game saves and resumes exactly. Loadable both by
// Synchronet (load("lemonade_engine.js") returns the API) and by node
// (require) for the unit tests.

"use strict";

var LemonadeEngine = (function () {

var STARTING_CASH_CENTS = 100;          // $1.00
var STARTING_COST_CENTS = 2;            // $0.02
var MAX_GLASSES_PER_DAY = 60000;
var MAX_PRICE_CENTS = 20000;            // $200.00
var SEASON_DAYS = 30;                   // default run length (sysop configurable)
var COST_EVENT_CEILING_CENTS = 12;      // news events stop once cost reaches $0.12

var TEMPERATURE_BAND_EDGES = [70, 80, 90, 96];  // lower inclusive edges

// Base demand by price band and temperature band, in hundredths. Note the
// original's gap: the fifth band ends at 125 and the sixth starts above 126,
// so a price of exactly 126 cents matches nothing and keeps the previous
// day's coefficients (faithful, not a bug).
var PRICE_BANDS = [
	{ above: -1,  through: 12,  c: [80, 90, 100, 100] },
	{ above: 12,  through: 25,  c: [70, 80, 90, 100] },
	{ above: 25,  through: 50,  c: [60, 70, 80, 90] },
	{ above: 50,  through: 75,  c: [50, 60, 70, 80] },
	{ above: 75,  through: 125, c: [40, 50, 60, 70] },
	{ above: 126, through: 150, c: [20, 30, 40, 50] },
	{ above: 150, through: 200, c: [10, 20, 30, 40] },
	{ above: 200, through: MAX_PRICE_CENTS, c: [0, 0, 0, 0] }
];

// News events: roll 1-100.
var EVENT_BANDS = [
	{ through: 10, event: "sugar",  increase: 2 },
	{ through: 20, event: "lemons", increase: 3 },
	{ through: 25, event: "cups",   increase: 4 }
];

// --- randomness: mulberry32, seeded -----------------------------------------
function imul(a, b) {
	if (typeof Math.imul === "function")
		return Math.imul(a, b);
	var ah = (a >>> 16) & 0xffff, al = a & 0xffff;
	var bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
	return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
}

function createRng(seed) {
	var state = seed >>> 0;
	function next() {
		state = (state + 0x6d2b79f5) >>> 0;
		var t = state;
		t = imul(t ^ (t >>> 15), t | 1);
		t ^= t + imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
	return {
		next: next,
		nextInt: function (max) { return Math.floor(next() * max) + 1; }  // INT(RND * n + 1)
	};
}

// --- the day's pieces -------------------------------------------------------
function rollNewsEvent(costCents, rng) {
	if (costCents >= COST_EVENT_CEILING_CENTS)
		return { cost: costCents, event: null };
	var roll = rng.nextInt(100);
	for (var i = 0; i < EVENT_BANDS.length; i++)
		if (roll <= EVENT_BANDS[i].through)
			return { cost: costCents + EVENT_BANDS[i].increase, event: EVENT_BANDS[i].event };
	return { cost: costCents, event: null };
}

function generateWeather(rng) {
	var rainRoll = rng.nextInt(100);
	var chanceOfRain = rainRoll < 70 ? rainRoll : 0;       // ~a third of days are dry
	var temperatureF = 70 + rng.nextInt(35);               // 71 to 105
	return { temperatureF: temperatureF, chanceOfRain: chanceOfRain };
}

function resolveRain(chanceOfRain, rng) {
	if (chanceOfRain === 0)
		return false;
	return rng.nextInt(100) <= chanceOfRain;
}

function selectCoefficients(previous, priceCents) {
	for (var i = 0; i < PRICE_BANDS.length; i++)
		if (priceCents > PRICE_BANDS[i].above && priceCents <= PRICE_BANDS[i].through)
			return PRICE_BANDS[i].c.slice();
	return previous.slice();
}

function applyJitter(coefficients, priceCents, rng) {
	var roll = rng.nextInt(10);                            // drawn whatever the price
	var jitter = priceCents > 200 ? 0 : roll;
	var out = [];
	for (var i = 0; i < 4; i++)
		out.push(Math.min(coefficients[i] + jitter, 100));
	return out;
}

function temperatureBandIndex(temperatureF) {
	var index = 0;
	for (var i = 0; i < TEMPERATURE_BAND_EDGES.length; i++)
		if (temperatureF >= TEMPERATURE_BAND_EDGES[i])
			index = i;
	return index;
}

function glassesSold(glassesMade, coefficientHundredths) {
	return Math.floor((glassesMade * coefficientHundredths) / 100);
}

// Two independent generators per day, both derived from the run seed, so
// state stays plain JSON and advanceDay stays pure.
function setupRngFor(seed, day) { return createRng((seed ^ imul(day, 0x9e3779b1)) >>> 0); }
function resolveRngFor(seed, day) { return createRng((seed ^ imul(day, 0x85ebca6b) ^ 0x5bf03635) >>> 0); }

// --- the game ---------------------------------------------------------------
function startRun(seed, seasonDays) {
	var setup = setupRngFor(seed, 1);
	var news = rollNewsEvent(STARTING_COST_CENTS, setup);
	return {
		seed: seed >>> 0,
		seasonDays: seasonDays || SEASON_DAYS,
		day: 1,
		cashCents: STARTING_CASH_CENTS,
		costPerGlassCents: news.cost,
		coefficients: [0, 0, 0, 0],
		pendingWeather: generateWeather(setup),
		pendingEvent: news.event,
		history: [],
		finished: false
	};
}

function maxAffordableGlasses(state) {
	var affordable = Math.floor(state.cashCents / state.costPerGlassCents);
	return Math.max(0, Math.min(affordable, MAX_GLASSES_PER_DAY));
}

function isWhole(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }

function validateDecision(state, decision) {
	if (!isWhole(decision.glassesMade) || decision.glassesMade < 0)
		return "Glasses must be a whole number, zero or more.";
	if (!isWhole(decision.priceCents) || decision.priceCents < 0)
		return "Price must be a whole number of cents, zero or more.";
	if (decision.glassesMade > maxAffordableGlasses(state))
		return "You can only afford " + maxAffordableGlasses(state) + " glasses.";
	if (decision.priceCents > MAX_PRICE_CENTS)
		return "Price cannot exceed " + MAX_PRICE_CENTS + " cents.";
	return null;
}

function advanceDay(state, decision) {
	if (state.finished)
		return state;
	var seasonDays = state.seasonDays || SEASON_DAYS;
	var rng = resolveRngFor(state.seed, state.day);
	var weather = state.pendingWeather;
	var rained = resolveRain(weather.chanceOfRain, rng);

	var base = selectCoefficients(state.coefficients, decision.priceCents);
	var coefficients = applyJitter(base, decision.priceCents, rng);
	var band = temperatureBandIndex(weather.temperatureF);
	var sold = rained ? 0 : glassesSold(decision.glassesMade, coefficients[band]);

	var totalCost = decision.glassesMade * state.costPerGlassCents;
	var totalSales = sold * decision.priceCents;
	var profit = totalSales - totalCost;
	var cash = state.cashCents + profit;

	var outcome = {
		day: state.day,
		weather: weather,
		rained: rained,
		event: state.pendingEvent,
		costPerGlassCents: state.costPerGlassCents,
		glassesMade: decision.glassesMade,
		priceCents: decision.priceCents,
		glassesSold: sold,
		totalCostCents: totalCost,
		totalSalesCents: totalSales,
		profitCents: profit,
		cashCents: cash
	};

	var nextDay = state.day + 1;
	var seasonOver = nextDay > seasonDays;
	var setup = setupRngFor(state.seed, nextDay);
	var nextCost = rollNewsEvent(state.costPerGlassCents, setup);
	// The clone's addition: once cash won't cover one glass, the season ends.
	var bankrupt = !seasonOver && cash < nextCost.cost;
	var finished = seasonOver || bankrupt;

	return {
		seed: state.seed,
		seasonDays: seasonDays,
		day: nextDay,
		cashCents: cash,
		costPerGlassCents: finished ? state.costPerGlassCents : nextCost.cost,
		coefficients: coefficients,     // the jittered ones persist, as in the original
		pendingWeather: finished ? weather : generateWeather(setup),
		pendingEvent: finished ? null : nextCost.event,
		history: state.history.concat([outcome]),
		finished: finished
	};
}

function wentBust(state) {
	return state.finished && state.history.length < (state.seasonDays || SEASON_DAYS);
}

// --- door rules (this port's own) ------------------------------------------------

// How many plays a caller has left today. A "play" is one visit in which they
// play at least one game day. playsPerDay <= 0 means unlimited.
function playsLeft(record, today, playsPerDay) {
	if (!playsPerDay || playsPerDay <= 0)
		return Infinity;
	var used = (record && record.playsDate === today) ? (record.playsUsed || 0) : 0;
	return Math.max(0, playsPerDay - used);
}

// Count one play for today (call once per visit, on the first day played).
function usePlay(record, today) {
	var r = record || {};
	if (r.playsDate !== today) {
		r.playsDate = today;
		r.playsUsed = 0;
	}
	r.playsUsed = (r.playsUsed || 0) + 1;
	return r;
}

// Insert a finished season into the top ten (highest cash first; ties keep
// the earlier score first). Returns { scores, rank } -- rank is 1-based, or
// 0 if it didn't place.
function addScore(scores, entry, size) {
	size = size || 10;
	var list = (scores || []).slice();
	var at = list.length;
	for (var i = 0; i < list.length; i++) {
		if (entry.cashCents > list[i].cashCents) { at = i; break; }
	}
	list.splice(at, 0, entry);
	list = list.slice(0, size);
	return { scores: list, rank: at < size ? at + 1 : 0 };
}

function formatCents(cents) {
	var neg = cents < 0;
	var c = Math.abs(cents);
	var dollars = Math.floor(c / 100).toString();
	dollars = dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	var rest = c % 100;
	return (neg ? "-$" : "$") + dollars + "." + (rest < 10 ? "0" : "") + rest;
}

return {
	STARTING_CASH_CENTS: STARTING_CASH_CENTS,
	STARTING_COST_CENTS: STARTING_COST_CENTS,
	MAX_GLASSES_PER_DAY: MAX_GLASSES_PER_DAY,
	MAX_PRICE_CENTS: MAX_PRICE_CENTS,
	SEASON_DAYS: SEASON_DAYS,
	COST_EVENT_CEILING_CENTS: COST_EVENT_CEILING_CENTS,
	PRICE_BANDS: PRICE_BANDS,
	createRng: createRng,
	rollNewsEvent: rollNewsEvent,
	generateWeather: generateWeather,
	resolveRain: resolveRain,
	selectCoefficients: selectCoefficients,
	applyJitter: applyJitter,
	temperatureBandIndex: temperatureBandIndex,
	glassesSold: glassesSold,
	startRun: startRun,
	maxAffordableGlasses: maxAffordableGlasses,
	validateDecision: validateDecision,
	advanceDay: advanceDay,
	wentBust: wentBust,
	playsLeft: playsLeft,
	usePlay: usePlay,
	addScore: addScore,
	formatCents: formatCents
};
})();

if (typeof module !== "undefined" && module.exports)
	module.exports = LemonadeEngine;
LemonadeEngine;   // Synchronet: load() returns the script's last value
