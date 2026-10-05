const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const phrase = 'Компьютер думает';
const phraseBytes = Buffer.from(phrase, 'utf8');

for (const file of ['index.html', '_visual-check.html', '_shots/dom.html']) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.log(file + ': НЕТ ФАЙЛА');
    continue;
  }
  const bytes = fs.readFileSync(full);
  const text = bytes.toString('utf8');
  const metaAt = bytes.indexOf(Buffer.from('charset="utf-8"'));
  const phraseAt = bytes.indexOf(phraseBytes);
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const replacement = (text.match(/\uFFFD/g) || []).length;
  // Сколько раз встречается классическая «двойная перекодировка» UTF-8 -> CP1252
  const mojibake = (text.match(/[ÐÑ][\u0080-\u00BF\u2018-\u201E]/g) || []).length;
  console.log(
    file.padEnd(22) +
      ' bytes=' + String(bytes.length).padStart(7) +
      ' bom=' + (bom ? 'да ' : 'нет') +
      ' charset@' + String(metaAt).padStart(5) +
      ' фраза@' + String(phraseAt).padStart(6) +
      ' U+FFFD=' + replacement +
      ' mojibake=' + mojibake
  );
}
