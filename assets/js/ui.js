/**
 * «Линия 5×5» — слой интерфейса. Правил игры здесь нет: все решения принимают
 * Rules (что можно, сколько очков, когда партия окончена) и AI (ход компьютера).
 * Задача этого файла — DOM, доступность, клавиатура и анимации.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rules.js'), require('./ai.js'));
  } else {
    root.TTT = root.TTT || {};
    root.TTT.ui = factory(root.TTT.Rules, root.TTT.AI);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Rules, AI) {
  'use strict';

  const HUMAN = Rules.X;
  const MACHINE = Rules.O;
  const SIZE = Rules.SIZE;
  const THINK_DELAY = 480; // пауза «раздумья», чтобы ход компьютера читался
  const POP_DURATION = 1100;

  /** Все идентификаторы, которые обязана содержать страница. */
  const IDS = [
    'board',
    'status',
    'score-x',
    'score-o',
    'score-card-x',
    'score-card-o',
    'round',
    'cells-left',
    'btn-new',
    'btn-again',
    'board-overlay',
    'result-title',
    'result-text',
    'series-wins',
    'series-draws',
    'series-losses',
  ];

  function need(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error('Линия 5×5: на странице нет элемента #' + id);
    return element;
  }

  /** Декоративные мини-схемы 5×5 из атрибута data-mini="x11 x12 o0 b3". */
  function paintMinis(scope) {
    scope.querySelectorAll('[data-mini]').forEach((mini) => {
      if (mini.childElementCount > 0) return;
      const marks = new Map();
      for (const match of mini.getAttribute('data-mini').matchAll(/([xob])(\d+)/g)) {
        marks.set(Number(match[2]), match[1]);
      }
      for (let i = 0; i < SIZE * SIZE; i += 1) {
        const cell = document.createElement('span');
        cell.className = 'mini__cell';
        const mark = marks.get(i);
        if (mark) cell.dataset.mark = mark;
        mini.appendChild(cell);
      }
    });
  }

  function init() {
    paintMinis(document);

    const els = {};
    for (const id of IDS) els[id] = need(id);

    const board = els.board;
    const cells = [];
    let state = Rules.createGame();
    let busy = false;
    let roundClosed = false;
    let roundNumber = 1;
    let renderedMove = -1;
    let focusIndex = Math.floor((SIZE * SIZE) / 2);
    let aiTimer = null;
    const series = { win: 0, draw: 0, loss: 0 };

    // --- Поле ---------------------------------------------------------------
    // Клетки — обычные кнопки внутри role="group": role="grid" требовал бы
    // промежуточных role="row", а обертки ломают CSS-сетку поля.
    for (let index = 0; index < SIZE * SIZE; index += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.index = String(index);
      cell.tabIndex = index === focusIndex ? 0 : -1;
      cell.dataset.state = 'empty';

      const mark = document.createElement('span');
      mark.className = 'cell__mark';
      mark.setAttribute('aria-hidden', 'true');
      cell.appendChild(mark);

      cell.addEventListener('click', () => playHuman(Number(cell.dataset.index)));
      cell.addEventListener('focus', () => setFocus(Number(cell.dataset.index), false));
      cells.push(cell);
      board.appendChild(cell);
    }

    // --- Клавиатура: стрелки перемещают фокус по сетке ----------------------
    board.addEventListener('keydown', (event) => {
      const row = Math.floor(focusIndex / SIZE);
      const col = focusIndex % SIZE;
      const moves = {
        ArrowRight: [row, (col + 1) % SIZE],
        ArrowLeft: [row, (col + SIZE - 1) % SIZE],
        ArrowDown: [(row + 1) % SIZE, col],
        ArrowUp: [(row + SIZE - 1) % SIZE, col],
        Home: [row, 0],
        End: [row, SIZE - 1],
      };
      const target = moves[event.key];
      if (!target) return;
      event.preventDefault();
      setFocus(target[0] * SIZE + target[1], true);
    });

    els['btn-new'].addEventListener('click', newGame);
    els['btn-again'].addEventListener('click', newGame);

    function setFocus(index, shouldFocus) {
      focusIndex = index;
      cells.forEach((cell, i) => {
        cell.tabIndex = i === index ? 0 : -1;
      });
      if (shouldFocus) cells[index].focus();
    }

    // --- Отрисовка ----------------------------------------------------------
    function cellState(index) {
      if (state.blocked[index] !== null) return 'dead-' + state.blocked[index].toLowerCase();
      const value = state.cells[index];
      if (value === HUMAN) return 'x';
      if (value === MACHINE) return 'o';
      return 'empty';
    }

    function cellLabel(index) {
      const label = 'Строка ' + (Math.floor(index / SIZE) + 1) + ', столбец ' + ((index % SIZE) + 1) + ': ';
      switch (cellState(index)) {
        case 'x':
          return label + 'ваш знак ✕';
        case 'o':
          return label + 'знак компьютера ○';
        case 'dead-x':
        case 'dead-o':
          return label + 'зачеркнуто, клетка недоступна';
        default:
          return label + 'пусто' + (state.status === 'playing' && state.turn === HUMAN ? ', можно походить' : '');
      }
    }

    function statusText() {
      const last = state.lastMove;
      if (state.status === 'finished') {
        const outcome = Rules.result(state);
        if (outcome.draw) return 'Партия окончена: ничья ' + outcome.scores.X + ' : ' + outcome.scores.O + '.';
        const win = outcome.winner === HUMAN;
        return (
          'Партия окончена: ' +
          (win ? 'победа' : 'победил компьютер') +
          ' ' +
          outcome.scores.X +
          ' : ' +
          outcome.scores.O +
          '.'
        );
      }
      if (busy) {
        if (last && last.player === HUMAN && last.points > 0) {
          return 'Линия зачеркнута: <b>+' + last.points + '</b> очк. Компьютер думает…';
        }
        return 'Компьютер думает…';
      }
      if (last && last.player === MACHINE && last.points > 0) {
        return 'Компьютер зачеркнул линию: <b>+' + last.points + '</b> очк. Ваш ход.';
      }
      return state.moves === 0
        ? 'Ваш ход: поставьте ✕ на поле.'
        : 'Компьютер походил. Ваш ход.';
    }

    function flash(cell, className) {
      cell.classList.remove(className);
      void cell.offsetWidth; // перезапуск анимации
      cell.classList.add(className);
    }

    function showScorePop(player, points) {
      const card = player === HUMAN ? els['score-card-x'] : els['score-card-o'];
      card.classList.remove('is-bumped');
      void card.offsetWidth;
      card.classList.add('is-bumped');
      const pop = document.createElement('span');
      pop.className = 'score-pop';
      pop.textContent = '+' + points;
      card.appendChild(pop);
      window.setTimeout(() => {
        pop.remove();
        card.classList.remove('is-bumped');
      }, POP_DURATION);
    }

    function render() {
      const isNewMove = state.moves !== renderedMove;
      const last = state.lastMove;

      cells.forEach((cell, index) => {
        const next = cellState(index);
        cell.dataset.state = next;
        cell.setAttribute('aria-label', cellLabel(index));
        cell.querySelector('.cell__mark').textContent =
          next === 'empty' ? '' : next === 'o' || next === 'dead-o' ? '○' : '✕';
        if (next === 'empty') cell.removeAttribute('aria-disabled');
        else cell.setAttribute('aria-disabled', 'true');
      });

      if (isNewMove && last) {
        if (last.points > 0) {
          for (const index of last.blockedCells) flash(cells[index], 'is-scored');
          showScorePop(last.player, last.points);
        }
        if (state.cells[last.index] !== null) flash(cells[last.index], 'is-new');
        renderedMove = state.moves;
      }

      els['score-x'].textContent = String(state.scores.X);
      els['score-o'].textContent = String(state.scores.O);
      els['cells-left'].textContent = String(Rules.emptyCells(state).length);
      els.status.innerHTML = statusText();
      els['score-card-x'].classList.toggle('is-active', state.status === 'playing' && state.turn === HUMAN);
      els['score-card-o'].classList.toggle('is-active', state.status === 'playing' && state.turn === MACHINE);
      board.classList.toggle('is-busy', busy);
      board.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function updateSeries() {
      els['series-wins'].textContent = String(series.win);
      els['series-draws'].textContent = String(series.draw);
      els['series-losses'].textContent = String(series.loss);
    }

    // --- Ход игрока и ответ компьютера --------------------------------------
    function playHuman(index) {
      if (busy || state.status !== 'playing' || state.turn !== HUMAN) return;
      const next = Rules.applyMove(state, index, HUMAN);
      if (next === state) return;
      state = next;
      render();
      if (state.status === 'playing') scheduleMachine();
      else finishRound();
    }

    function scheduleMachine() {
      busy = true;
      render();
      aiTimer = window.setTimeout(() => {
        aiTimer = null;
        const move = AI.chooseMove(state, MACHINE);
        if (move !== null) state = Rules.applyMove(state, move, MACHINE);
        busy = false;
        render();
        if (state.status !== 'playing') finishRound();
      }, THINK_DELAY);
    }

    function finishRound() {
      if (roundClosed) return;
      roundClosed = true;
      const outcome = Rules.result(state);
      if (!outcome) return;

      if (outcome.draw) series.draw += 1;
      else if (outcome.winner === HUMAN) series.win += 1;
      else series.loss += 1;
      updateSeries();

      els['result-title'].textContent = outcome.draw
        ? 'Ничья'
        : outcome.winner === HUMAN
          ? 'Победа!'
          : 'Компьютер выиграл';
      els['result-title'].className =
        'overlay__title' + (outcome.draw ? '' : outcome.winner === HUMAN ? ' is-win' : ' is-loss');
      els['result-text'].textContent =
        'Счет ' + outcome.scores.X + ' : ' + outcome.scores.O + (state.exhausted ? ' · поле исчерпано' : '');
      els['board-overlay'].hidden = false;

      render();
      els['btn-again'].focus();
    }

    function newGame() {
      if (aiTimer !== null) {
        window.clearTimeout(aiTimer);
        aiTimer = null;
      }
      busy = false;
      roundClosed = false;
      renderedMove = -1;
      state = Rules.createGame();
      roundNumber += 1;
      els.round.textContent = 'Партия № ' + roundNumber;
      els['board-overlay'].hidden = true;
      cells.forEach((cell) => cell.classList.remove('is-new', 'is-scored'));
      render();
    }

    // --- Старт ---------------------------------------------------------------
    cells[focusIndex].tabIndex = 0;
    els.round.textContent = 'Партия № ' + roundNumber;
    updateSeries();
    render();

    return {
      newGame,
      getState: () => state,
      getSeries: () => ({ ...series }),
    };
  }

  const api = { init, IDS, paintMinis };

  /** Запуск на странице; результат доступен как TTT.ui.instance (отладочный хук). */
  function boot() {
    api.instance = init();
    return api.instance;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return api;
});
