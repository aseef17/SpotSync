const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FieldPath } = require('firebase-admin/firestore');
const {
  listAccessFieldsChanged,
  normalizedListCollaboratorIds,
  buildListPlaceAccessFields,
  buildListPlacesAccessSyncQuery,
  membershipNeedsAccessFieldUpdate,
} = require('./listPlaceAccessSync');

describe('normalizedListCollaboratorIds', () => {
  it('falls back to owner when collaboratorIds is missing or empty', () => {
    assert.deepEqual(normalizedListCollaboratorIds({ ownerId: 'owner-1' }), ['owner-1']);
    assert.deepEqual(normalizedListCollaboratorIds({ ownerId: 'owner-1', collaboratorIds: [] }), [
      'owner-1',
    ]);
  });
});

describe('listAccessFieldsChanged', () => {
  it('detects collaborator, visibility, and owner changes', () => {
    const before = {
      ownerId: 'owner-1',
      isPublic: false,
      collaboratorIds: ['owner-1', 'user-2'],
    };
    const afterCollaboratorChange = {
      ...before,
      collaboratorIds: ['owner-1'],
    };
    const afterVisibilityChange = {
      ...before,
      isPublic: true,
    };

    assert.equal(listAccessFieldsChanged(before, afterCollaboratorChange), true);
    assert.equal(listAccessFieldsChanged(before, afterVisibilityChange), true);
    assert.equal(listAccessFieldsChanged(before, before), false);
  });
});

describe('buildListPlaceAccessFields', () => {
  it('mirrors list access metadata onto membership docs', () => {
    assert.deepEqual(
      buildListPlaceAccessFields({
        ownerId: 'owner-1',
        isPublic: true,
        collaboratorIds: ['owner-1', 'user-2'],
      }),
      {
        listOwnerId: 'owner-1',
        listIsPublic: true,
        listCollaboratorIds: ['owner-1', 'user-2'],
      }
    );
  });
});

describe('membershipNeedsAccessFieldUpdate', () => {
  it('detects stale denormalized access fields', () => {
    const accessFields = {
      listOwnerId: 'owner-1',
      listIsPublic: false,
      listCollaboratorIds: ['owner-1'],
    };

    assert.equal(
      membershipNeedsAccessFieldUpdate(
        {
          listOwnerId: 'owner-1',
          listIsPublic: false,
          listCollaboratorIds: ['owner-1', 'revoked-user'],
        },
        accessFields
      ),
      true
    );
    assert.equal(
      membershipNeedsAccessFieldUpdate(
        {
          listOwnerId: 'owner-1',
          listIsPublic: false,
          listCollaboratorIds: ['owner-1'],
        },
        accessFields
      ),
      false
    );
  });
});

describe('buildListPlacesAccessSyncQuery', () => {
  it('includes orderBy documentId so startAfter pagination is valid', () => {
    const admin = require('firebase-admin');
    try {
      admin.initializeApp({ projectId: 'test-list-place-access-sync' });
    } catch (error) {
      if (error.code !== 'app/duplicate-app') {
        throw error;
      }
    }

    const db = admin.firestore();
    const firstPage = buildListPlacesAccessSyncQuery(db, 'list-1', null, 2);
    assert.doesNotThrow(() => firstPage.startAfter(db.collection('listPlaces').doc('doc-2')));

    const orderedQuery = db
      .collection('listPlaces')
      .where('listId', '==', 'list-1')
      .orderBy(FieldPath.documentId())
      .limit(2);
    assert.doesNotThrow(() => orderedQuery.startAfter(db.collection('listPlaces').doc('doc-2')));

    const unOrderedQuery = db.collection('listPlaces').where('listId', '==', 'list-1').limit(2);
    assert.throws(
      () => unOrderedQuery.startAfter(db.collection('listPlaces').doc('doc-2')),
      /orderBy/i
    );
  });
});
