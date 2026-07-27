// ============================================================================
//  UTH Outs Trainer — a single, self-contained React component.
//
//  Ultimate Texas Hold'em RIVER "21-outs" trainer.  The player is dealt (or
//  enters) a legal 7-card scenario, estimates how many of the 45 unseen cards
//  give the DEALER a hand beating the player's, and is scored against an exact,
//  single-card out count.  21+ outs => FOLD, 20 or fewer => BET 1x.
//
//  Everything lives in this one file: an exact poker evaluator, the documented
//  out-counting convention, all styling, and the full poker-table UI. The only
//  import is React.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ===========================================================================
//  CARDS
// ===========================================================================
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J 12=Q 13=K 14=A
const SUITS = ["s", "h", "d", "c"];
const SUIT_GLYPH = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RED_SUITS = new Set(["h", "d"]);
const RANK_LABEL = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};
const RANK_NAME = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
  8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};
const RANK_PLURAL = {
  2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens",
  8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces",
};

const cardId = (c) => `${c.r}${c.s}`;
const makeDeck = () => {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push({ r, s });
  return d;
};

// ===========================================================================
//  EXACT HAND EVALUATOR
//  score5 returns a comparable array [category, ...tiebreakers]; compared
//  lexicographically a larger array = a stronger hand. No shortcuts: straights,
//  flushes, full houses, quads, the wheel (A-2-3-4-5), and board-plays cases
//  all fall out of the general logic.
// ===========================================================================
const CAT = {
  HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
};

