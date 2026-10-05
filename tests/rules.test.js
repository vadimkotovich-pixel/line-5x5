'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../assets/js/rules.js');

const SIZE = 5;
const IDX = (r, c) => r * SIZE + c;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** Собирает состояние с заранее расставленными символами (тестовый шорткат). */
function scenario(placements, turn) {
  const state = Rules.createGame();
  for (const [index, player] of placements) state.cells[index] = player;
  state.turn = turn;
  return state;
}

/** Блокирует все клетки, кроме перечисленных. */
function blockAllExcept(state, free) {
  const keep = new Set(free);
  for (let i = 0; i < state.cells.length; i++) {
    if (!keep.has(i)) state.blocked[i] = 'X';
  }
  return state;
}

/**
 * НЕЗАВИСИМАЯ реализация подсчета: полное сканирование поля по четырем
 * направлениям, без опоры на код rules.js. Считает, сколько очков лежит на
 * поле для игрока прямо сейчас (линия длиной L дает L - 2 очка).
 */
function bruteForcePoints(cells, player) {
  let points = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of DIRS) {
        const pr = r - dr;
        const pc = c - dc;
        const prevInside = pr >= 0 && pr < SIZE && pc >= 0 && pc < SIZE;
        if (prevInside && cells[pr * SIZE + pc] === player) continue; // не начало серии
        if (cells[r * SIZE + c] !== player) continue;
        let len = 0;
        let rr = r;
        let cc = c;
        while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && cells[rr * SIZE + cc] === player) {
          len += 1;
          rr += dr;
          cc += dc;
        }
        if (len >= Rules.WIN) points += len - Rules.WIN + 1;
      }
    }
  }
  return points;
}

test('AC1: новая партия — поле 5x5, ноль очков, ход игрока', () => {
  const state = Rules.createGame();
  assert.equal(state.size, 5);
  assert.equal(state.cells.length, 25);
  assert.ok(state.cells.every((cell) => cell === null));
  assert.ok(state.blocked.every((cell) => cell === null));
  assert.deepEqual(state.scores, { X: 0, O: 0 });
  assert.equal(state.turn, Rules.X);
  assert.equal(state.status, 'playing');
  assert.equal(state.moves, 0);
});

test('AC2: существует ровно 48 различных окон по три клетки, все выровнены', () => {
  assert.equal(Rules.LINES.length, 48);
  const keys = new Set();
  for (const line of Rules.LINES) {
    assert.equal(line.length, 3);
    keys.add(line.join(','));
    const [a, b, c] = line.map((i) => [Math.floor(i / SIZE), i % SIZE]);
    const dr = b[0] - a[0];
    const dc = b[1] - a[1];
    assert.ok(Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr !== 0 || dc !== 0), 'линия выровнена');
    assert.deepEqual([b[0] + dr, b[1] + dc], c, 'клетки идут подряд');
  }
  assert.equal(keys.size, 48, 'окна не повторяются');
});

test('AC2: число окон, проходящих через клетку, зависит от ее позиции', () => {
  assert.equal(Rules.LINES_THROUGH[IDX(2, 2)].length, 12, 'центр: 3 окна в каждом из 4 направлений');
  assert.equal(Rules.LINES_THROUGH[IDX(1, 1)].length, 7, 'около центра: 2+2+2+1');
  assert.equal(Rules.LINES_THROUGH[IDX(0, 0)].length, 3, 'угол: 1+1+1');
  assert.equal(Rules.LINES_THROUGH[IDX(0, 1)].length, 4, 'край: 2 по горизонтали + 1 + 1');
  assert.equal(Rules.LINES_THROUGH[IDX(2, 4)].length, 6, 'середина правого края: 1+3+1+1');
});

