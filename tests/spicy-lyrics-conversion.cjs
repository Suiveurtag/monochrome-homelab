const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync('pb_hooks/spicy-lyrics.js', 'utf8'), context);
const data = { Content: [{ Lead: { StartTime: 1, EndTime: 4, Syllables: [
    { Text: 'I', StartTime: 1, EndTime: 1.5 },
    { Text: 'might', StartTime: 1.5, EndTime: 2 },
    { Text: 'cra', StartTime: 2, EndTime: 3, IsPartOfWord: true },
    { Text: 'zy', StartTime: 3, EndTime: 4 },
] } }] };
const result = context.module.exports.toTtml(data);
assert.match(result, />I<\/span> <span[^>]*>might<\/span> <span[^>]*>cra<\/span><span[^>]*>zy<\/span>/);
console.log('Spicy Lyrics boundaries preserved');
