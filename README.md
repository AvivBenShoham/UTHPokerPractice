# UTH Outs Trainer — the river "21 rule"

A poker-table trainer for the **Ultimate Texas Hold'em** river decision. You are
dealt (or you enter) a legal 7-card scenario, estimate how many of the 45 unseen
cards give the **dealer** a hand that beats yours, and get scored against an
exact, single-card out count.

> **The unit is OUTS, not probability.** You guess a count of single beating
> cards, so the app's authoritative answer is also a single-card out count,
> computed the same way you count at the table — never a 990-combination
> win-probability.

**Decision rule:** `21 or more dealer outs → FOLD` · `20 or fewer → BET 1×`.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
npm test         # verify the poker engine (36 assertions)
```

The entire app is a **single self-contained React component**:
[`src/UTHOutsTrainer.jsx`](src/UTHOutsTrainer.jsx). It contains an exact hand
evaluator, the out-counting logic, all styling, and the full poker-table UI —
the only import is React. Drop it into any React app.

## Modes

- **Practice** — random legal hands. Study the board, tap your out estimate on
  the felt number pad, lock it in, and get scored. A stats panel tracks rounds,
  exact/close/off buckets, decision-side accuracy, average error, streak, and
  points (all in memory; Reset clears them).
- **Manual** — build any specific 2 hole + 5 board scenario from the card
  palette (or hit Random) and analyze the exact out count and breakdown.

## Scoring

Each guess is graded two ways:

- **Magnitude** — Exact (`guess == true`), Close (within ±2), or Off (> ±2).
- **Correct side of 21** — did your guess and the truth land on the same side of
  the 21 threshold? **This is the headline result.** A small numeric miss that
  keeps the same bet/fold call is a minor error; a miss that flips the verdict is
  the costly one. Points and streak are awarded for landing on the correct side,
  with a bonus for exact/close counts.

Every result shows your evaluated hand, the resulting action (BET 1× / FOLD),
and a **grouped breakdown of where the true outs come from** (Pair the K: 3,
Flush completions: 0, …) — the teaching tool that shows exactly where you
over- or under-counted.

## Out-counting convention (stated precisely)

Unseen cards = `52 − 2 hole − 5 board = 45`. A single unseen card `c` is a
**dealer out** when the dealer's best 5-card hand drawn from `{c} + the 5 board
cards` **strictly beats** the player's best 5-card hand. Evaluated with the
exact poker evaluator, that single-card definition reproduces the published
rule's categories:

- **Pair the board** — `c` pairs a board rank into a pair/two pair/trips/full
  house/quads that beats the player (3 cards per board rank when the player
  holds none of it).
- **Out-kick overcard** — when the player only plays the board (no made pair),
  a live higher card lifts the dealer's high-card hand above the player (all 4
  cards of that rank). For example, on board `A K T 7 2` against a `A K T 9 8`
  player, only the J and Q out-kick: 2 ranks × 4 = **8** outs.
- **Flush / straight fill** — a lone card completing a flush (4 of a suit
  already on the board) or a straight (board already 4-to-a-straight). A lone
  card cannot complete a 3-flush, so a 3-suited board yields 0 single-card
  flush outs.

**Dealer pocket pairs are *not* counted as separate outs.** A pocket pair is a
*two-card* holding, not single-card outs; counting the four cards of an
over-rank as four "pocket outs" badly overcounts a two-card event. The published
UTH 21-rule counts cards that pair the board or out-kick you, and folds the
pocket-pair case into the separate "if you already hold a hidden pair or better,
just bet" branch. (This is corrected from an earlier version that counted pocket
pairs by rank — the fix drops the average random-deal fold rate from ~65% to a
realistic ~20%.)

No card is ever counted twice, so the grouped breakdown always sums to the
total. The exact same convention is documented in a comment block at the top of
`countOuts` in the component and mirrored, with its test suite, in
[`test/engine.mjs`](test/engine.mjs).

## Correctness

The hand evaluator is exact — full houses, quads, flushes, straights including
the wheel (A-2-3-4-5), and board-plays-the-hand cases all fall out of the
general logic. `npm test` runs 41 assertions covering category detection, hand
ordering, kicker resolution, best-of-7 selection, and hand-specific out counts —
including the published Wizard-of-Odds example (board `A K T 7 2` vs `A K T 9 8`
= 23 outs, J/Q out-kick = 8), the nuts = 0 outs, a Queen-high board flush =
exactly the 7 higher clubs, and that pocket pairs never appear as outs — plus a
5,000-deal invariant check that the breakdown always sums to the total.
