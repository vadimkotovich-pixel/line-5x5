/**
 * «Линия 5x5» — компьютерный соперник, уровень «средний».
 *
 * Идея: один ход вперед, но честный. Для каждой свободной клетки считаем
 *
 *     ценность = 1000 * (свои очки за ход - лучший ответ соперника) + позиция + шум
 *
 * Три слагаемых решают три разные задачи:
 *  1. «свои очки за ход» — забираем линию, если она есть;
 *  2. «минус лучший ответ соперника» — защита. Именно поэтому бот НЕ меняет свое
 *     1 очко на 2 очка соперника: такой размен дает 1000*(-1) = -1000, а спокойная
 *     защита дает 0. Простая формула «сначала свое, потом блок» эту ловушку не ловит;
 *  3. «позиция» — тай-брейк, когда немедленный размен одинаков. Ограничена сверху
 *     (< 1 очка), чтобы никогда не перевесить реальное очко.
 *
 * Шум меньше единицы: он перемешивает только полностью равные варианты, поэтому
 * партии не повторяются, но качество игры не страдает.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rules.js'));
  } else {
    root.TTT = root.TTT || {};
    root.TTT.AI = factory(root.TTT.Rules);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Rules) {
  'use strict';

  const SIZE = Rules.SIZE;
  const POINT_WEIGHT = 1000; // вес одного очка в немедленном размене
  const POSITION_CAP = 90; // позиционная оценка строго меньше одного очка
  const JITTER = 0.9; // случайность только внутри равных по ценности ходов

  /**
   * Насколько клетка хороша сама по себе: близость к центру плюс участие в живых
   * линиях (свои символы — атака, символы соперника — ценность блокировки).
   */
  function positionalValue(state, index, player) {
    const foe = Rules.other(player);
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const center = SIZE - 1 - Math.abs(row - (SIZE - 1) / 2) + (SIZE - 1 - Math.abs(col - (SIZE - 1) / 2));

    let score = center;
    for (const line of Rules.LINES_THROUGH[index]) {
      if (Rules.lineStatus(state, line).dead) continue;
      let own = 0;
      let opposite = 0;
      for (const cell of line) {
        const value = state.cells[cell];
        if (value === player) own += 1;
        else if (value === foe) opposite += 1;
      }
      score += own * own * 3 + opposite * opposite * 2;
    }
    return Math.min(score, POSITION_CAP);
  }

  /**
   * Лучший ход для игрока player (по умолчанию — того, чья сейчас очередь).
   * rng подменяется в тестах для детерминизма. Возвращает null, если ходить некуда.
   */
  function chooseMove(state, player, rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const me = player || state.turn;
    if (state.status !== 'playing') return null;
    if (me !== state.turn) return null;

    const cells = Rules.emptyCells(state);
    if (cells.length === 0) return null;

    const foe = Rules.other(me);
    const mineNow = state.scores[me];
    let bestCell = cells[0];
    let bestValue = -Infinity;

    for (const cell of cells) {
      const after = Rules.applyMove(state, cell, me);
      const gained = after.scores[me] - mineNow;
      const conceded = Rules.bestPoints(after, foe);
      const value =
        POINT_WEIGHT * (gained - conceded) + positionalValue(state, cell, me) + random() * JITTER;

      if (value > bestValue) {
        bestValue = value;
        bestCell = cell;
      }
    }
    return bestCell;
  }

  return {
    chooseMove,
    positionalValue,
    POINT_WEIGHT,
    POSITION_CAP,
  };
});
