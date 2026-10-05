'use strict';

/**
 * Проверка опубликованной версии: все ли файлы реально отдаются GitHub Pages
 * по относительным путям. Нужна после каждого пуша — если, например, сломается
 * путь к ассету, страница откроется без стилей, и заметить это можно только так.
 *
 * Запуск: node tools/check-live.cjs [базовый-URL]
 */

const BASE = process.argv[2] || 'https://vadimkotovich-pixel.github.io/line-5x5/';

/** path -> подстроки, которые обязаны быть в теле ответа. */
const FILES = [
  ['', ['id="board"', 'assets/js/ui.js', 'assets/css/styles.css']],
  ['assets/css/styles.css', ['.cell[data-state="dead-x"]', '--x: #35e0ff']],
  ['assets/js/rules.js', ['LINES_THROUGH', 'hasPotential']],
  ['assets/js/ai.js', ['positionalValue', 'POINT_WEIGHT']],
  ['assets/js/ui.js', ['aria-busy', 'cell__mark']],
  ['screenshots/desktop.png', []],
  ['LICENSE', ['MIT License']],
  ['.nojekyll', []],
];

(async () => {
  let failed = 0;
  for (const [file, needles] of FILES) {
    const url = BASE + file;
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const type = response.headers.get('content-type') || '-';
      const body = await response.text();
      const missing = needles.filter((needle) => !body.includes(needle));
      const ok = response.ok && missing.length === 0;
      if (!ok) failed += 1;
      console.log(
        (ok ? 'ок   ' : 'СБОЙ ') +
          String(response.status).padEnd(4) +
          type.padEnd(34) +
          String(body.length).padStart(7) +
          ' Б  ' +
          (file || '(корень)') +
          (missing.length ? '  не найдено: ' + missing.join(', ') : '')
      );
    } catch (error) {
      failed += 1;
      console.log('СБОЙ ---  ' + (file || '(корень)') + '  ' + error.message);
    }
  }
  console.log(failed === 0 ? '\nВсе файлы опубликованы корректно: ' + BASE : '\nПроблем: ' + failed);
  process.exitCode = failed === 0 ? 0 : 1;
})();