test('AC2: тройка по горизонтали дает 1 очко и зачеркивает три клетки', () => {
  const state = scenario([[IDX(0, 0), 'X'], [IDX(0, 1), 'X']], 'X');
  const evaluation = Rules.evaluateMove(state, IDX(0, 2), 'X');
  assert.equal(evaluation.points, 1);
  assert.deepEqual(evaluation.blockedCells, [IDX(0, 0), IDX(0, 1), IDX(0, 2)]);

  const next = Rules.applyMove(state, IDX(0, 2), 'X');
  assert.equal(next.scores.X, 1);
  assert.deepEqual(next.blocked.slice(0, 3), ['X', 'X', 'X']);
  assert.ok(next.cells.slice(0, 3).every((cell) => cell === null), 'символы сняты с поля');
  assert.equal(next.lastMove.points, 1);
  assert.equal(next.turn, 'O');
});

test('AC2: тройки по вертикали и по обеим диагоналям', () => {
  const vertical = scenario([[IDX(0, 3), 'O'], [IDX(1, 3), 'O']], 'O');
  assert.equal(Rules.evaluateMove(vertical, IDX(2, 3), 'O').points, 1);

  const diagDown = scenario([[IDX(0, 0), 'X'], [IDX(1, 1), 'X']], 'X');
  assert.equal(Rules.evaluateMove(diagDown, IDX(2, 2), 'X').points, 1);

  const diagUp = scenario([[IDX(2, 0), 'X'], [IDX(1, 1), 'X']], 'X');
  assert.equal(Rules.evaluateMove(diagUp, IDX(0, 2), 'X').points, 1);

  const diagUpEnd = scenario([[IDX(4, 0), 'X'], [IDX(3, 1), 'X']], 'X');
  assert.equal(Rules.evaluateMove(diagUpEnd, IDX(2, 2), 'X').points, 1);
});

test('AC3: линия из четырех клеток дает 2 очка, из пяти — 3', () => {
  const four = scenario([[IDX(0, 0), 'X'], [IDX(0, 1), 'X'], [IDX(0, 2), 'X']], 'X');
  const fourEval = Rules.evaluateMove(four, IDX(0, 3), 'X');
  assert.equal(fourEval.points, 2);
  assert.deepEqual(fourEval.blockedCells, [IDX(0, 0), IDX(0, 1), IDX(0, 2), IDX(0, 3)]);

  const five = scenario([[IDX(4, 0), 'O'], [IDX(4, 1), 'O'], [IDX(4, 2), 'O'], [IDX(4, 3), 'O']], 'O');
  const fiveEval = Rules.evaluateMove(five, IDX(4, 4), 'O');
  assert.equal(fiveEval.points, 3);
  assert.equal(fiveEval.blockedCells.length, 5);
});

test('AC3: пересечение двух линий в одной клетке дает 2 очка', () => {
  const state = scenario([[IDX(2, 0), 'X'], [IDX(2, 1), 'X'], [IDX(0, 2), 'X'], [IDX(1, 2), 'X']], 'X');
  const evaluation = Rules.evaluateMove(state, IDX(2, 2), 'X');
  assert.equal(evaluation.points, 2);
  assert.equal(evaluation.lines.length, 2);
  assert.deepEqual(evaluation.blockedCells, [IDX(0, 2), IDX(1, 2), IDX(2, 0), IDX(2, 1), IDX(2, 2)]);
});

test('AC4: зачеркнутые клетки заблокированы навсегда и не принимают ходы', () => {
  let state = scenario([[IDX(1, 0), 'X'], [IDX(1, 1), 'X']], 'X');
  state = Rules.applyMove(state, IDX(1, 2), 'X');
  for (let c = 0; c < 3; c++) {
    const cell = IDX(1, c);
    assert.equal(Rules.canPlay(state, cell), false, 'клетка ' + cell + ' закрыта');
    assert.equal(Rules.applyMove(state, cell, state.turn), state, 'ход в закрытую клетку невозможен');
    assert.equal(state.blocked[cell], 'X');
    assert.equal(state.cells[cell], null);
  }
  assert.ok(Rules.emptyCells(state).every((cell) => state.blocked[cell] === null));
});

