// Openings book for Chaturanga — a handful of classic openings, each annotated with the
// principle it teaches, framed in the game's dharma theme. Used by the coach (to name the
// opening being played) and by the Openings Trainer (to walk a line move-by-move).
//
// Each opening: { id, name, sub, idea, line: [{ san, by, note }] }.
// `san` is standard algebraic (chess.js), `by` is 'w' | 'b'.

export const OPENINGS = [
  {
    id: 'italian',
    name: 'Italian Game',
    sub: 'The Direct March',
    idea: 'Seize the centre and aim every piece at the enemy Raja. Fast, principled development.',
    line: [
      { san: 'e4', by: 'w', note: 'Claim the centre — plant your standard on the field of dharma.' },
      { san: 'e5', by: 'b', note: 'The enemy answers in kind; the centre is contested.' },
      { san: 'Nf3', by: 'w', note: 'The Ashva develops with a threat — every move should do work.' },
      { san: 'Nc6', by: 'b', note: 'Defend the pawn and develop toward the centre.' },
      { san: 'Bc4', by: 'w', note: 'The Gaja eyes f7, the weakest square by the enemy Raja.' },
      { san: 'Bc5', by: 'b', note: 'Mirror the bishop; symmetry is safe but demands accuracy.' },
      { san: 'c3', by: 'w', note: 'Prepare d4 — build a broad centre before you attack.' },
      { san: 'Nf6', by: 'b', note: 'Develop and strike back at e4 — do not stay passive.' },
    ],
  },
  {
    id: 'ruylopez',
    name: 'Ruy López',
    sub: 'Pressure the Defender',
    idea: 'Attack the piece that guards the centre. Long-term pressure over immediate gain.',
    line: [
      { san: 'e4', by: 'w', note: 'Occupy the centre.' },
      { san: 'e5', by: 'b', note: 'Stake an equal claim.' },
      { san: 'Nf3', by: 'w', note: 'Attack e5 and develop the Ashva.' },
      { san: 'Nc6', by: 'b', note: 'The knight defends e5.' },
      { san: 'Bb5', by: 'w', note: 'Pin pressure on the defender of e5 — undermine before you strike.' },
      { san: 'a6', by: 'b', note: 'Question the bishop at once — make it decide.' },
      { san: 'Ba4', by: 'w', note: 'Keep the pin; patience is a weapon.' },
      { san: 'Nf6', by: 'b', note: 'Counter-attack e4 and develop.' },
    ],
  },
  {
    id: 'sicilian',
    name: 'Sicilian Defence',
    sub: 'The Asymmetric Counter',
    idea: 'Refuse symmetry. Fight for the centre from the side and seek counterattack.',
    line: [
      { san: 'e4', by: 'w', note: 'White takes the centre.' },
      { san: 'c5', by: 'b', note: 'Answer on the flank — imbalance creates chances for both.' },
      { san: 'Nf3', by: 'w', note: 'Develop and prepare d4.' },
      { san: 'd6', by: 'b', note: 'Restrain e5, open the queen-bishop path.' },
      { san: 'd4', by: 'w', note: 'Strike the centre open.' },
      { san: 'cxd4', by: 'b', note: 'Capture — trade a flank pawn for a central one.' },
      { san: 'Nxd4', by: 'w', note: 'Recapture with a well-placed Ashva.' },
      { san: 'Nf6', by: 'b', note: 'Attack e4 and develop with tempo.' },
    ],
  },
  {
    id: 'french',
    name: 'French Defence',
    sub: 'The Patient Wall',
    idea: 'Build a solid chain, then break at the centre with ...d5. Endure, then counter.',
    line: [
      { san: 'e4', by: 'w', note: 'White claims the centre.' },
      { san: 'e6', by: 'b', note: 'A quiet step preparing ...d5 — set the terms of battle.' },
      { san: 'd4', by: 'w', note: 'Build the broad centre.' },
      { san: 'd5', by: 'b', note: 'Challenge e4 directly — the planned break.' },
      { san: 'Nc3', by: 'w', note: 'Defend e4 and develop.' },
      { san: 'Nf6', by: 'b', note: 'Pressure e4 again — pile on the point of tension.' },
      { san: 'e5', by: 'w', note: 'Advance and gain space; the position closes.' },
      { san: 'Nfd7', by: 'b', note: 'Reroute the knight to strike the pawn chain at its base.' },
    ],
  },
  {
    id: 'queensgambit',
    name: "Queen's Gambit",
    sub: 'The Offered Pawn',
    idea: 'Offer a wing pawn to dominate the centre. A gift with a purpose.',
    line: [
      { san: 'd4', by: 'w', note: 'Occupy the centre with the queen-pawn.' },
      { san: 'd5', by: 'b', note: 'Meet it head-on.' },
      { san: 'c4', by: 'w', note: 'Offer the c-pawn to deflect Black from the centre.' },
      { san: 'e6', by: 'b', note: 'Decline politely; reinforce d5 and free the bishop.' },
      { san: 'Nc3', by: 'w', note: 'Develop and add pressure to d5.' },
      { san: 'Nf6', by: 'b', note: 'Defend d5 and develop.' },
      { san: 'Bg5', by: 'w', note: 'Pin the knight — increase the pressure on d5.' },
      { san: 'Be7', by: 'b', note: 'Break the pin calmly; prepare to castle.' },
    ],
  },
  {
    id: 'kingsindian',
    name: "King's Indian Defence",
    sub: 'Yield, then Strike',
    idea: 'Let the enemy build a big centre, fianchetto the Gaja, then counter-attack it.',
    line: [
      { san: 'd4', by: 'w', note: 'White takes space.' },
      { san: 'Nf6', by: 'b', note: 'Develop first; do not commit the centre yet.' },
      { san: 'c4', by: 'w', note: 'Grab more space on the wing.' },
      { san: 'g6', by: 'b', note: 'Prepare to fianchetto — the Gaja will rake the long diagonal.' },
      { san: 'Nc3', by: 'w', note: 'Develop and support e4.' },
      { san: 'Bg7', by: 'b', note: 'The fianchettoed bishop guards the Raja and eyes the centre.' },
      { san: 'e4', by: 'w', note: 'Build the grand centre — exactly what Black invites.' },
      { san: 'd6', by: 'b', note: 'Restrain e5 and prepare the ...e5 break to strike the centre.' },
    ],
  },
];

export const openingById = (id) => OPENINGS.find((o) => o.id === id) || null;

// Identify the opening whose booked line best matches the SAN history played so far.
// Returns { opening, plies } for the longest matching prefix (>= 2 plies), else null.
export function detectOpening(sanHistory) {
  let best = null;
  for (const o of OPENINGS) {
    let n = 0;
    for (let i = 0; i < o.line.length && i < sanHistory.length; i++) {
      if (o.line[i].san === sanHistory[i]) n++; else break;
    }
    if (n >= 2 && (!best || n > best.plies)) best = { opening: o, plies: n };
  }
  return best;
}
