const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

for (const file of fs
  .readdirSync(path.join(root, '_shots'))
  .filter((name) => /^dom-.*\.html$/.test(name))
  .sort()
  .map((name) => '_shots/' + name)) {
  const dom = read(file);
  const diag = dom.match(/id="layout-diagnostics"[^>]*>([\s\S]*?)<\/div>/);
  const count = (pattern) => (dom.match(new RegExp(pattern, 'g')) || []).length;
  console.log('\n=== ' + file + ' ===');
  console.log('  клетки: x=' + count('data-state="x"') + ' o=' + count('data-state="o"') +
    ' dead-x=' + count('data-state="dead-x"') + ' dead-o=' + count('data-state="dead-o"') +
    ' empty=' + count('data-state="empty"'));
  const value = (id) => {
    const m = dom.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)<'));
    return m ? m[1].trim() : '(нет)';
  };
  console.log('  счёт: ' + value('score-x') + ' : ' + value('score-o') +
    ', свободных=' + value('cells-left'));
  console.log('  статус: ' + value('status'));
  console.log('  оверлей скрыт: ' + /id="board-overlay" hidden/.test(dom));
  console.log('  активная карточка: ' + (dom.match(/score-card--(\w) is-active/) || ['—', '—'])[1]);
  console.log('  мини-схем: ' + count('class="mini[^"]*"') + ', мини-клеток: ' + count('mini__cell'));
  console.log('  is-new клеток: ' + count('is-new') + ', is-scored: ' + count('is-scored'));
  console.log('  ДИАГНОСТИКА:');
  if (diag) {
    for (const line of diag[1].split('\n')) console.log('    ' + line.trim());
  } else {
    console.log('    (диагностика не найдена — скрипт не отработал)');
  }
  const mojibake = (dom.match(/[ÐÑ][\u0080-\u00BF\u2018-\u201E]/g) || []).length;
  console.log('  признаков перекодировки: ' + mojibake);
}
