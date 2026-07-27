import {
  score5, bestScore, cmpScore, describeScore, countOuts, CAT, makeDeck, cardId,
} from "./engine.mjs";

let pass = 0, fail = 0;
const C = (str) => {
  // "As" "Td" "9h" "10c"(->Tc)  use two-char: rank+suit, rank in A K Q J T 9..2
  const map = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  const s = str.slice(-1);
  const rp = str.slice(0, -1);
  const r = map[rp] ?? Number(rp);
  return { r, s };
};
const H = (s) => s.trim().split(/\s+/).map(C);
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const assert = (name, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL ${name}`); } };

// ---- evaluator category tests ----
eq("straight flush", score5(H("9s 8s 7s 6s 5s"))[0], CAT.STRAIGHT_FLUSH);
eq("wheel sf", score5(H("As 2s 3s 4s 5s")), [CAT.STRAIGHT_FLUSH, 5]);
eq("quads", score5(H("9s 9h 9d 9c 2s"))[0], CAT.QUADS);
eq("full house", score5(H("9s 9h 9d 2c 2s")), [CAT.FULL_HOUSE, 9, 2]);
eq("flush", score5(H("As Js 8s 5s 2s"))[0], CAT.FLUSH);
eq("straight", score5(H("9s 8h 7d 6c 5s")), [CAT.STRAIGHT, 9]);
eq("wheel straight", score5(H("As 2h 3d 4c 5s")), [CAT.STRAIGHT, 5]);
eq("broadway", score5(H("As Kh Qd Jc Ts")), [CAT.STRAIGHT, 14]);
eq("trips", score5(H("9s 9h 9d Kc 2s")), [CAT.TRIPS, 9, 13, 2]);
eq("two pair", score5(H("9s 9h 2d 2c As")), [CAT.TWO_PAIR, 9, 2, 14]);
eq("pair", score5(H("9s 9h Ad Kc 2s")), [CAT.PAIR, 9, 14, 13, 2]);
eq("high", score5(H("As Kh 9d 7c 2s")), [CAT.HIGH, 14, 13, 9, 7, 2]);

// ordering: quads>full house>flush>straight>trips
assert("quads>fh", cmpScore(score5(H("9s 9h 9d 9c 2s")), score5(H("9s 9h 9d 2c 2s"))) > 0);
assert("fh>flush", cmpScore(score5(H("9s 9h 9d 2c 2s")), score5(H("As Js 8s 5s 2s"))) > 0);
assert("flush>straight", cmpScore(score5(H("As Js 8s 5s 2s")), score5(H("9s 8h 7d 6c 5s"))) > 0);
assert("straight>trips", cmpScore(score5(H("9s 8h 7d 6c 5s")), score5(H("9s 9h 9d Kc 2s"))) > 0);
assert("pairAces>pairKings", cmpScore(score5(H("As Ah 2d 3c 4s")), score5(H("Ks Kh 2d 3c 4s"))) > 0);
assert("kicker matters", cmpScore(score5(H("As Ah Kd 3c 4s")), score5(H("As Ah Qd 3c 4s"))) > 0);

// ---- bestScore from 7 cards ----
eq("best7 finds flush", bestScore(H("As Js 8s 5s 2s 9h Kd"))[0], CAT.FLUSH);
eq("best7 board plays straight", bestScore(H("2h 3d 9s Ts Jc Qd Kh"))[0], CAT.STRAIGHT); // 9TJQK

// ---- describe ----
eq("describe pair", describeScore(score5(H("9s 9h Ad Kc 2s"))), "Pair of Nines, Ace kicker");
eq("describe two pair", describeScore(score5(H("Ks Kh 9d 9c 2s"))), "Two Pair, Kings and Nines");

// ---- OUT COUNTING scenarios ----

// Scenario 1: Player pocket 99, board K Q 7 4 2 rainbow.
// Player has a hidden pair (99); pocket pairs are NOT counted as outs.
// pairing K->pair Ks beats 99 (3); pairing Q->pair Qs beats (3); pairing 7,4,2 no.
// out-kick overcards: player holds a PAIR, so a lone card that doesn't pair the
// board makes only a high card < pair -> not an out. No flush/straight.
// total = 3+3 = 6 -> BET
{
  const hole = H("9s 9h"), board = H("Ks Qh 7d 4c 2s");
  const r = countOuts(hole, board);
  eq("S1 total", r.total, 6);
  assert("S1 bet", r.fold === false);
  assert("S1 no pockets", !r.breakdown.some((b) => /pocket/i.test(b.label)));
  assert("S1 playerLabel", r.playerLabel.startsWith("Pair of Nines"));
}

// Scenario 2: Player weak pair 4s, board A K 9 4 2 (player holds 4d + 7c blank).
// Player best = pair of 4s with A K 9 kickers.
// pair A(3), K(3), 9(3) beat the pair of 4s; pair 4 -> dealer pair of 4s with the
// same A K 9 kickers = a TIE, not a strict beat -> 0; pair 2 < 4s -> 0.
// A lone overcard makes only a high card < pair of 4s -> no out-kick outs. No
// flush/straight. Pocket pairs are not counted. total = 3+3+3 = 9 -> BET
// (matches the published rule: a hidden pair just bets).
{
  const hole = H("4d 7c"), board = H("As Kh 9d 4c 2s");
  const r = countOuts(hole, board);
  eq("S2 total", r.total, 9);
  assert("S2 bet", r.fold === false);
  assert("S2 no pockets", !r.breakdown.some((b) => /pocket/i.test(b.label)));
  assert("S2 pair4s", r.playerLabel.startsWith("Pair of Fours"));
}

// Scenario 2b: the published Wizard-of-Odds example. Board A K T 7 2, player
// holds 9 8 (best five = A K T 9 8, no made pair). Any board pair beats the
// player: A,K,T,7,2 -> 3 each = 15. With A K T 9 8, only the J and Q out-kick
// (all 4 each -> 8); 3,4,5,6,8,9 do not. No flush/straight, no pockets.
// total = 15 + 8 = 23 -> FOLD, exactly as published.
{
  const hole = H("9s 8d"), board = H("Ah Kd Ts 7c 2h");
  const r = countOuts(hole, board);
  eq("S2b total (published 23)", r.total, 23);
  const outkick = r.breakdown.filter((b) => /Out-kick/.test(b.label)).reduce((a, b) => a + b.count, 0);
  eq("S2b out-kick outs (J,Q x4)", outkick, 8);
  assert("S2b fold", r.fold === true);
}

// Scenario 3: The nuts — player has a straight flush, zero outs.
{
  const hole = H("As Ks"), board = H("Qs Js Ts 2h 3d");
  const r = countOuts(hole, board);
  eq("S3 nut outs", r.total, 0);
  assert("S3 bet", r.fold === false);
  assert("S3 royal", r.playerScore[0] === CAT.STRAIGHT_FLUSH);
}

// Scenario 4: Player no pair, plays the board almost. hole 3d 2c, board As Kh Qd 7c 4s.
// player best = A K Q 7 4 high. Many cards beat: any board pair (A,K,Q,7,4 -> 3 each=15)
// plus out-kick overcards J/T/9/8/6/5 that raise a kicker above 4 or 7
// (single J -> A K Q J 7 beats A K Q 7 4). -> well over 21 -> FOLD.
{
  const hole = H("3d 2c"), board = H("As Kh Qd 7c 4s");
  const r = countOuts(hole, board);
  assert("S4 fold", r.fold === true);
}

// Scenario 5: flush completion single-card. Board 4 spades + 1 off. player holds no spade high.
// board: Ks Qs 7s 3s 8h. player hole: Ad 2c -> player best? board has 4 spades, player has none ->
// player best = 4-flush? no, needs 5. player best = high card among Ks Qs 7s 8h Ad? Actually 4 spades
// on board, player has Ad2c (no spade) -> player cannot make flush. player best = A K Q 8 7 high.
// Dealer: ANY spade completes a flush (9 spades unseen: 13-4=9, minus none in player hole) -> flush beats A-high.
// Also non-spade pairs/overcards.
{
  const hole = H("Ad 2c"), board = H("Ks Qs 7s 3s 8h");
  const r = countOuts(hole, board);
  const flush = r.breakdown.find((b) => b.label === "Flush completions");
  assert("S5 has flush outs", flush && flush.count === 9);
  assert("S5 fold-ish", r.fold === true); // lots of outs
}

// Scenario 6: straight completion single card. board 4-to-straight 9 T J Q (+ blank), player weak.
// board: 9s Th Jd Qc 2s. player hole 3d 4c -> player best = Q J T 9 + ... needs 8 or K for straight;
// player has none -> player best = Q J T 9 4? high card Q high actually with 2 -> Q J T 9 4. Hmm
// Actually board 9 T J Q + 2 and player 3,4: best5 = Q J T 9 4 (no straight). Dealer with a K -> K Q J T 9
// straight, or with an 8 -> Q J T 9 8 straight. Both beat player high card.
{
  const hole = H("3d 4c"), board = H("9s Th Jd Qc 2s");
  const r = countOuts(hole, board);
  const st = r.breakdown.find((b) => b.label === "Straight completions");
  assert("S6 has straight outs", st && st.count > 0);
}

// Determinism / range check across many random deals: total in [0,45], breakdown sums to total.
{
  let ok = true;
  for (let i = 0; i < 5000; i++) {
    const deck = makeDeck();
    for (let j = deck.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [deck[j], deck[k]] = [deck[k], deck[j]]; }
    const hole = deck.slice(0, 2), board = deck.slice(2, 7);
    const r = countOuts(hole, board);
    const sum = r.breakdown.reduce((a, b) => a + b.count, 0);
    if (r.total < 0 || r.total > 45 || sum !== r.total) { ok = false; console.log("range/sum fail", r); break; }
  }
  assert("random range+sum", ok);
}

// Distribution sanity: fold rate should be a minority (UTH folds are relatively rare-ish)
{
  let folds = 0, N = 20000, sumOuts = 0;
  for (let i = 0; i < N; i++) {
    const deck = makeDeck();
    for (let j = deck.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [deck[j], deck[k]] = [deck[k], deck[j]]; }
    const r = countOuts(deck.slice(0, 2), deck.slice(2, 7));
    if (r.fold) folds++;
    sumOuts += r.total;
  }
  console.log(`\nfold rate over ${N} random deals: ${(100 * folds / N).toFixed(1)}%  avg outs: ${(sumOuts / N).toFixed(1)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
