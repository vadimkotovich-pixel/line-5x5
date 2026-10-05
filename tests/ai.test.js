'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../assets/js/rules.js');
const AI = require('../assets/js/ai.js');

const IDX = (r, c) => r * Rules.SIZE + c;

/** Детерминированный ГПСЧ (LCG) — тесты не должны зависеть от Math.random. */
function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function scenario(placements, turn) {
  const state = Rules.createGame();
  for (const [index, player] of placements) state.cells[index] = player;
  state.turn = turn;
  return state;
}

/** Все клетки, ход в которые принесет игроку очки прямо сейчас. */
function scoringCells(state, player) {
  return Rules.emptyCells(state).filter((cell) => Rules.evaluateMove(state, cell, player).points > 0);
}

/** Случайная легальная позиция: сколько-то случайных ходов от пустого поля. */
function randomState(rng, plies) {
  let state = Rules.createGame();
  for (let i = 0; i < plies && state.status === 'playing'; i += 1) {
    const cells = Rules.emptyCells(state);
    const cell = cells[Math.floor(rng() * cells.length)];
    state = Rules.applyMove(state, cell, state.turn);
  }
  return state;
}

test('AC11: на пустом поле бот выбирает легальную клетку и начинает с центра', () => {
  const state = Rules.createGame();
  const move = AI.chooseMove(state, state.turn);
  assert.ok(Number.isInteger(move));
  assert.ok(Rules.canPlay(state, move), 'клетка свободна');
  assert.equal(move, IDX(2, 2), 'центр поля ценнее всего');
});

test('AC11: запрос хода не для того, чья сейчас очередь, возвращает null', () => {
  const state = Rules.createGame();
  assert.equal(state.turn, 'X');
  assert.equal(AI.chooseMove(state, 'O'), null, 'нельзя ходить за соперника');
});

test('AC11: бот возвращает null, когда ходить некуда', () => {
  const state = Rules.createGame();
  state.status = 'finished';
  assert.equal(AI.chooseMove(state, state.turn), null);
});

test('AC8: бот забирает свое очко, когда оно есть', () => {
  const state = scenario([[IDX(1, 0), 'O'], [IDX(1, 1), 'O'], [IDX(4, 4), 'X']], 'O');
  const move = AI.chooseMove(state, 'O', makeRng(1));
  assert.equal(move, IDX(1, 2), 'тройка в первом ряду');
  assert.equal(Rules.evaluateMove(state, move, 'O').points, 1);
});

test('AC8: бот забирает три очка, если собирает линию из пяти', () => {
  const state = scenario(
    [[IDX(0, 0), 'O'], [IDX(0, 1), 'O'], [IDX(0, 3), 'O'], [IDX(0, 4), 'O'], [IDX(4, 4), 'X']],
    'O'
  );
  const move = AI.chooseMove(state, 'O', makeRng(2));
  assert.equal(move, IDX(0, 2));
  assert.equal(Rules.evaluateMove(state, move, 'O').points, 3);
});

test('AC10: бот предпочитает два очка одному', () => {
  const state = scenario(
    [
      [IDX(2, 0), 'O'], [IDX(2, 1), 'O'], [IDX(0, 2), 'O'], [IDX(1, 2), 'O'],
      [IDX(4, 3), 'O'], [IDX(4, 4), 'O'],
      [IDX(4, 0), 'X'],
    ],
    'O'
  );
  assert.equal(Rules.evaluateMove(state, IDX(2, 2), 'O').points, 2, 'крест на два очка');
  assert.equal(Rules.evaluateMove(state, IDX(4, 2), 'O').points, 1, 'одиночное очко');
  const move = AI.chooseMove(state, 'O', makeRng(3));
  assert.equal(move, IDX(2, 2), 'взят двойной ход, а не один');
});

test('AC9: бот блокирует единственную тройку игрока, когда своего очка нет', () => {
  const state = scenario([[IDX(2, 0), 'X'], [IDX(2, 1), 'X']], 'O');
  assert.deepEqual(scoringCells(state, 'X'), [IDX(2, 2)], 'у игрока ровно одна угроза');
  assert.equal(Rules.bestPoints(state, 'O'), 0, 'своего очка у бота нет');
  const move = AI.chooseMove(state, 'O', makeRng(4));
  assert.equal(move, IDX(2, 2), 'угроза закрыта');
});

test('AC10: бот не меняет один свой пункт на два пункта игрока (крест)', () => {
  // Бот может взять 1 очко ходом в (4,2). Игрок после этого закроет крест в (2,2) на 2 очка.
  // Единственный ход, снимающий эти 2 очка, — сам (2,2).
  const state = scenario(
    [
      [IDX(4, 3), 'O'], [IDX(4, 4), 'O'],
      [IDX(2, 0), 'X'], [IDX(2, 1), 'X'], [IDX(0, 2), 'X'], [IDX(1, 2), 'X'],
    ],
    'O'
  );
  assert.equal(Rules.evaluateMove(state, IDX(4, 2), 'O').points, 1, 'свое очко доступно');
  assert.equal(Rules.evaluateMove(state, IDX(2, 2), 'X').points, 2, 'угроза игрока — 2 очка');
  const move = AI.chooseMove(state, 'O', makeRng(5));
  assert.equal(move, IDX(2, 2), 'выбрана защита, а не размен 1 на 2');
});

