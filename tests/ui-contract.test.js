'use strict';

/**
 * Контракт «интерфейс ↔ разметка ↔ стили». Тесты проверяют то, что нельзя
 * проверить юнит-тестами логики: что скрипты находят свои элементы, что стили
 * покрывают разметку и что страница останется рабочей при открытии файла.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const html = read('index.html');
const css = read('assets/css/styles.css');
const uiSource = read('assets/js/ui.js');
const UI = require('../assets/js/ui.js');

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

function classTokens(source) {
  const tokens = new Set();
  for (const match of source.matchAll(/\bclass="([^"]*)"/g)) {
    for (const token of match[1].split(/\s+/)) if (token) tokens.add(token);
  }
  return tokens;
}

test('AC12: все элементы, которые ищет ui.js, есть в разметке', () => {
  assert.ok(UI.IDS.length >= 15, 'список обязательных элементов собран: ' + UI.IDS.length);
  for (const id of UI.IDS) {
    assert.ok(htmlIds.has(id), 'в index.html нет #' + id);
  }
  // Любые прямые ссылки на элементы по строковому литералу тоже должны существовать.
  const literals = [
    ...uiSource.matchAll(/(?:getElementById|need|querySelector)\(\s*['"]#?([A-Za-z][\w-]*)['"]/g),
  ].map((m) => m[1]);
  for (const id of literals) {
    assert.ok(htmlIds.has(id), 'в index.html нет #' + id + ' (прямая ссылка в ui.js)');
  }
});

test('AC12: поле собирается скриптом — в разметке оно пустое', () => {
  const board = html.match(/<div[^>]*id="board"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(board, 'контейнер #board найден');
  assert.equal(board[1].trim(), '', 'в #board не должно быть статичных клеток');
  assert.match(html, /id="board"[\s\S]{0,200}role="group"/, 'поле размечено как группа кнопок');
  assert.ok(!/role="grid"/.test(html), 'role="grid" без role="row" — невалидная ARIA-структура');
});

test('AC12: стили покрывают каждый класс из разметки', () => {
  const missing = [...classTokens(html)]
    .filter((token) => !css.includes('.' + token))
    .sort();
  assert.deepEqual(missing, [], 'классы без правил в styles.css: ' + missing.join(', '));
});

test('AC12: динамические классы ui.js описаны в стилях', () => {
  const used = new Set();
  for (const match of uiSource.matchAll(/classList\.(?:add|remove|toggle)\(\s*'([^']+)'/g)) {
    used.add(match[1]);
  }
  for (const match of uiSource.matchAll(/className\s*=\s*([^;]+);/g)) {
    for (const literal of match[1].matchAll(/'([^']*)'/g)) {
      for (const token of literal[1].split(/\s+/)) if (token) used.add(token);
    }
  }
  assert.ok(used.size > 5, 'классы из ui.js собраны: ' + used.size);
  const missing = [...used].filter((token) => !css.includes('.' + token)).sort();
  assert.deepEqual(missing, [], 'классы ui.js без правил: ' + missing.join(', '));
});

test('AC13: страница работает без сервера: classic-скрипты в правильном порядке', () => {
  assert.ok(!/type="module"/.test(html), 'ES-модули ломаются по file://');
  assert.ok(!/crossorigin/.test(html), 'внешние ресурсы с CORS не нужны');
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'нет внешних ссылок на ресурсы');

  const order = ['assets/js/rules.js', 'assets/js/ai.js', 'assets/js/ui.js'].map((file) => {
    const at = html.indexOf(file);
    assert.ok(at > -1, 'подключен ' + file);
    assert.ok(fs.existsSync(path.join(ROOT, file)), 'файл существует: ' + file);
    return at;
  });
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'rules → ai → ui');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/css/styles.css')));
  assert.ok(html.includes('href="assets/css/styles.css"'));
});

test('AC1: разметка корректна — язык, заголовок, вьюпорт', () => {
  assert.match(html, /<html lang="ru">/);
  assert.match(html, /<meta charset="utf-8"/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<title>[^<]{10,}<\/title>/);
  assert.ok(!/\{\{|TODO|FIXME/.test(html), 'нет незаполненных мест');
});

test('AC1: мини-схемы правил ссылаются на существующие клетки поля 5x5', () => {
  const minis = [...html.matchAll(/data-mini="([^"]*)"/g)];
  assert.ok(minis.length >= 3, 'мини-схем в разметке: ' + minis.length);
  for (const [, spec] of minis) {
    const pairs = [...spec.matchAll(/([xob])(\d+)/g)];
    assert.ok(pairs.length > 0, 'схема не пустая: ' + spec);
    for (const [, mark, index] of pairs) {
      assert.ok('xob'.includes(mark), 'неизвестная метка ' + mark);
      assert.ok(Number(index) >= 0 && Number(index) < 25, 'индекс вне поля: ' + index);
    }
  }
});

test('AC12: CSS синтаксически целостен', () => {
  assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, 'баланс скобок');
  assert.ok(css.length > 3000, 'стили не обрезаны');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'уважение к настройкам анимации');
  assert.ok(css.includes('@media (max-width: 720px)'), 'мобильная версия');
});

test('AC13: файлы проекта — чистый UTF-8 без BOM и без двойной перекодировки', () => {
  // Русский текст — самое хрупкое место при правках через командную строку:
  // Get-Content/Set-Content в Windows PowerShell читает BOM-less UTF-8 как ANSI
  // и превращает «Компьютер» в «ĐšĐ¾Đ¼Đ¿ÑŒÑŽÑ‚ĐµÑ€». Сторожим это тестом.
  const mojibake = /[ÐÑ][\u0080-\u00BF\u2018-\u201E\u2020-\u2026\u02C6\u2030\u2039\u203A\u20AC\u2122]/;
  const files = [
    'index.html',
    'assets/css/styles.css',
    'assets/js/rules.js',
    'assets/js/ai.js',
    'assets/js/ui.js',
    'README.md',
  ];
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(ROOT, file));
    assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), file + ': BOM в начале файла');
    const text = bytes.toString('utf8');
    assert.ok(!text.includes('\uFFFD'), file + ': есть нечитаемые символы');
    assert.ok(!mojibake.test(text), file + ': текст похож на двойную перекодировку');
    assert.match(text, /[А-Яа-яЁё]/, file + ': русский текст читается');
  }
  const htmlBytes = fs.readFileSync(path.join(ROOT, 'index.html'));
  const charsetAt = htmlBytes.indexOf(Buffer.from('charset="utf-8"'));
  assert.ok(charsetAt > -1 && charsetAt < 1024, 'charset объявлен в первых 1024 байтах');
});

test('AC12: ui.js загружается в Node и отдает ожидаемое API', () => {
  assert.equal(typeof UI.init, 'function');
  assert.equal(typeof UI.paintMinis, 'function');
  assert.ok(Array.isArray(UI.IDS));
  assert.equal(new Set(UI.IDS).size, UI.IDS.length, 'идентификаторы не повторяются');
});
