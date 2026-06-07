const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shouldPruneAccountDeletionTombstone } = require('./accountDeletionTombstonePrune');

const cutoffMs = Date.parse('2026-06-07T00:00:00.000Z');
const expired = { toMillis: () => cutoffMs - 60_000 };
const recent = { toMillis: () => cutoffMs + 60_000 };

describe('shouldPruneAccountDeletionTombstone', () => {
  it('prunes completed tombstones after retention', () => {
    assert.equal(
      shouldPruneAccountDeletionTombstone(
        { completedAt: expired, startedAt: expired },
        cutoffMs,
        false
      ),
      true
    );
  });

  it('keeps recent completed tombstones', () => {
    assert.equal(
      shouldPruneAccountDeletionTombstone(
        { completedAt: recent, startedAt: expired },
        cutoffMs,
        true
      ),
      false
    );
  });

  it('prunes legacy tombstones only when auth user is gone', () => {
    assert.equal(shouldPruneAccountDeletionTombstone({ startedAt: expired }, cutoffMs, true), true);
    assert.equal(
      shouldPruneAccountDeletionTombstone({ startedAt: expired }, cutoffMs, false),
      false
    );
  });

  it('keeps in-progress tombstones before retention expires', () => {
    assert.equal(shouldPruneAccountDeletionTombstone({ startedAt: recent }, cutoffMs, true), false);
  });
});
