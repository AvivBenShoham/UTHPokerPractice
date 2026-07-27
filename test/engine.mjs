// ============================================================================
// UTH Poker Outs Engine — pure-logic MIRROR of the evaluator & out-counter
// embedded in src/UTHOutsTrainer.jsx, extracted here (no React/JSX) so the
// algorithm can be verified from Node via `npm test`. The shipped component is
// the single self-contained deliverable; keep this file in sync with it.
// ============================================================================

export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J 12=Q 13=K 14=A
export const SUITS = ["s", "h", "d", "c"];
export const RANK_LABEL = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};
export const RANK_NAME = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
  8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};
export const RANK_PLURAL = {
  2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens",
  8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces",
};

export const cardId = (c) => `${c.r}${c.s}`;
export const makeDeck = () => {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push({ r, s });
  return d;
};

// --- Category constants (higher = better) ------------------------------------
export const CAT = {
  HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
};
export const CAT_NAME = {
  0: "High Card", 1: "Pair", 2: "Two Pair", 3: "Three of a Kind",
  4: "Straight", 5: "Flush", 6: "Full House", 7: "Four of a Kind",
  8: "Straight Flush",
};

// ----------------------------------------------------------------------------
// Evaluate exactly five cards -> comparable score array [category, ...tiebreak]
// Larger array (lexicographic) = stronger hand.
// ----------------------------------------------------------------------------
export function score5(cards) {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const isFlush = suits.every((s) => s === suits[0]);

  // rank counts
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  // sort ranks by (count desc, rank desc)
  const byCount = Object.keys(counts)
    .map(Number)
    .sort((a, b) => counts[b] - counts[a] || b - a);

  // straight detection (Ace high or wheel A-2-3-4-5)
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5; // wheel
  }

  if (isFlush && straightHigh) return [CAT.STRAIGHT_FLUSH, straightHigh];
  if (counts[byCount[0]] === 4) return [CAT.QUADS, byCount[0], byCount[1]];
  if (counts[byCount[0]] === 3 && counts[byCount[1]] === 2)
    return [CAT.FULL_HOUSE, byCount[0], byCount[1]];
  if (isFlush) return [CAT.FLUSH, ...ranks];
  if (straightHigh) return [CAT.STRAIGHT, straightHigh];
  if (counts[byCount[0]] === 3) return [CAT.TRIPS, byCount[0], byCount[1], byCount[2]];
  if (counts[byCount[0]] === 2 && counts[byCount[1]] === 2)
    return [CAT.TWO_PAIR, byCount[0], byCount[1], byCount[2]];
  if (counts[byCount[0]] === 2) return [CAT.PAIR, byCount[0], byCount[1], byCount[2], byCount[3]];
  return [CAT.HIGH, ...ranks];
}

