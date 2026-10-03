// Hộp "Ủng hộ": chỉ email Zelle + tên người nhận, không còn số điện thoại
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Ủng hộ qua Zelle: có email + người nhận, không có số điện thoại ở bất kỳ đâu', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(app, /email: 'huydinhvn1@gmail\.com'/);
  assert.match(app, /name: 'Huy Dinh'/);
  assert.match(app, /data-what="email"/);
  for (const f of ['public/app.js', 'public/index.html', 'public/style.css', 'README.md', 'server.js']) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.doesNotMatch(s, /912|881[-\s]?9519|9519|zellePhone|phoneRaw/, f);
  }
  assert.doesNotMatch(app, /số điện thoại Zelle|phone number above/i);
});
