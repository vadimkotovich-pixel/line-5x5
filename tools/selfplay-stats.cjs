'use strict';

/**
 * Проверка качества компьютерного соперника: массовые партии бот-против-случайного
 * и бот-против-бота. Инструмент ничего не меняет — только измеряет и проверяет
 * инварианты (партии завершаются, ходы легальны, клетки не переиспользуются).
 *
 * Запуск: npm run stats
 */

const Rules = require('../assets/js/rules.js');
const AI = require('../assets/js/ai.js');

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function playGame(strategyX, strategyO, rng) {
  let state = Rules.createGame();
  let guard = 0;
  while (state.status === 'playing') {
    if ((guard += 1) > 100) throw new Error('партия не завершилась');
    const player = state.turn;
    const move = (player === 'X' ? strategyX : strategyO)(state, player, rng);
    if (move === null || !Rules.canPlay(state, move)) throw new Error('нелегальный ход бота');
    state = Rules.applyMove(state, move, player);
  }
  return state;
}

const bot = (state, player, rng) => AI.chooseMove(state, player, rng);
const randomPlayer = (state, player, rng) => {
  const cells = Rules.emptyCells(state);
  return cells[Math.floor(rng() * cells.length)];
};

function run(title, strategyX, strategyO, games, focus) {
  const rng = makeRng(20261005);
  const stats = { points: { X: 0, O: 0 }, wins: 0, draws: 0, losses: 0, moves: 0, blocked: 0, exhausted: 0 };
  for (let i = 0; i < games; i += 1) {
    const state = playGame(strategyX, strategyO, rng);
    const outcome = Rules.result(state);
    stats.points.X += outcome.scores.X;
    stats.points.O += outcome.scores.O;
    stats.moves += state.moves;
    stats.blocked += state.blocked.filter((cell) => cell !== null).length;
    if (state.exhausted) stats.exhausted += 1;
    if (outcome.winner === focus) stats.wins += 1;
    else if (outcome.winner === null) stats.draws += 1;
    else stats.losses += 1;
  }
  const per = (value) => (value / games).toFixed(2);
  console.log('\n' + title + ' (' + games + ' партий)');
  console.log('  очки в среднем за партию: бот ' + per(stats.points[focus]) + ' против ' + per(stats.points[focus === 'X' ? 'O' : 'X']));
  console.log('  итоги для бота: побед ' + stats.wins + ', ничьих ' + stats.draws + ', поражений ' + stats.losses);
  console.log('  ходов в партии в среднем: ' + per(stats.moves));
  console.log('  зачеркнутых клеток в среднем: ' + per(stats.blocked));
  console.log('  партий с исчерпанным полем: ' + stats.exhausted);
  return stats;
}

const vsRandom = run('Бот (X) против случайного игрока (O)', bot, randomPlayer, 300, 'X');
const vsRandomSecond = run('Случайный игрок (X) против бота (O)', randomPlayer, bot, 300, 'O');
const mirror = run('Бот против бота (зеркальная партия)', bot, bot, 300, 'X');

const randomPoints = vsRandom.points.O + vsRandomSecond.points.X;
const botPoints = vsRandom.points.X + vsRandomSecond.points.O;
console.log('\nИтог: бот ' + botPoints + ' : ' + randomPoints + ' случайный игрок');
console.log('Разница очков: ' + (botPoints - randomPoints));
console.log('Средняя доля зачеркнутого поля: ' + ((mirror.blocked / 300 / 25) * 100).toFixed(1) + '%');