test('AC4: занятая клетка не принимает повторный ход, не свой ход — отклоняется', () => {
  const state = Rules.createGame();
  const afterX = Rules.applyMove(state, IDX(0, 0), 'X');
  assert.equal(afterX.cells[IDX(0, 0)], 'X');
  assert.equal(Rules.applyMove(afterX, IDX(0, 0), 'O'), afterX, 'клетка занята');
  assert.equal(Rules.applyMove(afterX, IDX(1, 1), 'X'), afterX, 'не свой ход');
  assert.equal(Rules.applyMove(afterX, IDX(-1), 'O'), afterX, 'индекс вне поля');
  assert.equal(Rules.applyMove(afterX, 25, 'O'), afterX, 'индекс вне поля');
  assert.equal(Rules.applyMove(afterX, 2.5, 'O'), afterX, 'нецелый индекс');
});

test('AC5: ход не меняет исходное состояние (иммутабельность)', () => {
  const state = scenario([[IDX(3, 0), 'X'], [IDX(3, 1), 'X']], 'X');
  const snapshotCells = state.cells.slice();
  const snapshotBlocked = state.blocked.slice();
  const snapshotScores = { ...state.scores };
  const next = Rules.applyMove(state, IDX(3, 2), 'X');
  assert.notEqual(next, state);
  assert.deepEqual(state.cells, snapshotCells);
  assert.deepEqual(state.blocked, snapshotBlocked);
  assert.deepEqual(state.scores, snapshotScores);
  assert.equal(state.status, 'playing');
  assert.equal(state.moves, 0);
});

test('AC5: очки накапливаются в течение партии', () => {
  let state = Rules.createGame();
  const script = [
    [IDX(0, 0), 'X'], [IDX(2, 2), 'O'],
    [IDX(0, 1), 'X'], [IDX(2, 3), 'O'],
    [IDX(0, 2), 'X'], [IDX(2, 4), 'O'],
  ];
  for (const [index, player] of script) {
    assert.equal(state.turn, player, 'ожидался ход ' + player);
    state = Rules.applyMove(state, index, player);
  }
  assert.equal(state.scores.X, 1, 'тройка X в первом ряду');
  assert.equal(state.scores.O, 1, 'тройка O в третьем ряду');
  assert.equal(state.moves, 6);
});

test('AC6: партия завершается, когда свободных клеток не осталось', () => {
  const state = scenario([], 'X');
  blockAllExcept(state, []);
  const next = Rules.applyMove(state, 0, 'X');
  assert.equal(next, state, 'ходить некуда');
});

test('AC6: партия завершается, когда троек больше не может быть', () => {
  const state = blockAllExcept(Rules.createGame(), [IDX(0, 0), IDX(0, 4), IDX(4, 4)]);
  assert.equal(Rules.hasPotential(state), false, 'все линии перекрыты');
  const next = Rules.applyMove(state, IDX(0, 0), 'X');
  assert.equal(next.status, 'finished');
  assert.equal(next.exhausted, true);
  assert.equal(next.scores.X, 0);
  assert.deepEqual(Rules.emptyCells(next), [IDX(0, 4), IDX(4, 4)]);
});

test('AC6: hasPotential различает мертвую, смешанную и живую линию', () => {
  const dead = scenario([[IDX(0, 0), 'X'], [IDX(0, 1), 'O']], 'X');
  assert.equal(Rules.lineStatus(dead, [IDX(0, 0), IDX(0, 1), IDX(0, 2)]).dead, true, 'смешанная линия мертва');

  const blocked = scenario([], 'X');
  blocked.blocked[IDX(0, 1)] = 'O';
  assert.equal(Rules.lineStatus(blocked, [IDX(0, 0), IDX(0, 1), IDX(0, 2)]).dead, true, 'заблокированная мертва');

  const alive = scenario([[IDX(0, 0), 'X']], 'X');
  const status = Rules.lineStatus(alive, [IDX(0, 0), IDX(0, 1), IDX(0, 2)]);
  assert.equal(status.dead, false);
  assert.equal(status.owner, 'X');
  assert.equal(status.empty, 2);

  assert.equal(Rules.hasPotential(Rules.createGame()), true, 'пустое поле живо');
});

