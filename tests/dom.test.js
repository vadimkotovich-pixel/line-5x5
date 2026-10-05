'use strict';

/**
 * End-to-end проверка интерфейса в настоящем DOM (jsdom): страница загружается,
 * скрипты выполняются, партия играется кликами. Это единственный тест, который
 * проверяет ui.js в работе, а не только его контракт с разметкой.
 *
 * Таймеры подменены очередью, поэтому «ход компьютера» не занимает реального
 * времени, а отмена таймера (новая партия во время раздумья) проверяется честно.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const htmlSource = read('index.html');
const scripts = ['assets/js/rules.js', 'assets/js/ai.js', 'assets/js/ui.js'].map(read);

function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Поднимает страницу в jsdom и возвращает окружение с очередью таймеров. */
async function boot() {
  const html = htmlSource.replace(/<script src="[^"]*"><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  for (const source of scripts) window.eval(source);

  // ui.js стартует по DOMContentLoaded, который jsdom доставляет асинхронно.
  for (let tick = 0; tick < 200 && !(window.TTT.ui && window.TTT.ui.instance); tick += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (!window.TTT.ui || !window.TTT.ui.instance) {
    throw new Error('ui.js не стартовал, readyState=' + window.document.readyState);
  }

  const timers = new Map();
  let nextTimerId = 0;
  window.setTimeout = (fn, delay) => {
    nextTimerId += 1;
    timers.set(nextTimerId, { fn, delay });
    return nextTimerId;
  };
  window.clearTimeout = (id) => {
    timers.delete(id);
  };

  const instance = window.TTT.ui.instance;
  const $ = (id) => window.document.getElementById(id);
  const board = $('board');
  const cells = [...board.children];

  /** Выполняет отложенные колбэки (ход компьютера, всплывашка очков). */
  function settle() {
    let guard = 0;
    while (timers.size > 0) {
      if ((guard += 1) > 100) throw new Error('таймеры не заканчиваются');
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.fn();
    }
  }

  return {
    window,
    document: window.document,
    instance,
    board,
    cells,
    timers,
    settle,
    $,
    state: () => instance.getState(),
    click: (index) => cells[index].click(),
    visibleCells: () => cells.filter((cell) => cell.dataset.state !== 'empty').length,
  };
}

test('DOM: страница загружается, поле и мини-схемы собираются скриптом', async () => {
  const env = await boot();
  assert.ok(env.instance, 'ui.js стартовал сам, без вызова извне');
  assert.equal(env.board.children.length, 25, '25 клеток');
  assert.equal(env.board.getAttribute('role'), 'group');
  assert.equal(env.board.getAttribute('aria-busy'), 'false');

  const tabbable = env.cells.filter((cell) => cell.tabIndex === 0);
  assert.equal(tabbable.length, 1, 'в поле ровно одна точка входа для Tab');
  assert.equal(tabbable[0].dataset.index, '12', 'вход по Tab — через центр');

  for (const cell of env.cells) {
    assert.equal(cell.tagName, 'BUTTON', 'клетка — настоящая кнопка');
    assert.equal(cell.getAttribute('role'), null, 'роль кнопки достаточна, ARIA не нужна');
    assert.match(cell.getAttribute('aria-label'), /^Строка \d, столбец \d/);
    assert.equal(cell.querySelector('.cell__mark').getAttribute('aria-hidden'), 'true');
  }

  const minis = [...env.document.querySelectorAll('[data-mini]')];
  assert.equal(minis.length, 4, 'три схемы в правилах и одна в таблице очков');
  for (const mini of minis) {
    assert.equal(mini.children.length, 25, 'мини-схема тоже 5x5');
  }
  const first = minis[0];
  assert.equal(first.children[11].dataset.mark, 'x');
  assert.equal(first.children[0].dataset.mark, 'o');
  assert.equal(first.children[2].dataset.mark, undefined);
  assert.equal(env.document.querySelectorAll('.mini__cell[data-mark="b"]').length, 3, 'зачеркнутая тройка');

  // Схема «крест» в таблице: горизонталь и вертикаль через общую клетку.
  const cross = minis[3];
  const crossMarks = [...cross.children].map((cell) => cell.dataset.mark);
  assert.equal(crossMarks.filter((mark) => mark === 'x').length, 5);
  assert.equal(crossMarks[12], 'x', 'общая клетка креста');
  assert.equal(crossMarks[10], 'x');
  assert.equal(crossMarks[2], 'x');
});

test('DOM: стартовое состояние страницы', async () => {
  const env = await boot();
  assert.equal(env.$('score-x').textContent, '0');
  assert.equal(env.$('score-o').textContent, '0');
  assert.equal(env.$('cells-left').textContent, '25');
  assert.equal(env.$('round').textContent, 'Партия № 1');
  assert.equal(env.$('board-overlay').hidden, true);
  assert.equal(env.$('status').textContent, 'Ваш ход: поставьте ✕ на поле.');
  assert.ok(env.$('score-card-x').classList.contains('is-active'), 'ход игрока подсвечен');
  assert.ok(!env.$('score-card-o').classList.contains('is-active'));
});

test('DOM: ход игрока, пауза на «раздумье» и ответ компьютера', async () => {
  const env = await boot();
  env.click(12);

  let state = env.state();
  assert.equal(state.moves, 1);
  assert.equal(state.cells[12], 'X');
  assert.equal(env.cells[12].dataset.state, 'x');
  assert.equal(env.cells[12].querySelector('.cell__mark').textContent, '✕');
  assert.ok(env.cells[12].classList.contains('is-new'), 'новый знак анимируется');
  assert.equal(env.$('cells-left').textContent, '24');
  assert.match(env.cells[12].getAttribute('aria-label'), /ваш знак ✕$/);

  // Пока компьютер «думает», поле заблокировано для ввода.
  assert.ok(env.board.classList.contains('is-busy'));
  assert.equal(env.board.getAttribute('aria-busy'), 'true');
  assert.equal(env.$('status').textContent, 'Компьютер думает…');
  assert.ok(env.$('score-card-o').classList.contains('is-active'));
  assert.equal(env.timers.size, 1, 'ход компьютера запланирован');
  env.click(13);
  assert.equal(env.state().moves, 1, 'во время хода компьютера поле не принимает ходы');

  env.settle();
  state = env.state();
  assert.equal(state.moves, 2, 'компьютер сходил');
  assert.equal(state.turn, 'X');
  assert.ok(!env.board.classList.contains('is-busy'));
  assert.equal(env.board.getAttribute('aria-busy'), 'false');
  assert.equal(env.$('status').textContent, 'Компьютер походил. Ваш ход.');
  const machineCells = env.cells.filter((cell) => cell.dataset.state === 'o');
  assert.equal(machineCells.length, 1, 'ровно один знак компьютера');
  assert.equal(machineCells[0].querySelector('.cell__mark').textContent, '○');
  assert.equal(machineCells[0].getAttribute('aria-disabled'), 'true');
});

test('DOM: клавиатура перемещает фокус по сетке', async () => {
  const env = await boot();
  const key = (k) =>
    env.board.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: k, bubbles: true }));

  key('ArrowRight');
  assert.equal(env.document.activeElement, env.cells[13], 'фокус вправо');
  key('ArrowDown');
  assert.equal(env.document.activeElement, env.cells[18], 'фокус вниз');
  key('ArrowRight');
  key('ArrowRight');
  assert.equal(env.document.activeElement, env.cells[15], 'фокус переходит на новую строку');
  key('ArrowUp');
  assert.equal(env.document.activeElement, env.cells[10], 'фокус вверх');
  key('End');
  assert.equal(env.document.activeElement, env.cells[14], 'End — в конец строки');
  key('Home');
  assert.equal(env.document.activeElement, env.cells[10], 'Home — в начало строки');
  key('ArrowLeft');
  assert.equal(env.document.activeElement, env.cells[14], 'фокус переходит на предыдущую строку');

  assert.equal(env.cells.filter((cell) => cell.tabIndex === 0).length, 1, 'точка входа по Tab одна');
  assert.equal(env.document.activeElement.tabIndex, 0);
});

