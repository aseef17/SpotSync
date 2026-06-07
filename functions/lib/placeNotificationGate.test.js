const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shouldSkipPlaceAddedNotification } = require('./placeNotificationGate');

describe('shouldSkipPlaceAddedNotification', () => {
  it('skips when place has suppressNotifications even after import completes', () => {
    assert.equal(
      shouldSkipPlaceAddedNotification({ suppressNotifications: true }, { importInProgress: false }),
      true
    );
  });

  it('skips when list import is in progress', () => {
    assert.equal(shouldSkipPlaceAddedNotification({}, { importInProgress: true }), true);
  });

  it('does not skip for normal place adds', () => {
    assert.equal(shouldSkipPlaceAddedNotification({}, { importInProgress: false }), false);
  });
});