test('AC11: свойство безопасности — если у игрока одна угроза, а своего очка нет, бот закрывает ее', () => {
  const rng = makeRng(20261005);
  let checked = 0;
  for (let round = 0; round < 600; round += 1) {
    const state = randomState(rng, Math.floor(rng() * 12));
    if (state.status !== 'playing') continue;
    const me = state.turn;
    const foe = Rules.other(me);
    const threats = scoringCells(state, foe);
    if (threats.length !== 1) continue;
    if (Rules.bestPoints(state, me) !== 0) continue;
    checked += 1;
    const move = AI.chooseMove(state, me, rng);
    assert.equal(move, threats[0], 'позиция ' + JSON.stringify(state.cells));
  }
  assert.ok(checked > 10, 'свойство проверено на ' + checked + ' позициях');
});

test('AC8: свойство жадности — если угроз соперника нет, бот берет максимум своих очков', () => {
  const rng = makeRng(777);
  let checked = 0;
  for (let round = 0; round < 600; round += 1) {
    const state = randomState(rng, Math.floor(rng() * 14));
    if (state.status !== 'playing') continue;
    const me = state.turn;
    const foe = Rules.other(me);
    const mine = Rules.bestPoints(state, me);
    if (mine === 0) continue;
    if (scoringCells(state, foe).length !== 0) continue;
    checked += 1;
    const move = AI.chooseMove(state, me, rng);
    assert.equal(Rules.evaluateMove(state, move, me).points, mine, 'взят максимум очков');
  }
  assert.ok(checked > 10, 'свойство проверено на ' + checked + ' позициях');
});

test('AC11: 300 партий бот-против-бота завершаются, ходы всегда легальны', () => {
  for (let game = 0; game < 300; game += 1) {
    const rng = makeRng(1000 + game);
    let state = Rules.createGame();
    while (state.status === 'playing') {
      const player = state.turn;
      const move = AI.chooseMove(state, player, rng);
      assert.ok(Number.isInteger(move), 'бот вернул ход');
      assert.ok(Rules.canPlay(state, move), 'ход легален в партии ' + game);
      assert.equal(state.cells[move], null);
      assert.equal(state.blocked[move], null);
      const before = state;
      state = Rules.applyMove(state, move, player);
      assert.notEqual(state, before, 'ход принят');
    }
    assert.ok(state.moves <= 25, 'партия не длиннее поля, было ' + state.moves);
    assert.ok(Rules.result(state) !== null);
  }
});

test('AC11: бот обыгрывает случайного игрока по сумме очков', () => {
  const rng = makeRng(4242);
  let botPoints = 0;
  let randomPoints = 0;
  let botWins = 0;
  let randomWins = 0;

  for (let game = 0; game < 60; game += 1) {
    // Бот играет X и ходит первым в четных партиях, иначе играет O.
    const bot = game % 2 === 0 ? 'X' : 'O';
    let state = Rules.createGame();
    while (state.status === 'playing') {
      const player = state.turn;
      let move;
      if (player === bot) {
        move = AI.chooseMove(state, player, rng);
      } else {
        const cells = Rules.emptyCells(state);
        move = cells[Math.floor(rng() * cells.length)];
      }
      state = Rules.applyMove(state, move, player);
    }
    const outcome = Rules.result(state);
    botPoints += outcome.scores[bot];
    randomPoints += outcome.scores[Rules.other(bot)];
    if (outcome.winner === bot) botWins += 1;
    else if (outcome.winner !== null) randomWins += 1;
  }

  assert.ok(botPoints > randomPoints * 1.5, 'бот набрал ' + botPoints + ' против ' + randomPoints);
  assert.ok(botWins > randomWins * 2, 'побед бота ' + botWins + ' против ' + randomWins);
});

test('AC11: одинаковый seed дает одинаковую партию, разные seed — разные партии', () => {
  function play(seed) {
    const rng = makeRng(seed);
    let state = Rules.createGame();
    const moves = [];
    while (state.status === 'playing') {
      const move = AI.chooseMove(state, state.turn, rng);
      moves.push(move);
      state = Rules.applyMove(state, move, state.turn);
    }
    return moves.join(',');
  }
  assert.equal(play(99), play(99), 'детерминизм при том же seed');
  const games = new Set([97, 98, 99, 100, 101, 102].map(play));
  assert.ok(games.size > 1, 'партии не должны быть идентичными при разных seed');
});