test('DOM: партия играется до конца, интерфейс синхронен с правилами', async () => {
  const env = await boot();
  const rng = makeRng(31337);
  const Rules = env.window.TTT.Rules;
  const AI = env.window.TTT.AI;

  let guard = 0;
  let checkedDeadCell = false;
  let sawScoredFlash = false;
  let sawScorePop = false;

  while (env.state().status === 'playing') {
    assert.ok((guard += 1) < 40, 'партия не зациклилась');
    const before = env.state();
    const index = AI.chooseMove(before, before.turn, rng);
    assert.ok(Number.isInteger(index), 'у игрока есть ход');

    env.click(index);
    const after = env.state();
    assert.equal(after.moves, before.moves + 1, 'клик принят');
    assert.equal(after.lastMove.index, index);
    if (after.lastMove.points > 0) {
      // Засчитанный ход сразу уходит в зачеркнутые клетки.
      assert.equal(after.blocked[index], 'X');
      assert.equal(after.cells[index], null);
    } else {
      assert.equal(after.cells[index], 'X');
    }

    // Интерфейс обязан совпадать с состоянием партии.
    assert.equal(env.$('score-x').textContent, String(after.scores.X));
    assert.equal(env.$('score-o').textContent, String(after.scores.O));
    assert.equal(env.$('cells-left').textContent, String(Rules.emptyCells(after).length));
    assert.equal(
      env.visibleCells(),
      25 - Rules.emptyCells(after).length,
      'каждая несвободная клетка отрисована'
    );
    if (after.lastMove.points > 0) {
      sawScoredFlash = true;
      if (env.document.querySelector('.score-pop')) sawScorePop = true;
      assert.match(env.$('status').textContent, /Линия зачеркнута: \+\d+ очк\. Компьютер думает…/);
    }

    env.settle();

    const settled = env.state();
    for (let i = 0; i < 25; i += 1) {
      const rendered = env.cells[i].dataset.state;
      if (settled.blocked[i] !== null) {
        assert.match(rendered, /^dead-[xo]$/, 'клетка ' + i + ' помечена как зачеркнутая');
        assert.match(env.cells[i].getAttribute('aria-label'), /зачеркнуто, клетка недоступна$/);
      } else if (settled.cells[i] === 'X') {
        assert.equal(rendered, 'x');
      } else if (settled.cells[i] === 'O') {
        assert.equal(rendered, 'o');
      } else {
        assert.equal(rendered, 'empty');
      }
    }

    // Клик по зачеркнутой клетке не должен ничего менять.
    if (!checkedDeadCell) {
      const dead = env.cells.findIndex((cell) => cell.dataset.state.startsWith('dead-'));
      if (dead > -1) {
        checkedDeadCell = true;
        const moves = settled.moves;
        env.click(dead);
        env.settle();
        assert.equal(env.state().moves, moves, 'зачеркнутая клетка недоступна');
      }
    }
  }

  const final = env.state();
  assert.equal(final.status, 'finished');
  assert.ok(final.scores.X + final.scores.O > 0, 'в партии были зачеркнутые линии');
  assert.ok(sawScoredFlash, 'подсветка зачеркнутой линии показывалась');
  assert.ok(sawScorePop, 'всплывашка «+N» показывалась');
  assert.ok(checkedDeadCell, 'в партии появились заблокированные клетки');

  // Итог партии показан, серия обновлена ровно один раз.
  assert.equal(env.$('board-overlay').hidden, false, 'показан итог партии');
  const title = env.$('result-title').textContent;
  assert.ok(['Победа!', 'Компьютер выиграл', 'Ничья'].includes(title), 'заголовок итога: ' + title);
  assert.equal(
    env.$('result-text').textContent,
    `Счет ${final.scores.X} : ${final.scores.O}` + (final.exhausted ? ' · поле исчерпано' : '')
  );
  assert.match(env.$('status').textContent, /^Партия окончена/);
  assert.equal(env.document.activeElement, env.$('btn-again'), 'фокус уходит на кнопку повтора');

  const series = env.instance.getSeries();
  assert.equal(series.win + series.draw + series.loss, 1, 'партия засчитана в серию ровно один раз');
  assert.equal(env.$('series-wins').textContent, String(series.win));
  assert.equal(env.$('series-draws').textContent, String(series.draw));
  assert.equal(env.$('series-losses').textContent, String(series.loss));

  // Клик по полю после конца партии ничего не меняет.
  const movesAtEnd = env.state().moves;
  env.click(0);
  env.settle();
  assert.equal(env.state().moves, movesAtEnd, 'партия окончена — поле не реагирует');

  // «Ещё партия» начинает новую партию и сохраняет серию.
  env.$('btn-again').click();
  const fresh = env.state();
  assert.equal(fresh.moves, 0);
  assert.deepEqual({ ...fresh.scores }, { X: 0, O: 0 });
  assert.equal(env.$('board-overlay').hidden, true);
  assert.equal(env.$('round').textContent, 'Партия № 2');
  assert.equal(env.$('score-x').textContent, '0');
  assert.equal(env.$('cells-left').textContent, '25');
  assert.equal(env.$('status').textContent, 'Ваш ход: поставьте ✕ на поле.');
  assert.equal(env.visibleCells(), 0, 'поле очищено');
  assert.ok(!env.cells.some((cell) => cell.classList.contains('is-new')), 'анимации сброшены');
  // Объекты из jsdom-контекста нельзя сравнивать строго — у них другой прототип.
  assert.deepEqual({ ...env.instance.getSeries() }, { ...series }, 'серия партий сохранена');

  // «Новая партия» посреди игры так же возвращает чистое поле.
  env.click(12);
  env.settle();
  env.$('btn-new').click();
  assert.equal(env.state().moves, 0);
  assert.equal(env.$('round').textContent, 'Партия № 3');
  env.settle();
  assert.equal(env.state().moves, 0, 'после сброса компьютер не ходит');
});

test('DOM: новая партия во время «раздумья» компьютера отменяет его ход', async () => {
  const env = await boot();
  env.click(6);
  assert.equal(env.state().moves, 1);
  assert.equal(env.timers.size, 1, 'ход компьютера запланирован');

  env.$('btn-new').click();
  assert.equal(env.timers.size, 0, 'таймер компьютера отменен');
  env.settle();
  assert.equal(env.state().moves, 0, 'отложенный ход не применился к новой партии');
  assert.equal(env.$('cells-left').textContent, '25');
  assert.equal(env.board.getAttribute('aria-busy'), 'false');
});
