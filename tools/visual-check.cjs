'use strict';

/**
 * Готовит страницы для визуальной проверки в настоящем браузере.
 *
 * Нужно потому, что jsdom не считает геометрию и не рисует: вёрстку, шрифты и
 * адаптив можно проверить только браузером. Скрипт делает байт-точную копию
 * index.html (никакого перекодирования через командную строку — на Windows
 * PowerShell читает BOM-less UTF-8 как ANSI и портит русский текст) и добавляет:
 *   - автопартию за игрока, чтобы на скриншоте была середина партии;
 *   - диагностику вёрстки в скрытый #layout-diagnostics (ширина, переполнение).
 *
 * Дальше файлы открываются браузером:
 *
 *   node tools/visual-check.cjs
 *   chrome --headless=new --hide-scrollbars --virtual-time-budget=30000 \
 *          --window-size=1440,3400 --screenshot=screenshots/desktop.png _visual-check.html
 *   chrome --headless=new --hide-scrollbars --virtual-time-budget=40000 \
 *          --window-size=520,4300 --screenshot=screenshots/mobile.png _narrow-check.html
 *   chrome --headless=new --virtual-time-budget=30000 --window-size=1440,3400 \
 *          --dump-dom _visual-check.html > _shots/dom.html
 *   node tools/dom-report.cjs
 *
 * Важно: headless Chrome на Windows не делает окно уже ~500 px, поэтому узкий
 * вьюпорт проверяется через iframe шириной 380 px, а не через --window-size=380.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const marker = '  </body>';

if (!html.includes(marker)) throw new Error('в index.html не найден закрывающий </body>');

const INJECT = `    <script>
      (function () {
        function diagnose() {
          var viewport = document.documentElement.clientWidth;
          var lines = [
            'innerWidth=' + window.innerWidth,
            'clientWidth=' + viewport,
            'scrollWidth=' + document.documentElement.scrollWidth,
            'scrollHeight=' + document.documentElement.scrollHeight,
          ];
          var offenders = [];
          var all = document.body.querySelectorAll('*');
          for (var i = 0; i < all.length; i++) {
            var rect = all[i].getBoundingClientRect();
            if (rect.width > 0 && rect.right > viewport + 1) {
              offenders.push(
                all[i].tagName.toLowerCase() + '.' + (all[i].getAttribute('class') || '-') +
                ' right=' + Math.round(rect.right) + ' w=' + Math.round(rect.width)
              );
            }
          }
          lines.push('overflow=' + offenders.length);
          lines.push(offenders.slice(0, 10).join('\\n'));
          var box = document.createElement('div');
          box.id = 'layout-diagnostics';
          box.hidden = true;
          box.textContent = lines.join('\\n');
          document.body.appendChild(box);
        }
        function autoplay() {
          var seed = 7;
          var rng = function () {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          var ui = window.TTT.ui.instance;
          function step() {
            var state = ui.getState();
            if (state.status !== 'playing' || state.moves >= 13) {
              diagnose();
              return;
            }
            var move = window.TTT.AI.chooseMove(state, 'X', rng);
            document.getElementById('board').children[move].click();
            window.setTimeout(step, 900);
          }
          step();
        }
        function wait() {
          if (window.TTT && window.TTT.ui && window.TTT.ui.instance) autoplay();
          else window.setTimeout(wait, 50);
        }
        window.setTimeout(wait, 30);
      })();
    </script>
`;

const NARROW = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Проверка узкого вьюпорта 380px</title>
    <style>
      html,
      body {
        margin: 0;
        background: #070b16;
      }
      iframe {
        display: block;
        width: 380px;
        height: 4200px;
        border: 0;
      }
    </style>
  </head>
  <body>
    <iframe id="phone" src="_visual-check.html"></iframe>
  </body>
</html>
`;

const play = html.replace(marker, INJECT + marker);
for (const [file, content] of [
  ['_visual-check.html', play],
  ['_narrow-check.html', NARROW],
]) {
  const target = path.join(ROOT, file);
  fs.writeFileSync(target, content, 'utf8');
  const original = Buffer.byteLength(html, 'utf8');
  console.log(file + ': ' + Buffer.byteLength(content, 'utf8') + ' байт (index.html: ' + original + ')');
}
fs.mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true });
fs.mkdirSync(path.join(ROOT, '_shots'), { recursive: true });
console.log('Готово. Запустите команды из комментария в начале файла.');