test('AC7: победитель определяется по очкам, равенство — ничья', () => {
  const win = Rules.createGame();
  win.status = 'finished';
  win.scores = { X: 3, O: 1 };
  assert.deepEqual(Rules.result(win), { winner: 'X', draw: false, scores: { X: 3, O: 1 } });

  const lose = Rules.createGame();
  lose.status = 'finished';
  lose.scores = { X: 0, O: 2 };
  assert.equal(Rules.result(lose).winner, 'O');

  const draw = Rules.createGame();
  draw.status = 'finished';
  draw.scores = { X: 2, O: 2 };
  assert.deepEqual(Rules.result(draw), { winner: null, draw: true, scores: { X: 2, O: 2 } });

  assert.equal(Rules.result(Rules.createGame()), null, 'партия идет — результата нет');
});

test('AC5/AC6: полная партия «первая свободная клетка» — инварианты на каждом ходу', () => {
  let state = Rules.createGame();
  let awarded = 0;
  let safety = 0;

  while (state.status === 'playing' && safety < 200) {
    safety += 1;
    const player = state.turn;
    const index = Rules.emptyCells(state)[0];
    assert.notEqual(index, undefined, 'есть куда ходить, пока партия идет');

    // До хода на поле не должно быть неучтенных линий у обоих игроков.
    assert.equal(bruteForcePoints(state.cells, 'X'), 0);
    assert.equal(bruteForcePoints(state.cells, 'O'), 0);

    const probe = state.cells.slice();
    probe[index] = player;
    const expected = bruteForcePoints(probe, player);

    const next = Rules.applyMove(state, index, player);
    assert.notEqual(next, state, 'ход принят');
    assert.equal(next.lastMove.points, expected, 'очки за ход совпали с независимым подсчетом');
    awarded += next.lastMove.points;
    assert.equal(next.scores[player], awarded - next.scores[Rules.other(player)]);
    assert.equal(next.scores.X + next.scores.O, awarded, 'сумма очков равна числу засчитанных линий');

    // Клетка не может быть одновременно занята и заблокирована.
    for (let i = 0; i < next.cells.length; i++) {
      assert.ok(!(next.cells[i] !== null && next.blocked[i] !== null), 'клетка ' + i + ' занята и заблокирована');
    }
    // Заблокированных клеток не больше, чем 3 на каждую засчитанную линию.
    const blockedCount = next.blocked.filter((v) => v !== null).length;
    assert.ok(blockedCount <= 3 * awarded, 'блокировок не больше 3 на линию');

    state = next;
  }

  assert.equal(state.status, 'finished', 'партия завершилась');
  assert.ok(safety < 200, 'партия не зациклилась');
  assert.ok(state.scores.X + state.scores.O > 0, 'на 5x5 партия не может закончиться без очков');
});

test('AC6: 300 партий «первая свободная клетка» всегда завершаются корректно', () => {
  for (let game = 0; game < 300; game++) {
    let state = Rules.createGame();
    let guard = 0;
    while (state.status === 'playing' && guard < 100) {
      guard += 1;
      const cells = Rules.emptyCells(state);
      const index = cells[Math.floor(Math.random() * cells.length)];
      const player = state.turn;
      const probe = state.cells.slice();
      probe[index] = player;
      const expected = bruteForcePoints(probe, player);
      state = Rules.applyMove(state, index, player);
      assert.equal(state.lastMove.points, expected);
    }
    assert.equal(state.status, 'finished');
    assert.ok(state.moves <= 25, 'не больше 25 ходов, было ' + state.moves);
    assert.ok(Rules.result(state) !== null);
  }
});
