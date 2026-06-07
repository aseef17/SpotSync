const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Regression guard: onPlaceAdded must resolve `name` before the importInProgress
 * early return. Using `name` earlier caused ReferenceError during bulk imports,
 * which made Cloud Functions retry and spam collaborators after import completed.
 */
test('onPlaceAdded resolves place name before importInProgress skip', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const handlerStart = source.indexOf('exports.onPlaceAdded = onDocumentCreated');
  assert.ok(handlerStart >= 0, 'onPlaceAdded handler must exist');

  const handlerSource = source.slice(handlerStart, handlerStart + 3500);
  const nameDecl = handlerSource.indexOf("let name = 'A place'");
  const importSkip = handlerSource.indexOf('if (listData.importInProgress)');

  assert.ok(nameDecl >= 0, 'name must be declared in onPlaceAdded');
  assert.ok(importSkip >= 0, 'importInProgress guard must exist in onPlaceAdded');
  assert.ok(
    nameDecl < importSkip,
    'name must be initialized before importInProgress is checked'
  );
});