export function cmpScore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? -1;
    const y = b[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

// Best 5-card score from N cards (N>=5). Iterate all C(N,5) combos.
export function bestScore(cards) {
  const n = cards.length;
  if (n < 5) throw new Error("need >=5 cards");
  let best = null;
  const idx = [0, 1, 2, 3, 4];
  const pick = () => idx.map((i) => cards[i]);
  const consider = () => {
    const s = score5(pick());
    if (!best || cmpScore(s, best) > 0) best = s;
  };
  // simple combination iterator
  const comb = (start, depth, chosen) => {
    if (chosen.length === 5) {
      const s = score5(chosen);
      if (!best || cmpScore(s, best) > 0) best = s;
      return;
    }
    for (let i = start; i < n; i++) comb(i + 1, depth + 1, [...chosen, cards[i]]);
  };
  comb(0, 0, []);
  return best;
}

// ----------------------------------------------------------------------------
// Human-readable label for a score array.
// ----------------------------------------------------------------------------
export function describeScore(s) {
  const cat = s[0];
  switch (cat) {
    case CAT.STRAIGHT_FLUSH:
      return s[1] === 5 ? "Straight Flush (5 high, the wheel)" : `Straight Flush, ${RANK_NAME[s[1]]} high`;
    case CAT.QUADS:
      return `Four of a Kind, ${RANK_PLURAL[s[1]]}`;
    case CAT.FULL_HOUSE:
      return `Full House, ${RANK_PLURAL[s[1]]} full of ${RANK_PLURAL[s[2]]}`;
    case CAT.FLUSH:
      return `Flush, ${RANK_NAME[s[1]]} high`;
    case CAT.STRAIGHT:
      return s[1] === 5 ? "Straight, Five high (the wheel)" : `Straight, ${RANK_NAME[s[1]]} high`;
    case CAT.TRIPS:
      return `Three of a Kind, ${RANK_PLURAL[s[1]]}`;
    case CAT.TWO_PAIR:
      return `Two Pair, ${RANK_PLURAL[s[1]]} and ${RANK_PLURAL[s[2]]}`;
    case CAT.PAIR:
      return `Pair of ${RANK_PLURAL[s[1]]}, ${RANK_NAME[s[2]]} kicker`;
    default:
      return `${RANK_NAME[s[1]]}-high`;
  }
}

// ----------------------------------------------------------------------------
// OUT-COUNTING CONVENTION  (documented precisely)
//
// The UNIT is a single unseen card, counted exactly the way a player counts at
// the table for the Ultimate Texas Hold'em river "21 rule": how many of the 45
// unseen cards give the DEALER a hand that beats the player's made hand.
//
// Unseen cards = 52 - 2 player hole - 5 board = 45.
//
// A single unseen card c is a DEALER OUT when the dealer's best 5-card hand
// drawn from {c} + the 5 board cards STRICTLY beats the player's best 5-card
// hand. Evaluated exactly this reproduces the published rule's categories:
//   - PAIR THE BOARD: c pairs a board rank into a pair/two pair/trips/boat/
//     quads that beats the player (3 per board rank if the player holds none).
//   - OUT-KICK OVERCARD: when the player only plays the board (no made pair), a
//     live higher card lifts the dealer's high-card hand above the player (all
//     4 of that rank) — e.g. board A K T 7 2, the J and Q each out-kick you.
//   - FLUSH / STRAIGHT FILL: a lone card completing a flush (4 of a suit on the
//     board) or a straight (board already 4-to-a-straight).
//
// Dealer POCKET PAIRS are NOT counted as separate outs: a pocket pair is a
// TWO-card holding, and the published 21-rule counts cards that pair the board
// or out-kick you, not the four cards of an over-rank as four pocket "outs".
//
// No card is ever counted twice (results accumulate in a Set). A lone card
// cannot complete a 3-flush, so a 3-suited board contributes 0 flush outs.
//
// DECISION RULE:  21 or more dealer outs  -> FOLD ;  20 or fewer -> BET 1x.
// (Ultimate Texas Hold'em river "21 outs" rule.)
// ----------------------------------------------------------------------------
export function countOuts(hole, board) {
  const used = new Set([...hole, ...board].map(cardId));
  const deck = makeDeck().filter((c) => !used.has(cardId(c)));
  const unseen = deck; // 45 cards
  const playerScore = bestScore([...hole, ...board]);
  const boardRanks = new Set(board.map((c) => c.r));

  const outCards = new Set();
  const groups = new Map(); // label -> count
  const bump = (label, n = 1) => groups.set(label, (groups.get(label) || 0) + n);

  // A single card is an out iff its best 5 with the board beats the player.
  for (const c of unseen) {
    const ds = bestScore([c, ...board]);
    if (cmpScore(ds, playerScore) > 0) {
      outCards.add(cardId(c));
      // classify the reason (what the dealer's hand became)
      const cat = ds[0];
      if (cat === CAT.FLUSH || cat === CAT.STRAIGHT_FLUSH) bump("Flush completions");
      else if (cat === CAT.STRAIGHT) bump("Straight completions");
      else if (boardRanks.has(c.r)) bump(`Pair the ${RANK_LABEL[c.r]}`);
      else bump(`Out-kick ${RANK_LABEL[c.r]}`);
    }
  }

  // Build ordered breakdown.
  const breakdown = [...groups.entries()].map(([label, count]) => ({ label, count }));

  return {
    total: outCards.size,
    playerScore,
    playerLabel: describeScore(playerScore),
    breakdown,
    fold: outCards.size >= 21,
  };
}
