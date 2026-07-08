// Web Worker: runs the AI search off the render thread so the board stays smooth on phones.
// Falls back to a main-thread call in board3d.js if module workers are unavailable.
import { bestMove } from './engine.js';
import { hint, reviewMove } from './coach.js';

self.onmessage = (e) => {
  const { id, kind, fen, level, move } = e.data || {};
  try {
    let result;
    if (kind === 'hint') result = hint(fen, level);
    else if (kind === 'review') result = reviewMove(fen, move, { depth: 3, maxMs: 700 });
    else result = bestMove(fen, level);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