function score5(cards) {
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const byCount = Object.keys(counts)
    .map(Number)
    .sort((a, b) => counts[b] - counts[a] || b - a);

  // straight (unique ranks), including the wheel A-2-3-4-5 (Ace low, high=5)
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5;
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

function cmpScore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? -1;
    const y = b[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

// Best 5-card score from N>=5 cards, checking every C(N,5) combination.
function bestScore(cards) {
  const n = cards.length;
  let best = null;
  const comb = (start, chosen) => {
    if (chosen.length === 5) {
      const s = score5(chosen);
      if (!best || cmpScore(s, best) > 0) best = s;
      return;
    }
    for (let i = start; i < n; i++) comb(i + 1, [...chosen, cards[i]]);
  };
  comb(0, []);
  return best;
}

function describeScore(s) {
  switch (s[0]) {
    case CAT.STRAIGHT_FLUSH:
      return s[1] === 5 ? "Straight Flush (the steel wheel)" : `Straight Flush, ${RANK_NAME[s[1]]} high`;
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

// ===========================================================================
//  OUT-COUNTING CONVENTION  (this IS the authority the player's guess is scored
//  against, so it is counted the same way a player counts single cards at the
//  table for the published Ultimate Texas Hold'em river "21 outs" rule).
//
//  Unseen cards = 52 - 2 player hole - 5 board = 45.
//
//  A single unseen card c is a DEALER OUT when the dealer's best 5-card hand
//  drawn from {c} + the 5 board cards STRICTLY beats the player's best 5-card
//  hand. Evaluated exactly, that single-card definition reproduces the
//  published rule's categories:
//    • PAIR THE BOARD — c pairs a board rank into a pair/two pair/trips/boat/
//      quads that beats the player (3 cards per board rank if the player holds
//      none of it).
//    • OUT-KICK OVERCARD — when the player only plays the board (no made pair),
//      a live higher card lifts the dealer's high-card hand above the player
//      (all 4 cards of that rank).  e.g. board A K T 7 2, the J and Q each
//      out-kick you: 2 ranks x 4 = 8 outs — matching the published example.
//    • FLUSH / STRAIGHT FILL — a lone card that completes a flush (4 of a suit
//      already on the board) or a straight (board already 4-to-a-straight).
//
//  Dealer POCKET PAIRS are deliberately NOT counted as separate outs. A pocket
//  pair is a TWO-card holding, not a single out card, and the published 21-rule
//  counts cards that pair the board or out-kick you — it does not add the four
//  cards of an over-rank as four pocket-pair "outs" (that would badly overcount
//  a two-card event). In real UTH the pocket-pair case is absorbed by the
//  separate "if you already hold a hidden pair or better, just bet" branch.
//
//  A lone card cannot complete a 3-flush, so a 3-suited board yields 0
//  single-card flush outs. No card is counted twice (outs accumulate in a Set),
//  so the grouped breakdown always sums to the total.
//
//  DECISION: 21 or more dealer outs => FOLD ; 20 or fewer => BET 1x.
// ===========================================================================
function countOuts(hole, board) {
  const used = new Set([...hole, ...board].map(cardId));
  const unseen = makeDeck().filter((c) => !used.has(cardId(c))); // 45 cards
  const playerScore = bestScore([...hole, ...board]);
  const boardRanks = new Set(board.map((c) => c.r));

  const outCards = new Set();
  const groups = new Map(); // ordered label -> count
  const order = new Map();
  let seq = 0;
  const bump = (label, sortKey) => {
    if (!groups.has(label)) { groups.set(label, 0); order.set(label, sortKey ?? seq++); }
    groups.set(label, groups.get(label) + 1);
  };

  // A single card is an out iff its best 5 with the board beats the player.
  for (const c of unseen) {
    const ds = bestScore([c, ...board]);
    if (cmpScore(ds, playerScore) > 0) {
      outCards.add(cardId(c));
      const cat = ds[0];
      if (cat === CAT.FLUSH || cat === CAT.STRAIGHT_FLUSH) bump("Flush completions", 100);
      else if (cat === CAT.STRAIGHT) bump("Straight completions", 101);
      else if (boardRanks.has(c.r)) bump(`Pair the ${RANK_LABEL[c.r]}`, 200 - c.r);
      else bump(`Out-kick ${RANK_LABEL[c.r]}`, 300 - c.r);
    }
  }

  const breakdown = [...groups.entries()]
    .map(([label, count]) => ({ label, count, k: order.get(label) }))
    .sort((a, b) => a.k - b.k)
    .map(({ label, count }) => ({ label, count }));

  return {
    total: outCards.size,
    playerScore,
    playerLabel: describeScore(playerScore),
    breakdown,
    fold: outCards.size >= 21,
  };
}

// ===========================================================================
//  DEALING
// ===========================================================================
function dealRandomScenario() {
  const deck = makeDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { hole: deck.slice(0, 2), board: deck.slice(2, 7) };
}

// ===========================================================================
//  PRESENTATIONAL SUBCOMPONENTS
// ===========================================================================
function PlayingCard({ card, faceDown, dealIndex, dealKey, small, dim, highlight }) {
  const cls = ["uth-card"];
  if (small) cls.push("uth-card--sm");
  if (faceDown) cls.push("uth-card--down");
  else cls.push(RED_SUITS.has(card.s) ? "uth-card--red" : "uth-card--black");
  if (dim) cls.push("uth-card--dim");
  if (highlight) cls.push("uth-card--hi");
  const style = dealIndex != null ? { animationDelay: `${dealIndex * 120}ms` } : undefined;
  return (
    <div className="uth-card-slot">
      <div className={cls.join(" ")} style={style} key={`${dealKey}-${dealIndex}`}>
        {faceDown ? (
          <div className="uth-card-back" />
        ) : (
          <div className="uth-card-face">
            <span className="uth-corner uth-corner--tl">
              <b>{RANK_LABEL[card.r]}</b>
              <i>{SUIT_GLYPH[card.s]}</i>
            </span>
            <span className="uth-pip">{SUIT_GLYPH[card.s]}</span>
            <span className="uth-corner uth-corner--br">
              <b>{RANK_LABEL[card.r]}</b>
              <i>{SUIT_GLYPH[card.s]}</i>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyCard({ label }) {
  return (
    <div className="uth-card-slot">
      <div className="uth-card uth-card--empty">{label || ""}</div>
    </div>
  );
}

function BetCircle({ label, chips }) {
  return (
    <div className="uth-betcircle">
      <span>{label}</span>
      {chips ? <div className="uth-mini-chip" /> : null}
    </div>
  );
}

function ChipStack() {
  return (
    <div className="uth-chipstack" aria-hidden="true">
      <div className="uth-chip uth-chip--r" />
      <div className="uth-chip uth-chip--b" />
      <div className="uth-chip uth-chip--g" />
      <div className="uth-chip uth-chip--r" />
      <div className="uth-chip uth-chip--w" />
    </div>
  );
}

// ===========================================================================
//  MAIN COMPONENT
// ===========================================================================
const EMPTY_STATS = {
  rounds: 0, exact: 0, close: 0, off: 0, correctSide: 0, absErrSum: 0,
  streak: 0, bestStreak: 0, points: 0,
};

export default function UTHOutsTrainer() {
  const [mode, setMode] = useState("practice"); // 'practice' | 'manual'

  // scenario
  const [scenario, setScenario] = useState(() => dealRandomScenario());
  const [dealKey, setDealKey] = useState(1);

  // practice round
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState(null); // {truth, verdict...} after submit
  const [stats, setStats] = useState(EMPTY_STATS);

  // manual builder
  const [manualHole, setManualHole] = useState([null, null]);
  const [manualBoard, setManualBoard] = useState([null, null, null, null, null]);
  const [manualSlot, setManualSlot] = useState(0); // 0..6 (0-1 hole, 2-6 board)
  const [manualResult, setManualResult] = useState(null);

  // inject styles once
  useEffect(() => {
    if (document.getElementById("uth-styles")) return;
    const el = document.createElement("style");
    el.id = "uth-styles";
    el.textContent = STYLES;
    document.head.appendChild(el);
  }, []);

  const truth = useMemo(
    () => countOuts(scenario.hole, scenario.board),
    [scenario]
  );

  const dealNext = useCallback(() => {
    setScenario(dealRandomScenario());
    setDealKey((k) => k + 1);
    setGuess("");
    setResult(null);
  }, []);

  const submitGuess = useCallback(() => {
    if (result) return;
    const g = parseInt(guess, 10);
    if (Number.isNaN(g)) return;
    const diff = Math.abs(g - truth.total);
    const bucket = diff === 0 ? "exact" : diff <= 2 ? "close" : "off";
    const correctSide = g >= 21 === truth.total >= 21;
    let earned = 0;
    if (correctSide) earned += 10;
    if (bucket === "exact") earned += 10;
    else if (bucket === "close") earned += 5;

    setResult({ guess: g, diff, bucket, correctSide, earned });
    setStats((s) => ({
      rounds: s.rounds + 1,
      exact: s.exact + (bucket === "exact" ? 1 : 0),
      close: s.close + (bucket === "close" ? 1 : 0),
      off: s.off + (bucket === "off" ? 1 : 0),
      correctSide: s.correctSide + (correctSide ? 1 : 0),
      absErrSum: s.absErrSum + diff,
      streak: correctSide ? s.streak + 1 : 0,
      bestStreak: Math.max(s.bestStreak, correctSide ? s.streak + 1 : 0),
      points: s.points + earned,
    }));
  }, [guess, truth, result]);

  const onPad = useCallback(
    (key) => {
      if (result) return;
      if (key === "clr") return setGuess("");
      if (key === "del") return setGuess((g) => g.slice(0, -1));
      if (key === "ok") return submitGuess();
      setGuess((g) => {
        const next = (g + key).replace(/^0+(?=\d)/, "");
        return parseInt(next, 10) > 45 ? "45" : next;
      });
    },
    [result, submitGuess]
  );

  // keyboard support for practice
  useEffect(() => {
    if (mode !== "practice") return;
    const h = (e) => {
      if (e.key >= "0" && e.key <= "9") onPad(e.key);
      else if (e.key === "Backspace") onPad("del");
      else if (e.key === "Enter") (result ? dealNext() : onPad("ok"));
      else if (e.key === "Escape") onPad("clr");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mode, onPad, result, dealNext]);

  // ------- manual mode helpers -------
  const manualCards = useMemo(
    () => [...manualHole, ...manualBoard],
    [manualHole, manualBoard]
  );
  const manualUsed = useMemo(
    () => new Set(manualCards.filter(Boolean).map(cardId)),
    [manualCards]
  );
  const manualComplete = manualCards.every(Boolean);

  const assignCard = useCallback(
    (card) => {
      if (manualUsed.has(cardId(card))) return;
      setManualResult(null);
      const slot = manualSlot;
      if (slot < 2) {
        setManualHole((h) => h.map((c, i) => (i === slot ? card : c)));
      } else {
        setManualBoard((b) => b.map((c, i) => (i === slot - 2 ? card : c)));
      }
      // advance to next empty slot
      const all = slot < 2
        ? [...manualHole.map((c, i) => (i === slot ? card : c)), ...manualBoard]
        : [...manualHole, ...manualBoard.map((c, i) => (i === slot - 2 ? card : c))];
      const nextEmpty = all.findIndex((c) => !c);
      setManualSlot(nextEmpty === -1 ? slot : nextEmpty);
    },
    [manualSlot, manualUsed, manualHole, manualBoard]
  );

  const clearManualSlot = useCallback((slot) => {
    setManualResult(null);
    if (slot < 2) setManualHole((h) => h.map((c, i) => (i === slot ? null : c)));
    else setManualBoard((b) => b.map((c, i) => (i === slot - 2 ? null : c)));
    setManualSlot(slot);
  }, []);

  const manualRandom = useCallback(() => {
    const { hole, board } = dealRandomScenario();
    setManualHole(hole);
    setManualBoard(board);
    setManualSlot(0);
    setManualResult(null);
  }, []);

  const manualClear = useCallback(() => {
    setManualHole([null, null]);
    setManualBoard([null, null, null, null, null]);
    setManualSlot(0);
    setManualResult(null);
  }, []);

  const analyzeManual = useCallback(() => {
    if (!manualComplete) return;
    setManualResult(countOuts(manualHole, manualBoard));
  }, [manualComplete, manualHole, manualBoard]);

  // ---- derived stat percentages ----
  const pct = (n) => (stats.rounds ? Math.round((100 * n) / stats.rounds) : 0);
  const avgErr = stats.rounds ? (stats.absErrSum / stats.rounds).toFixed(1) : "0.0";

  // =========================================================================
  //  RENDER
  // =========================================================================
  return (
    <div className="uth-app">
      <header className="uth-topbar">
        <div className="uth-brand">
          <span className="uth-brand-mark">21</span>
          <div>
            <h1>UTH Outs Trainer</h1>
            <p>Ultimate Texas Hold&rsquo;em &mdash; the river 21-outs rule</p>
          </div>
        </div>
        <nav className="uth-modes">
          <button
            className={mode === "practice" ? "is-active" : ""}
            onClick={() => setMode("practice")}
          >
            Practice
          </button>
          <button
            className={mode === "manual" ? "is-active" : ""}
            onClick={() => setMode("manual")}
          >
            Manual
          </button>
        </nav>
      </header>

      {mode === "practice" ? (
        <PracticeView
          scenario={scenario}
          dealKey={dealKey}
          truth={truth}
          guess={guess}
          result={result}
          onPad={onPad}
          onSubmit={submitGuess}
          onDealNext={dealNext}
          stats={stats}
          pct={pct}
          avgErr={avgErr}
          onReset={() => setStats(EMPTY_STATS)}
        />
      ) : (
        <ManualView
          manualHole={manualHole}
          manualBoard={manualBoard}
          manualSlot={manualSlot}
          setManualSlot={setManualSlot}
          manualUsed={manualUsed}
          manualComplete={manualComplete}
          onAssign={assignCard}
          onClearSlot={clearManualSlot}
          onRandom={manualRandom}
          onClear={manualClear}
          onAnalyze={analyzeManual}
          result={manualResult}
        />
      )}

      <footer className="uth-foot">
        A dealer out = any single unseen card whose best 5 with the board beats
        you (board pairs, out-kicking overcards, 4-card flush/straight fills);
        dealer <b>pocket pairs are not counted</b>. <b>21+ &rarr; FOLD, &le;20
        &rarr; BET&nbsp;1&times;.</b>
      </footer>
    </div>
  );
}

// ===========================================================================
//  PRACTICE VIEW
// ===========================================================================
function PracticeView({
  scenario, dealKey, truth, guess, result, onPad, onSubmit, onDealNext,
  stats, pct, avgErr, onReset,
}) {
  return (
    <div className="uth-view uth-view--practice">
      <div className={`uth-main ${result ? "uth-main--result" : ""}`}>
        <PokerTable
          hole={scenario.hole}
          board={scenario.board}
          dealKey={dealKey}
          revealResult={!!result}
        />

        {!result ? (
          <div className="uth-guess-dock">
            <div className="uth-prompt">
              <span className="uth-prompt-q">
                Unseen cards that beat you?
              </span>
              <div className="uth-guess-display">
                <span className="uth-guess-num">{guess === "" ? "–" : guess}</span>
                <span className="uth-guess-unit">outs</span>
              </div>
            </div>
            <NumberPad guess={guess} onPad={onPad} />
          </div>
        ) : (
          <ResultPanel
            result={result}
            truth={truth}
            onDealNext={onDealNext}
          />
        )}
      </div>

      <StatsPanel stats={stats} pct={pct} avgErr={avgErr} onReset={onReset} float />
    </div>
  );
}

function NumberPad({ guess, onPad }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "del"];
  return (
    <div className="uth-pad">
      <div className="uth-pad-grid">
        {keys.map((k) => (
          <button
            key={k}
            className={`uth-key ${k === "clr" || k === "del" ? "uth-key--fn" : ""}`}
            onClick={() => onPad(k)}
          >
            {k === "clr" ? "CLR" : k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>
      <button
        className="uth-key uth-key--submit"
        disabled={guess === ""}
        onClick={() => onPad("ok")}
      >
        Lock in guess
      </button>
    </div>
  );
}

function ResultPanel({ result, truth, onDealNext }) {
  const { guess, diff, bucket, correctSide, earned } = result;
  const bucketLabel = bucket === "exact" ? "Exact" : bucket === "close" ? "Close" : "Off";
  return (
    <div className="uth-result">
      <div className={`uth-verdict uth-verdict--${bucket} ${correctSide ? "" : "uth-verdict--wrongside"}`}>
        <div className="uth-verdict-row">
          <span className={`uth-badge uth-badge--${bucket}`}>
            {bucket === "exact" ? "Exact ✓" : bucket === "close" ? "Close" : "Off"}
          </span>
          <span className={`uth-badge ${correctSide ? "uth-badge--side-ok" : "uth-badge--side-bad"}`}>
            {correctSide ? "Correct side of 21 ✓" : "Wrong side of 21 ✗"}
          </span>
          {earned > 0 ? <span className="uth-earned">+{earned}</span> : null}
        </div>
        <div className="uth-guess-vs">
          <div className="uth-vs-cell">
            <span className="uth-vs-k">Your guess</span>
            <span className="uth-vs-v">{guess}</span>
          </div>
          <div className="uth-vs-sep">vs</div>
          <div className="uth-vs-cell">
            <span className="uth-vs-k">True outs</span>
            <span className="uth-vs-v uth-vs-v--true">{truth.total}</span>
          </div>
          <div className="uth-vs-cell uth-vs-cell--diff">
            <span className="uth-vs-k">Off by</span>
            <span className="uth-vs-v">{diff}</span>
          </div>
        </div>
      </div>

      <div className="uth-result-body">
        <div className="uth-you-have">
          <span className="uth-lbl">You have</span>
          <strong>{truth.playerLabel}</strong>
        </div>
        <div className={`uth-action uth-action--${truth.fold ? "fold" : "bet"}`}>
          <span className="uth-lbl">Because {truth.total} {truth.fold ? "≥ 21" : "≤ 20"}</span>
          <strong>{truth.fold ? "FOLD" : "BET 1×"}</strong>
        </div>
      </div>

      <OutsBreakdown truth={truth} />

      <button className="uth-key uth-key--submit uth-deal-next" onClick={onDealNext}>
        Deal next hand &rarr;
      </button>
    </div>
  );
}

function OutsBreakdown({ truth }) {
  return (
    <div className="uth-breakdown">
      <div className="uth-breakdown-head">
        <span>Where the {truth.total} outs come from</span>
        <span className="uth-breakdown-sub">this is where miscounts hide</span>
      </div>
      {truth.breakdown.length === 0 ? (
        <div className="uth-break-empty">
          No unseen card beats you &mdash; you hold the effective nuts. 0 outs.
        </div>
      ) : (
        <ul className="uth-break-list">
          {truth.breakdown.map((b) => (
            <li key={b.label}>
              <span className="uth-break-label">{b.label}</span>
              <span className="uth-break-dots" />
              <span className="uth-break-count">{b.count}</span>
            </li>
          ))}
          <li className="uth-break-total">
            <span className="uth-break-label">Total dealer outs</span>
            <span className="uth-break-dots" />
            <span className="uth-break-count">{truth.total}</span>
          </li>
        </ul>
      )}
    </div>
  );
}

function StatsPanel({ stats, pct, avgErr, onReset, float }) {
  return (
    <aside className={`uth-stats ${float ? "uth-stats--float" : ""}`}>
      <div className="uth-stats-head">
        <h2>Session stats</h2>
        <button className="uth-reset" onClick={onReset}>Reset</button>
      </div>

      <div className="uth-headline">
        <span className="uth-headline-v">{pct(stats.correctSide)}%</span>
        <span className="uth-headline-k">Correct bet/fold decision</span>
      </div>

      <div className="uth-stat-grid">
        <Stat k="Rounds" v={stats.rounds} />
        <Stat k="Streak" v={stats.streak} sub={`best ${stats.bestStreak}`} />
        <Stat k="Avg error" v={avgErr} sub="outs" />
        <Stat k="Right side" v={stats.correctSide} sub={`of ${stats.rounds}`} tone="side" />
        <Stat k="Points" v={stats.points} secondary />
        <Stat k="Exact" v={stats.exact} sub={`${pct(stats.exact)}%`} tone="exact" secondary />
        <Stat k="Close (±2)" v={stats.close} sub={`${pct(stats.close)}%`} tone="close" secondary />
        <Stat k="Off" v={stats.off} sub={`${pct(stats.off)}%`} tone="off" secondary />
      </div>

      <div className="uth-help">
        <p><b>The unit is OUTS</b>, not probability &mdash; count single unseen
          cards that hand the dealer a better hand.</p>
        <p>The headline stat is decision accuracy: a small numeric miss that
          keeps the same bet/fold call is minor; a miss that flips it is the
          costly one.</p>
      </div>
    </aside>
  );
}

function Stat({ k, v, sub, tone, secondary }) {
  return (
    <div className={`uth-stat ${tone ? `uth-stat--${tone}` : ""} ${secondary ? "uth-stat--secondary" : ""}`}>
      <span className="uth-stat-v">{v}</span>
      <span className="uth-stat-k">{k}</span>
      {sub != null ? <span className="uth-stat-sub">{sub}</span> : null}
    </div>
  );
}

// ===========================================================================
//  POKER TABLE (shared visual)
// ===========================================================================
function PokerTable({ hole, board, dealKey, revealResult }) {
  return (
    <div className="uth-table-wrap">
      <div className="uth-rail">
        <div className="uth-felt">
          <div className="uth-felt-ring" />
          <div className="uth-logo">ULTIMATE<br />TEXAS HOLD&rsquo;EM</div>

          <div className="uth-dealer-zone">
            <div className="uth-seatlabel">DEALER</div>
            <div className="uth-dealer-cards">
              <PlayingCard card={{ r: 2, s: "s" }} faceDown small dealKey={dealKey} dealIndex={0} />
              <PlayingCard card={{ r: 2, s: "s" }} faceDown small dealKey={dealKey} dealIndex={0} />
            </div>
            <div className="uth-dealer-btn">D</div>
          </div>

          <div className="uth-board" key={`board-${dealKey}`}>
            {board.map((c, i) => (
              <PlayingCard
                key={`b-${dealKey}-${i}`}
                card={c}
                dealKey={dealKey}
                dealIndex={i}
                highlight={revealResult}
              />
            ))}
          </div>

          <div className="uth-seat-zone">
            <div className="uth-betcircles">
              <BetCircle label="Trips" />
              <BetCircle label="Ante" chips />
              <BetCircle label="Blind" chips />
              <BetCircle label="Play" />
            </div>
            <div className="uth-player">
              <ChipStack />
              <div className="uth-hole" key={`hole-${dealKey}`}>
                {hole.map((c, i) => (
                  <PlayingCard
                    key={`h-${dealKey}-${i}`}
                    card={c}
                    dealKey={dealKey}
                    dealIndex={5 + i}
                  />
                ))}
              </div>
              <div className="uth-seatlabel uth-seatlabel--you">YOU</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
//  MANUAL VIEW
// ===========================================================================
function ManualView({
  manualHole, manualBoard, manualSlot, setManualSlot, manualUsed,
  manualComplete, onAssign, onClearSlot, onRandom, onClear, onAnalyze, result,
}) {
  const slots = [
    { i: 0, label: "Hole 1", card: manualHole[0] },
    { i: 1, label: "Hole 2", card: manualHole[1] },
    { i: 2, label: "Flop 1", card: manualBoard[0] },
    { i: 3, label: "Flop 2", card: manualBoard[1] },
    { i: 4, label: "Flop 3", card: manualBoard[2] },
    { i: 5, label: "Turn", card: manualBoard[3] },
    { i: 6, label: "River", card: manualBoard[4] },
  ];

  return (
    <div className="uth-view uth-view--manual">
      <div className="uth-main">
        <PokerTable
          hole={[manualHole[0] || { r: 2, s: "s" }, manualHole[1] || { r: 2, s: "s" }].map((c, i) =>
            manualHole[i] ? manualHole[i] : c
          )}
          board={manualBoard.map((c) => c || { r: 2, s: "s" })}
          dealKey={0}
          revealResult={!!result}
        />

        <div className="uth-manual-dock">
          <div className="uth-manual-slots">
            {slots.map((s) => (
              <button
                key={s.i}
                className={`uth-slot ${manualSlot === s.i ? "is-active" : ""} ${s.i < 2 ? "uth-slot--hole" : ""}`}
                onClick={() => setManualSlot(s.i)}
                onDoubleClick={() => onClearSlot(s.i)}
              >
                <span className="uth-slot-label">{s.label}</span>
                <span className={`uth-slot-card ${s.card ? (RED_SUITS.has(s.card.s) ? "is-red" : "is-black") : "is-empty"}`}>
                  {s.card ? `${RANK_LABEL[s.card.r]}${SUIT_GLYPH[s.card.s]}` : "–"}
                </span>
              </button>
            ))}
          </div>

          <div className="uth-manual-actions">
            <button className="uth-key uth-key--fn" onClick={onRandom}>Random</button>
            <button className="uth-key uth-key--fn" onClick={onClear}>Clear all</button>
            <button
              className="uth-key uth-key--submit"
              disabled={!manualComplete}
              onClick={onAnalyze}
            >
              Analyze outs
            </button>
          </div>

          <CardPalette manualUsed={manualUsed} onAssign={onAssign} />
        </div>
      </div>

      <aside className="uth-stats">
        {result ? (
          <div className="uth-manual-result">
            <div className="uth-you-have">
              <span className="uth-lbl">You have</span>
              <strong>{result.playerLabel}</strong>
            </div>
            <div className="uth-manual-total">
              <span className="uth-manual-total-v">{result.total}</span>
              <span className="uth-manual-total-k">dealer outs of 45</span>
            </div>
            <div className={`uth-action uth-action--${result.fold ? "fold" : "bet"}`}>
              <span className="uth-lbl">Because {result.total} {result.fold ? "≥ 21" : "≤ 20"}</span>
              <strong>{result.fold ? "FOLD" : "BET 1×"}</strong>
            </div>
            <OutsBreakdown truth={result} />
          </div>
        ) : (
          <div className="uth-manual-hint">
            <h2>Manual analysis</h2>
            <p>Tap a slot, then pick a card below to build any legal 7-card
              scenario &mdash; or hit <b>Random</b>. Double-tap a slot to clear
              it.</p>
            <p>Then <b>Analyze</b> to see the exact dealer out count, the
              bet/fold verdict, and the full breakdown of where the outs come
              from.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function CardPalette({ manualUsed, onAssign }) {
  return (
    <div className="uth-palette">
      {SUITS.map((s) => (
        <div className="uth-palette-row" key={s}>
          {RANKS.map((r) => {
            const card = { r, s };
            const used = manualUsed.has(cardId(card));
            return (
              <button
                key={cardId(card)}
                className={`uth-pcard ${RED_SUITS.has(s) ? "is-red" : "is-black"} ${used ? "is-used" : ""}`}
                disabled={used}
                onClick={() => onAssign(card)}
              >
                <b>{RANK_LABEL[r]}</b>
                <i>{SUIT_GLYPH[s]}</i>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
//  STYLES
// ===========================================================================
const STYLES = `
html,body{margin:0;padding:0;background:#0b0d10}
:root{
  --felt:#0c7a45; --felt-dark:#075130; --felt-edge:#053a22;
  --rail:#4a2f1c; --rail-hi:#6b4326; --rail-lo:#2c1a0f;
  --gold:#e7c65a; --gold-dim:#b9962f;
  --ink:#12161c; --paper:#f7f4ec; --red:#c8102e; --black:#1c1c22;
  --bg0:#0b0d10; --bg1:#12161c; --panel:#171d26; --panel2:#1f2733;
  --line:#2a3644; --txt:#e8edf3; --muted:#93a1b2;
  --ok:#3ecf8e; --warn:#f0b429; --bad:#ef5b64; --accent:#5aa9e6;
}
*{box-sizing:border-box}
.uth-app{
  min-height:100vh; margin:0; color:var(--txt);
  font-family:"Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;
  background:
    radial-gradient(1200px 700px at 50% -10%, #1a2836 0%, var(--bg0) 60%),
    var(--bg0);
  padding:12px; display:flex; flex-direction:column; gap:10px;
}
/* ---------- top bar ---------- */
.uth-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.uth-brand{display:flex;align-items:center;gap:12px}
.uth-brand-mark{
  width:46px;height:46px;border-radius:12px;display:grid;place-items:center;
  font-weight:800;font-size:20px;color:#20160a;
  background:linear-gradient(160deg,var(--gold),var(--gold-dim));
  box-shadow:0 4px 14px rgba(231,198,90,.3),inset 0 1px 0 rgba(255,255,255,.5);
}
.uth-brand h1{margin:0;font-size:19px;letter-spacing:.3px}
.uth-brand p{margin:2px 0 0;font-size:12px;color:var(--muted)}
.uth-modes{display:flex;gap:6px;background:var(--panel);padding:5px;border-radius:12px;border:1px solid var(--line)}
.uth-modes button{
  border:0;background:transparent;color:var(--muted);font-weight:700;font-size:14px;
  padding:9px 18px;border-radius:9px;cursor:pointer;transition:.15s;
}
.uth-modes button.is-active{background:linear-gradient(160deg,var(--gold),var(--gold-dim));color:#20160a}
.uth-modes button:not(.is-active):hover{color:var(--txt)}

/* ---------- layout ---------- */
/* Practice: single centered column; stats float top-right on desktop. */
.uth-view--practice{display:block}
.uth-view--practice .uth-main{min-width:0;max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
/* In result mode the table shrinks (just a hand reminder) so the verdict +
   breakdown fit on screen; declutter the betting circles / chips there. */
.uth-view--practice .uth-main--result .uth-rail{max-width:360px;aspect-ratio:16/8.6}
.uth-view--practice .uth-main--result .uth-card{width:clamp(26px,5vw,42px)}
.uth-view--practice .uth-main--result .uth-card--sm{width:clamp(20px,3.6vw,30px)}
.uth-view--practice .uth-main--result .uth-betcircles,
.uth-view--practice .uth-main--result .uth-chipstack,
.uth-view--practice .uth-main--result .uth-logo,
.uth-view--manual .uth-betcircles,
.uth-view--manual .uth-chipstack,
.uth-view--manual .uth-logo{display:none}
.uth-view--practice .uth-main--result .uth-board,
.uth-view--manual .uth-board{top:36%}
.uth-view--practice .uth-main--result .uth-seat-zone,
.uth-view--manual .uth-seat-zone{bottom:9%}
/* Manual: table/builder + side panel. */
.uth-view--manual{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
.uth-view--manual .uth-main{min-width:0;display:flex;flex-direction:column;gap:12px}

/* ---------- poker table ---------- */
.uth-table-wrap{width:100%;display:flex;justify-content:center}
.uth-rail{
  width:100%;max-width:500px;aspect-ratio:16/10;border-radius:50%/50%;
  padding:min(3.4%,20px);
  background:
    linear-gradient(180deg,var(--rail-hi),var(--rail) 40%,var(--rail-lo));
  box-shadow:
    0 24px 60px rgba(0,0,0,.55),
    inset 0 2px 3px rgba(255,255,255,.14),
    inset 0 -8px 22px rgba(0,0,0,.55);
  position:relative;
}
.uth-rail::before{
  content:"";position:absolute;inset:6px;border-radius:50%/50%;
  border:2px solid rgba(0,0,0,.35);pointer-events:none;
}
.uth-felt{
  position:relative;width:100%;height:100%;border-radius:50%/50%;
  background:
    radial-gradient(120% 120% at 50% 30%, var(--felt) 0%, var(--felt-dark) 62%, var(--felt-edge) 100%);
  box-shadow:inset 0 0 60px rgba(0,0,0,.55),inset 0 0 0 6px rgba(0,0,0,.12);
  overflow:hidden;
  background-image:
    radial-gradient(120% 120% at 50% 30%, rgba(255,255,255,.04), rgba(0,0,0,0) 60%),
    repeating-conic-gradient(from 0deg, rgba(255,255,255,.012) 0deg 4deg, rgba(0,0,0,.012) 4deg 8deg);
}
.uth-felt-ring{
  position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);
  width:80%;height:66%;border-radius:50%/50%;
  border:2px solid rgba(231,198,90,.28);
  box-shadow:0 0 0 6px rgba(0,0,0,.06),inset 0 0 40px rgba(0,0,0,.25);
}
.uth-logo{
  position:absolute;left:50%;top:23%;transform:translate(-50%,-50%);
  text-align:center;font-weight:800;letter-spacing:2px;line-height:1.3;
  font-size:clamp(8px,1.6vw,13px);color:rgba(231,198,90,.15);pointer-events:none;
}
.uth-seatlabel{
  font-size:clamp(8px,1.5vw,11px);letter-spacing:2px;font-weight:800;
  color:rgba(255,255,255,.5);text-align:center;
}
.uth-seatlabel--you{color:var(--gold)}

/* dealer zone */
.uth-dealer-zone{position:absolute;left:50%;top:6%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px}
.uth-dealer-cards{display:flex;gap:5px}
.uth-dealer-btn{
  width:clamp(18px,3.4vw,26px);height:clamp(18px,3.4vw,26px);border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#fff,#d8d8d8);color:#111;font-weight:800;
  display:grid;place-items:center;font-size:clamp(9px,1.7vw,13px);
  box-shadow:0 2px 5px rgba(0,0,0,.4),inset 0 0 0 2px rgba(0,0,0,.12);
}

/* board */
.uth-board{
  position:absolute;left:50%;top:37%;transform:translate(-50%,-50%);
  display:flex;gap:clamp(4px,1.2vw,10px);
}

/* seat zone */
.uth-seat-zone{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;width:86%}
.uth-betcircles{display:flex;gap:clamp(4px,1.4vw,10px);justify-content:center;margin-bottom:1px}
.uth-betcircle{
  width:clamp(22px,4.6vw,32px);height:clamp(22px,4.6vw,32px);border-radius:50%;
  border:1.5px dashed rgba(231,198,90,.5);display:grid;place-items:center;position:relative;
  font-size:clamp(7px,1.4vw,10px);letter-spacing:.5px;color:rgba(255,255,255,.72);font-weight:700;
  background:radial-gradient(circle at 50% 30%,rgba(0,0,0,.12),rgba(0,0,0,.28));
}
.uth-mini-chip{position:absolute;width:60%;height:60%;border-radius:50%;
  background:repeating-conic-gradient(#c8102e 0 30deg,#fff 30deg 60deg);
  box-shadow:0 1px 3px rgba(0,0,0,.5);opacity:.9}
.uth-player{display:flex;flex-direction:column;align-items:center;gap:5px;position:relative}
.uth-hole{display:flex;gap:8px}
.uth-chipstack{position:absolute;left:-52px;bottom:2px;display:flex;flex-direction:column-reverse;height:40px;justify-content:flex-end}
@media(max-width:560px){.uth-chipstack{display:none}}
.uth-chip{width:30px;height:8px;border-radius:50%;margin-top:-4px;box-shadow:0 2px 3px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.35)}
.uth-chip--r{background:repeating-conic-gradient(#c8102e 0 30deg,#fff 30deg 60deg)}
.uth-chip--b{background:repeating-conic-gradient(#20489b 0 30deg,#fff 30deg 60deg)}
.uth-chip--g{background:repeating-conic-gradient(#12894d 0 30deg,#fff 30deg 60deg)}
.uth-chip--w{background:radial-gradient(circle,#f4f4f4,#cfcfcf)}

/* ---------- cards ---------- */
.uth-card-slot{display:inline-flex}
.uth-card{
  width:clamp(30px,6.2vw,50px);aspect-ratio:5/7;border-radius:7px;position:relative;
  background:var(--paper);box-shadow:0 5px 12px rgba(0,0,0,.4),inset 0 0 0 1px rgba(0,0,0,.08);
  overflow:hidden;transform-origin:center;
  animation:uthDeal .5s cubic-bezier(.2,.9,.25,1) both;
}
.uth-card--sm{width:clamp(24px,4.4vw,36px)}
.uth-card--red{color:var(--red)}
.uth-card--black{color:var(--black)}
.uth-card--dim{opacity:.5}
.uth-card--hi{box-shadow:0 6px 16px rgba(0,0,0,.45),0 0 0 2px var(--gold),inset 0 0 0 1px rgba(0,0,0,.08)}
.uth-card-face{position:absolute;inset:0}
.uth-corner{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:.92;font-weight:800}
.uth-corner b{font-size:clamp(10px,2vw,14px)}
.uth-corner i{font-size:clamp(7px,1.4vw,10px);font-style:normal;margin-top:1px}
.uth-corner--tl{top:3px;left:4px}
.uth-corner--br{bottom:3px;right:4px;transform:rotate(180deg)}
.uth-pip{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:clamp(15px,3.4vw,24px)}
.uth-card--empty{background:rgba(255,255,255,.05);border:2px dashed rgba(255,255,255,.25);box-shadow:none;
  display:grid;place-items:center;color:rgba(255,255,255,.4);font-size:11px;animation:none}
.uth-card-back{position:absolute;inset:0;border-radius:8px;
  background:
    repeating-linear-gradient(45deg,#8a1620 0 6px,#6f1019 6px 12px);
  box-shadow:inset 0 0 0 3px #f3e6c8, inset 0 0 0 4px #6f1019;}
.uth-card-back::after{content:"";position:absolute;inset:6px;border-radius:5px;border:1px solid rgba(243,230,200,.5)}
@keyframes uthDeal{
  0%{opacity:0;transform:translateY(-120px) translateX(-18px) rotate(-14deg) scale(.85)}
  60%{opacity:1}
  100%{opacity:1;transform:none}
}

/* ---------- guess dock ---------- */
.uth-guess-dock{
  background:linear-gradient(180deg,var(--panel),var(--panel2));
  border:1px solid var(--line);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;
}
.uth-prompt{display:flex;align-items:center;justify-content:space-between;gap:10px}
.uth-prompt-q{color:var(--muted);font-size:13px;font-weight:600}
.uth-guess-display{display:flex;align-items:baseline;gap:6px}
.uth-guess-num{font-size:26px;font-weight:800;color:var(--gold);min-width:38px;text-align:right;
  font-variant-numeric:tabular-nums}
.uth-guess-unit{color:var(--muted);font-size:13px;font-weight:600}
.uth-pad{display:flex;flex-direction:column;gap:6px;max-width:300px;width:100%;margin:0 auto}
.uth-pad-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.uth-key{
  border:1px solid var(--line);background:linear-gradient(180deg,#232c38,#1a212b);color:var(--txt);
  font-size:17px;font-weight:700;padding:8px 0;border-radius:9px;cursor:pointer;transition:.12s;
  box-shadow:0 2px 0 rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.05);
}
.uth-key:hover{transform:translateY(-1px);border-color:#3a4a5e}
.uth-key:active{transform:translateY(1px)}
.uth-key--fn{font-size:14px;color:var(--muted)}
.uth-key--submit{
  background:linear-gradient(180deg,var(--gold),var(--gold-dim));color:#20160a;font-size:15px;padding:10px 0;
  border-color:transparent;box-shadow:0 4px 14px rgba(231,198,90,.28);
}
.uth-key--submit:disabled{opacity:.4;cursor:not-allowed;box-shadow:none}
.uth-deal-next{margin-top:2px}

/* ---------- result ---------- */
.uth-result{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px;animation:uthRise .3s ease both}
@keyframes uthRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.uth-verdict{border-radius:12px;padding:10px 12px;border:1px solid var(--line);
  background:radial-gradient(120% 140% at 0% 0%, rgba(90,169,230,.10), rgba(0,0,0,0))}
.uth-verdict--exact{box-shadow:inset 0 0 0 1px rgba(62,207,142,.4)}
.uth-verdict--wrongside{background:radial-gradient(120% 140% at 0% 0%, rgba(239,91,100,.16), rgba(0,0,0,0))}
.uth-verdict-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
.uth-badge{padding:5px 10px;border-radius:999px;font-weight:800;font-size:12px;letter-spacing:.3px}
.uth-badge--exact{background:rgba(62,207,142,.16);color:var(--ok);box-shadow:inset 0 0 0 1px rgba(62,207,142,.5)}
.uth-badge--close{background:rgba(240,180,41,.16);color:var(--warn);box-shadow:inset 0 0 0 1px rgba(240,180,41,.5)}
.uth-badge--off{background:rgba(239,91,100,.14);color:var(--bad);box-shadow:inset 0 0 0 1px rgba(239,91,100,.45)}
.uth-badge--side-ok{background:rgba(62,207,142,.16);color:var(--ok);box-shadow:inset 0 0 0 1px rgba(62,207,142,.5)}
.uth-badge--side-bad{background:rgba(239,91,100,.18);color:var(--bad);box-shadow:inset 0 0 0 1px rgba(239,91,100,.6)}
.uth-earned{margin-left:auto;font-weight:800;color:var(--gold);font-size:15px}
.uth-guess-vs{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.uth-vs-cell{display:flex;flex-direction:column;gap:1px;min-width:60px}
.uth-vs-k{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.uth-vs-v{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.uth-vs-v--true{color:var(--gold)}
.uth-vs-sep{color:var(--muted);font-size:13px}
.uth-vs-cell--diff{margin-left:auto;text-align:right}
.uth-result-body{display:grid;grid-template-columns:1fr auto;gap:8px}
.uth-you-have,.uth-action{background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:11px;padding:8px 12px;display:flex;flex-direction:column;gap:2px}
.uth-lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.uth-you-have strong{font-size:15px}
.uth-action{align-items:center;text-align:center;min-width:110px}
.uth-action strong{font-size:19px;font-weight:800}
.uth-action--bet{box-shadow:inset 0 0 0 1px rgba(62,207,142,.45)}
.uth-action--bet strong{color:var(--ok)}
.uth-action--fold{box-shadow:inset 0 0 0 1px rgba(239,91,100,.5)}
.uth-action--fold strong{color:var(--bad)}

/* ---------- breakdown ---------- */
.uth-breakdown{background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:11px;padding:9px 12px}
.uth-breakdown-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.uth-breakdown-head>span:first-child{font-weight:700;font-size:13px}
.uth-breakdown-sub{font-size:10px;color:var(--muted)}
.uth-break-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;max-height:20vh;overflow:auto}
.uth-break-list li{display:flex;align-items:baseline;gap:8px;font-size:13px}
.uth-break-label{color:var(--txt)}
.uth-break-dots{flex:1;border-bottom:1px dotted rgba(255,255,255,.2);transform:translateY(-3px)}
.uth-break-count{font-weight:800;font-variant-numeric:tabular-nums;color:var(--gold)}
.uth-break-total{margin-top:4px;padding-top:6px;border-top:1px solid var(--line);font-weight:800}
.uth-break-total .uth-break-label{color:#fff}
.uth-break-empty{font-size:13px;color:var(--ok);background:rgba(62,207,142,.08);padding:10px;border-radius:8px}

/* ---------- stats ---------- */
.uth-stats{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:14px;padding:12px;position:sticky;top:14px;display:flex;flex-direction:column;gap:10px}
.uth-stats-head{display:flex;justify-content:space-between;align-items:center}
.uth-stats-head h2{margin:0;font-size:14px}
.uth-reset{background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:8px;padding:4px 10px;cursor:pointer;font-weight:600;font-size:12px}
.uth-reset:hover{color:var(--txt);border-color:#3a4a5e}
.uth-headline{background:radial-gradient(120% 120% at 100% 0%,rgba(231,198,90,.16),rgba(0,0,0,0));border:1px solid rgba(231,198,90,.3);border-radius:11px;padding:9px;text-align:center;display:flex;flex-direction:column;gap:1px}
.uth-headline-v{font-size:28px;font-weight:800;color:var(--gold);line-height:1;font-variant-numeric:tabular-nums}
.uth-headline-k{font-size:11px;color:var(--muted);font-weight:600}
.uth-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.uth-stat{background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:9px;padding:6px 9px;display:flex;flex-direction:column;gap:0}
.uth-stat-v{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2}
.uth-stat-k{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px}
.uth-stat-sub{font-size:10px;color:var(--muted)}
.uth-stat--exact .uth-stat-v{color:var(--ok)}
.uth-stat--close .uth-stat-v{color:var(--warn)}
.uth-stat--off .uth-stat-v{color:var(--bad)}
.uth-stat--side .uth-stat-v{color:var(--gold)}
.uth-help{font-size:11px;color:var(--muted);line-height:1.45;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--line);padding-top:10px}
.uth-help b{color:var(--txt)}
/* practice: keep the static (narrow-screen) stats tidy and centered */
.uth-view--practice .uth-stats{max-width:560px;margin:0 auto;position:static}

/* ---------- manual ---------- */
.uth-manual-dock{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:14px}
.uth-manual-slots{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
@media(max-width:520px){.uth-manual-slots{grid-template-columns:repeat(4,1fr)}}
.uth-slot{display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:10px;padding:8px 4px;cursor:pointer;transition:.12s}
.uth-slot.is-active{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold)}
.uth-slot--hole{background:rgba(231,198,90,.06)}
.uth-slot-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
.uth-slot-card{font-size:20px;font-weight:800}
.uth-slot-card.is-red{color:var(--red)}
.uth-slot-card.is-black{color:#e8edf3}
.uth-slot-card.is-empty{color:rgba(255,255,255,.3)}
.uth-manual-actions{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px}
.uth-manual-actions .uth-key{padding:12px 0}
.uth-palette{display:flex;flex-direction:column;gap:5px;background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:12px;padding:10px}
.uth-palette-row{display:grid;grid-template-columns:repeat(13,1fr);gap:4px}
.uth-pcard{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;background:var(--paper);border:1px solid rgba(0,0,0,.15);border-radius:6px;padding:5px 0;cursor:pointer;line-height:1;transition:.1s}
.uth-pcard b{font-size:13px;font-weight:800}
.uth-pcard i{font-size:11px;font-style:normal}
.uth-pcard.is-red{color:var(--red)}
.uth-pcard.is-black{color:var(--black)}
.uth-pcard:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 4px 10px rgba(0,0,0,.4)}
.uth-pcard.is-used,.uth-pcard:disabled{opacity:.22;cursor:not-allowed;transform:none}
.uth-manual-hint h2{margin:0 0 8px;font-size:16px}
.uth-manual-hint p{font-size:13px;color:var(--muted);line-height:1.55;margin:0 0 8px}
.uth-manual-hint b{color:var(--txt)}
.uth-manual-result{display:flex;flex-direction:column;gap:12px}
.uth-manual-total{background:radial-gradient(120% 120% at 100% 0%,rgba(231,198,90,.16),rgba(0,0,0,0));border:1px solid rgba(231,198,90,.3);border-radius:12px;padding:14px;text-align:center;display:flex;flex-direction:column;gap:2px}
.uth-manual-total-v{font-size:40px;font-weight:800;color:var(--gold);line-height:1}
.uth-manual-total-k{font-size:12px;color:var(--muted)}

/* ---------- footer ---------- */
.uth-foot{font-size:11px;color:var(--muted);line-height:1.5;text-align:center;border-top:1px solid var(--line);padding-top:8px;max-width:820px;margin:0 auto}
.uth-foot b{color:var(--txt)}

/* ---------- responsive ---------- */
/* Desktop: float the session stats as a compact HUD in the top-right so the
   whole practice screen fits without scrolling. */
@media(min-width:1040px){
  .uth-view--practice .uth-stats--float{
    position:fixed;top:70px;right:14px;width:220px;margin:0;z-index:40;
    max-height:calc(100vh - 84px);overflow:auto;
    box-shadow:0 18px 44px rgba(0,0,0,.5);
  }
  .uth-view--practice .uth-stats--float .uth-help{display:none}
}
@media(max-width:900px){
  .uth-view--manual{grid-template-columns:1fr}
  .uth-view--manual .uth-stats{position:static}
}
/* Phones: a small landscape table + the session stats floating as a compact
   HUD in the top-right (matching desktop). The header title is shrunk so it
   shares the top row with the HUD. */
@media(max-width:560px){
  .uth-rail{max-width:330px;aspect-ratio:16/10.6}
  .uth-betcircle{border-width:1px}
  .uth-view--practice .uth-main{gap:8px}
  /* shrink the header so the floating HUD has room on the right */
  .uth-topbar{flex-direction:column;align-items:flex-start;gap:8px}
  .uth-brand{gap:9px}
  .uth-brand-mark{width:32px;height:32px;font-size:15px;border-radius:9px}
  .uth-brand h1{font-size:15px;line-height:1.1}
  .uth-brand p{display:none}
  .uth-modes button{padding:7px 14px;font-size:13px}
  .uth-foot{font-size:10px;padding-top:6px}
  /* compact stats everywhere on phones */
  .uth-help{display:none}
  .uth-stats{gap:7px;padding:9px}
  .uth-stats-head h2{font-size:12px}
  .uth-headline{padding:6px}
  .uth-headline-v{font-size:20px}
  .uth-headline-k{font-size:9px}
  .uth-stat{padding:4px 6px}
  .uth-stat-v{font-size:14px}
  .uth-stat-k{font-size:8px}
  .uth-stat-sub{font-size:8px}
  /* float the practice stats HUD in the top-right corner. Keep it SHORT so it
     stays above the community cards: show the headline + 4 key stats only,
     hiding the secondary tiles (points/exact/close/off). */
  .uth-view--practice .uth-stats--float{
    position:fixed;top:6px;right:6px;width:41vw;max-width:150px;margin:0;z-index:50;
    padding:7px;gap:6px;
    box-shadow:0 12px 30px rgba(0,0,0,.6);border-color:#33465b;
  }
  .uth-view--practice .uth-stats--float .uth-stat--secondary{display:none}
  .uth-view--practice .uth-stats--float .uth-stat-sub{display:none}
  .uth-view--practice .uth-stats--float .uth-stats-head h2{font-size:10px;letter-spacing:.3px;text-transform:uppercase}
  .uth-view--practice .uth-stats--float .uth-headline{padding:4px}
  .uth-view--practice .uth-stats--float .uth-headline-v{font-size:17px}
  .uth-view--practice .uth-stats--float .uth-headline-k{font-size:8px}
  .uth-view--practice .uth-stats--float .uth-stat-grid{gap:4px}
  .uth-view--practice .uth-stats--float .uth-stat{padding:3px 6px}
  .uth-view--practice .uth-stats--float .uth-stat-v{font-size:13px;line-height:1.05}
  .uth-view--practice .uth-stats--float .uth-stat-k{font-size:7px}
  .uth-view--practice .uth-stats--float .uth-reset{padding:2px 6px;font-size:9px}
}
@media(max-width:420px){
  .uth-app{padding:10px;gap:8px}
  .uth-brand-mark{width:38px;height:38px;font-size:17px}
  .uth-brand h1{font-size:16px}
  .uth-brand p{font-size:11px}
  .uth-vs-v{font-size:22px}
  .uth-guess-num{font-size:24px}
  .uth-betcircles{gap:6px}
  /* full-width number pad on small phones for easy tapping */
  .uth-pad{max-width:none}
}
`;
