#!/usr/bin/env node
/**
 * Backfill denormalized list access fields on listPlaces docs so client queries
 * satisfy Firestore security rules without parent-list get() lookups.
 *
 * Usage:
 *   node scripts/backfill-list-place-access-fields.mjs
 *   LIST_ID=abc123 node scripts/backfill-list-place-access-fields.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const admin = require(
  join(dirname(fileURLToPath(import.meta.url)), '../functions/node_modules/firebase-admin')
);

const LIST_ID = process.env.LIST_ID;
const BATCH_SIZE = 400;

function normalizedCollaboratorIds(list) {
  return list.collaboratorIds?.length ? list.collaboratorIds : [list.ownerId];
}

async function backfillList(db, listId) {
  const listSnap = await db.collection('lists').doc(listId).get();
  if (!listSnap.exists) {
    console.warn(`Skipping missing list ${listId}`);
    return 0;
  }

  const list = listSnap.data();
  const accessFields = {
    listOwnerId: list.ownerId,
    listIsPublic: list.isPublic === true,
    listCollaboratorIds: normalizedCollaboratorIds(list),
  };

  let updated = 0;
  let lastDoc = null;

  while (true) {
    let query = db.collection('listPlaces').where('listId', '==', listId).limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) {
      break;
    }

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const needsUpdate =
        data.listOwnerId !== accessFields.listOwnerId ||
        data.listIsPublic !== accessFields.listIsPublic ||
        JSON.stringify(data.listCollaboratorIds || []) !==
          JSON.stringify(accessFields.listCollaboratorIds);

      if (needsUpdate) {
        batch.update(doc.ref, accessFields);
        batchCount += 1;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      updated += batchCount;
      console.log(`Updated ${batchCount} memberships for list ${listId}`);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_SIZE) {
      break;
    }
  }

  return updated;
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId:
        process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'places-maps-list-app',
    });
  }

  const db = admin.firestore();

  if (LIST_ID) {
    const count = await backfillList(db, LIST_ID);
    console.log(`Done. Updated ${count} memberships for ${LIST_ID}.`);
    return;
  }

  const listsSnap = await db.collection('lists').select().get();
  let total = 0;
  for (const listDoc of listsSnap.docs) {
    total += await backfillList(db, listDoc.id);
  }
  console.log(`Done. Updated ${total} memberships across ${listsSnap.size} lists.`);
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
