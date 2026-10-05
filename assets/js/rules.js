/**
 * «Линия 5x5» — правила игры. Ничего не знает о DOM и о браузере.
 *
 * Правила:
 *  - поле 5x5, игрок X ходит первым, ходы строго по очереди (очко не дает доп. хода);
 *  - три символа подряд по горизонтали, вертикали или диагонали = зачеркнутая линия = 1 очко;
 *  - линия длиной L >= 3 содержит L - 2 различных троек, то есть приносит L - 2 очка;
 *  - все клетки засчитанной линии блокируются навсегда: занять их больше нельзя;
 *  - партия кончается, когда свободных клеток нет или когда оставшиеся клетки уже
 *    не могут дать ни одной тройки ни одному игроку;
 *  - побеждает тот, у кого больше очков, при равенстве — ничья.
 *
 * Состояние иммутабельно: applyMove возвращает новое состояние, входное не меняется.
 * Это обязательно для просмотра «а что если» в боте.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TTT = Object.assign(root.TTT || {}, { Rules: api });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIZE = 5;
  const WIN = 3;
  const X = 'X';
  const O = 'O';
  const CELLS = SIZE * SIZE;
  const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  /** Все выровненные окна по WIN клеток внутри поля. Ровно 48 штук. */
  const LINES = (function buildLines() {
    const found = new Map();
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        for (const [dr, dc] of DIRECTIONS) {
          const cells = [];
          for (let k = 0; k < WIN; k += 1) {
            const rr = r + dr * k;
            const cc = c + dc * k;
            if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) {
              cells.length = 0;
              break;
            }
            cells.push(rr * SIZE + cc);
          }
          // Одно и то же окно приходит из обоих концов, поэтому дедуплицируем по набору клеток.
          if (cells.length === WIN) found.set(cells.slice().sort((a, b) => a - b).join(','), cells);
        }
      }
    }
    return [...found.values()];
  })();

  /** Клетка -> окна, которые через нее проходят. */
  const LINES_THROUGH = (function buildIndex() {
    const index = new Array(CELLS).fill(null).map(() => []);
    LINES.forEach((line) => line.forEach((cell) => index[cell].push(line)));
    return index;
  })();

  function other(player) {
    return player === X ? O : X;
  }

  function createGame() {
    return {
      size: SIZE,
      win: WIN,
      cells: new Array(CELLS).fill(null),
      blocked: new Array(CELLS).fill(null),
      scores: { X: 0, O: 0 },
      turn: X,
      status: 'playing',
      moves: 0,
      lastMove: null,
      exhausted: false,
    };
  }

  function clone(state) {
    return {
      size: state.size,
      win: state.win,
      cells: state.cells.slice(),
      blocked: state.blocked.slice(),
      scores: { X: state.scores.X, O: state.scores.O },
      turn: state.turn,
      status: state.status,
      moves: state.moves,
      lastMove: state.lastMove,
      exhausted: state.exhausted,
    };
  }

  /** Соседняя клетка в направлении (dr, dc) или -1 за границей. */
  function step(index, dr, dc) {
    const r = Math.floor(index / SIZE) + dr;
    const c = (index % SIZE) + dc;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
    return r * SIZE + c;
  }

  function isFree(state, index) {
    return (
      Number.isInteger(index) &&
      index >= 0 &&
      index < state.cells.length &&
      state.cells[index] === null &&
      state.blocked[index] === null
    );
  }

  function canPlay(state, index) {
    return state.status === 'playing' && isFree(state, index);
  }

  function emptyCells(state) {
    const out = [];
    for (let i = 0; i < state.cells.length; i += 1) {
      if (isFree(state, i)) out.push(i);
    }
    return out;
  }

  /**
   * Что даст ход в клетку index игроком player: очки, засчитанные линии и клетки,
   * которые будут заблокированы. Состояние не меняется.
   */
  function evaluateMove(state, index, player) {
    if (!isFree(state, index)) return { legal: false, points: 0, lines: [], blockedCells: [] };

    const runs = [];
    for (const [dr, dc] of DIRECTIONS) {
      const run = [index];
      let cursor = step(index, -dr, -dc);
      while (cursor !== -1 && state.cells[cursor] === player) {
        run.unshift(cursor);
        cursor = step(cursor, -dr, -dc);
      }
      cursor = step(index, dr, dc);
      while (cursor !== -1 && state.cells[cursor] === player) {
        run.push(cursor);
        cursor = step(cursor, dr, dc);
      }
      if (run.length >= WIN) runs.push(run);
    }

    const lines = [];
    const blockedSet = new Set();
    for (const run of runs) {
      for (let start = 0; start + WIN <= run.length; start += 1) {
        const line = run.slice(start, start + WIN);
        lines.push(line);
        for (const cell of line) blockedSet.add(cell);
      }
    }

    return {
      legal: true,
      points: lines.length,
      lines,
      blockedCells: [...blockedSet].sort((a, b) => a - b),
    };
  }

  /** Статус линии: мертвая (есть блокировка или символы обоих игроков) либо живая. */
  function lineStatus(state, line) {
    let owner = null;
    let empty = 0;
    for (const cell of line) {
      if (state.blocked[cell] !== null) return { dead: true, owner: null, empty: 0 };
      const value = state.cells[cell];
      if (value === null) empty += 1;
      else if (owner === null) owner = value;
      else if (owner !== value) return { dead: true, owner: null, empty: 0 };
    }
    return { dead: false, owner, empty };
  }

  /** Может ли на поле появиться хотя бы одна новая тройка. */
  function hasPotential(state) {
    return LINES.some((line) => {
      const status = lineStatus(state, line);
      return !status.dead && status.empty > 0;
    });
  }

  /** Новое состояние после хода. Некорректный ход возвращает то же состояние без изменений. */
  function applyMove(state, index, player) {
    if (state.status !== 'playing') return state;
    if (player !== state.turn) return state;
    if (!canPlay(state, index)) return state;

    const evaluation = evaluateMove(state, index, player);
    const next = clone(state);
    next.cells[index] = player;
    next.scores[player] += evaluation.points;

    for (const cell of evaluation.blockedCells) {
      next.cells[cell] = null;
      next.blocked[cell] = player;
    }

    next.moves += 1;
    next.lastMove = {
      index,
      player,
      points: evaluation.points,
      lines: evaluation.lines,
      blockedCells: evaluation.blockedCells,
    };
    next.turn = other(player);

    if (emptyCells(next).length === 0) next.status = 'finished';
    else if (!hasPotential(next)) {
      next.status = 'finished';
      next.exhausted = true;
    }
    return next;
  }

  /** Максимум очков, которые игрок может взять прямо сейчас. */
  function bestPoints(state, player) {
    let best = 0;
    for (const cell of emptyCells(state)) {
      const points = evaluateMove(state, cell, player).points;
      if (points > best) best = points;
    }
    return best;
  }

  /** Итог завершенной партии или null, пока партия идет. */
  function result(state) {
    if (state.status !== 'finished') return null;
    const scores = { X: state.scores.X, O: state.scores.O };
    if (scores.X === scores.O) return { winner: null, draw: true, scores };
    return { winner: scores.X > scores.O ? X : O, draw: false, scores };
  }

  /** Клетка по строке и столбцу — для разметки и тестов. */
  function toIndex(row, col) {
    return row * SIZE + col;
  }

  return {
    SIZE,
    WIN,
    X,
    O,
    CELLS,
    DIRECTIONS,
    LINES,
    LINES_THROUGH,
    createGame,
    clone,
    other,
    isFree,
    canPlay,
    emptyCells,
    evaluateMove,
    lineStatus,
    hasPotential,
    applyMove,
    bestPoints,
    result,
    toIndex,
  };
});
