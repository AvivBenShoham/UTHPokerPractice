// MIRROR of the UTH full-game strategy + payout logic embedded in
// src/UTHOutsTrainer.jsx, kept here (no React) so `npm test` can verify it.
// UTH full-game strategy + payout logic (verified here, then embedded in the component)
import { score5, bestScore, cmpScore, CAT, countOuts } from "./engine.mjs";

// ---- Basic strategy (Wizard of Odds) --------------------------------------
// Preflop: raise 4x, else check. (3x is a legal bet but never optimal.)
export function preflopRaise4x(hole) {
  const hi = Math.max(hole[0].r, hole[1].r);
  const lo = Math.min(hole[0].r, hole[1].r);
  const suited = hole[0].s === hole[1].s;
  if (hi === lo) return hi >= 3;                 // pair of 3s or higher
  if (hi === 14) return true;                    // any ace
  if (hi === 13) return suited ? true : lo >= 5; // K: suited any, offsuit K5+
  if (hi === 12) return suited ? lo >= 6 : lo >= 8; // Q: suited Q6+, offsuit Q8+
  if (hi === 11) return suited ? lo >= 8 : lo >= 10; // J: suited J8+, offsuit JT
  return false;
}
// Flop (after checking preflop): raise 2x with two pair+, a hidden pair, or
// four to a flush with a hole card 10+ of that suit.
export function flopRaise2x(hole, flop) {
  const cards = [...hole, ...flop];
  const best = score5(cards);
  if (best[0] >= CAT.TWO_PAIR) return true;
  if (hole[0].r === hole[1].r) return true;            // pocket pair
  const boardRanks = flop.map((c) => c.r);
  if (hole.some((c) => boardRanks.includes(c.r))) return true; // hole pairs board
  const bySuit = {};
  for (const c of cards) (bySuit[c.s] = bySuit[c.s] || []).push(c);
  for (const s in bySuit) {
    if (bySuit[s].length >= 4 && hole.some((c) => c.s === s && c.r >= 10)) return true;
  }
  return false;
}
// River: bet 1x unless 21+ dealer outs (the rule already implemented).
export function riverFold(hole, board) {
  return countOuts(hole, board).fold;
}

// ---- Payouts ---------------------------------------------------------------
export function blindMult(score) {
  switch (score[0]) {
    case CAT.STRAIGHT_FLUSH: return score[1] === 14 ? 500 : 50;
    case CAT.QUADS: return 10;
    case CAT.FULL_HOUSE: return 3;
    case CAT.FLUSH: return 1.5;
    case CAT.STRAIGHT: return 1;
    default: return 0; // less than a straight -> blind pushes on a win
  }
}
// playMult: 4/3/2/1 for the play bet size; folded => lose ante+blind.
export function settle({ playerBest, dealerBest, ante, playMult, folded }) {
  if (folded) return { ante: -ante, blind: -ante, play: 0, net: -2 * ante, folded: true };
  const dealerQualifies = dealerBest[0] >= CAT.PAIR;
  const cmp = cmpScore(playerBest, dealerBest); // >0 player wins
  const play = cmp > 0 ? playMult * ante : cmp < 0 ? -playMult * ante : 0;
  const anteR = !dealerQualifies ? 0 : cmp > 0 ? ante : cmp < 0 ? -ante : 0;
  const blindR = cmp > 0 ? blindMult(playerBest) * ante : cmp < 0 ? -ante : 0;
  return { ante: anteR, blind: blindR, play, net: anteR + blindR + play, dealerQualifies, cmp, folded: false };
}
