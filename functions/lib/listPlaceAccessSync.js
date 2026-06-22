function normalizedListCollaboratorIds(list) {
  if (Array.isArray(list.collaboratorIds) && list.collaboratorIds.length > 0) {
    return list.collaboratorIds;
  }
  return [list.ownerId];
}

function listAccessFieldsChanged(before, after) {
  return (
    before.ownerId !== after.ownerId ||
    before.isPublic !== after.isPublic ||
    JSON.stringify(normalizedListCollaboratorIds(before)) !==
      JSON.stringify(normalizedListCollaboratorIds(after))
  );
}

function buildListPlaceAccessFields(listData) {
  return {
    listOwnerId: listData.ownerId,
    listIsPublic: listData.isPublic === true,
    listCollaboratorIds: normalizedListCollaboratorIds(listData),
  };
}

/** Paginated listPlaces query for access-field backfill; requires orderBy for startAfter. */
function buildListPlacesAccessSyncQuery(db, listId, lastDoc, batchSize = 400) {
  // Use listId + addedAt DESC — composite index exists in firestore.indexes.json.
  // orderBy(documentId()) alone requires a listId + __name__ index that is not deployed.
  let query = db
    .collection('listPlaces')
    .where('listId', '==', listId)
    .orderBy('addedAt', 'desc')
    .limit(batchSize);

  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  return query;
}

function membershipNeedsAccessFieldUpdate(data, accessFields) {
  return (
    data.listOwnerId !== accessFields.listOwnerId ||
    data.listIsPublic !== accessFields.listIsPublic ||
    JSON.stringify(data.listCollaboratorIds || []) !==
      JSON.stringify(accessFields.listCollaboratorIds)
  );
}

/** Keep listPlaces denorm fields aligned when list visibility or collaborators change. */
async function syncListPlaceAccessFields(db, listId, listData) {
  const accessFields = buildListPlaceAccessFields(listData);
  const BATCH_SIZE = 400;
  let lastDoc = null;

  while (true) {
    const snap = await buildListPlacesAccessSyncQuery(db, listId, lastDoc, BATCH_SIZE).get();
    if (snap.empty) {
      break;
    }

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      if (membershipNeedsAccessFieldUpdate(doc.data(), accessFields)) {
        batch.update(doc.ref, accessFields);
        batchCount += 1;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_SIZE) {
      break;
    }
  }
}

module.exports = {
  normalizedListCollaboratorIds,
  listAccessFieldsChanged,
  buildListPlaceAccessFields,
  buildListPlacesAccessSyncQuery,
  membershipNeedsAccessFieldUpdate,
  syncListPlaceAccessFields,
};
