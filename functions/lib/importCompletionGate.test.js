const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shouldNotifyImportCompleted } = require('./importCompletionGate');

describe('shouldNotifyImportCompleted', () => {
  it('notifies when import finishes with a new success count', () => {
    assert.equal(
      shouldNotifyImportCompleted(
        { importInProgress: true, lastImportCount: 50 },
        { importInProgress: false, lastImportCount: 30 }
      ),
      true
    );
  });

  it('does not notify when import fails but lastImportCount stays stale', () => {
    assert.equal(
      shouldNotifyImportCompleted(
        { importInProgress: true, lastImportCount: 50 },
        { importInProgress: false, lastImportCount: 50 }
      ),
      false
    );
  });

  it('does not notify when import clears with zero places added', () => {
    assert.equal(
      shouldNotifyImportCompleted(
        { importInProgress: true },
        { importInProgress: false, lastImportCount: 0 }
      ),
      false
    );
  });
});
