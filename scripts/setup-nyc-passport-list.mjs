#!/usr/bin/env node
/**
 * Creates the NYC Neighborhood Passport list, imports places, and adds collaborators.
 *
 * Prerequisites:
 *   - Firebase CLI logged in (`firebase login`) OR GOOGLE_APPLICATION_CREDENTIALS set
 *   - Active project: places-maps-list-app (`firebase use places-maps-list-app`)
 *
 * Usage:
 *   node scripts/setup-nyc-passport-list.mjs
 *   node scripts/setup-nyc-passport-list.mjs --dry-run
 *   LIST_ID=abc123 node scripts/setup-nyc-passport-list.mjs   # re-import into existing list
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const admin = require(
  join(dirname(fileURLToPath(import.meta.url)), '../functions/node_modules/firebase-admin')
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

const OWNER_EMAIL = 'aseef17@gmail.com';
const COLLABORATOR_EMAILS = ['priyankadewan99@gmail.com', 'aseefk.812@gmail.com'];
const LIST_NAME = 'NYC Neighborhood Passport';
const LIST_DESCRIPTION =
  'World Cup 2026 NYC Neighborhood Passport stamp locations — shared between Aseef & Priyanka.';

const PASSPORT_CONFIG = {
  referenceImageUrl: '/passport/all-stamps.png',
  googleMapsListUrl: 'https://maps.app.goo.gl/5WSDvDbFWcEj4SVo8',
  sheetUrl:
    'https://docs.google.com/spreadsheets/d/11QW5icu14Bpc6xeGz3JTAryJkFGdGZshCn4W5byJImE/edit?usp=sharing',
};

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function stableManualId(name) {
  const hash = createHash('sha256').update(name.trim().toLowerCase()).digest('hex').slice(0, 16);
  return `manual_passport_${hash}`;
}

function resolveGooglePlaceId(place) {
  if (place.googlePlaceId) return place.googlePlaceId.replace(/^places\//, '');
  const url = place.googleMapsUrl || '';
  const cidMatch = url.match(/!1s([^!]+)/);
  if (cidMatch?.[1] && !cidMatch[1].startsWith('0x')) {
    return cidMatch[1];
  }
  const placeIdMatch = url.match(/place\/[^/]+\/(@[^/]+,)?data=![^!]*!1s([^!]+)/);
  if (placeIdMatch?.[2]) return placeIdMatch[2];
  return stableManualId(place.name);
}

async function findUserByEmail(auth, db, email) {
  const normalized = email.toLowerCase();
  try {
    const record = await auth.getUserByEmail(normalized);
    const profile = await db.collection('users').doc(record.uid).get();
    return {
      uid: record.uid,
      email: record.email || normalized,
      username: profile.exists ? profile.data().username || '' : '',
    };
  } catch {
    return null;
  }
}

async function addCollaborator(db, listRef, listData, user) {
  const existing = (listData.collaborators || []).some(
    (c) => c.userId === user.uid || c.email?.toLowerCase() === user.email.toLowerCase()
  );
  if (existing) {
    console.log(`Collaborator already on list: ${user.email}`);
    return;
  }

  const now = admin.firestore.Timestamp.now();
  const newCollaborator = {
    userId: user.uid,
    username: user.username,
    email: user.email,
    permission: 'editor',
    invitedAt: now,
    joinedAt: now,
  };

  const collaborators = [...(listData.collaborators || []), newCollaborator];
  const collaboratorIds = Array.from(
    new Set([...(listData.collaboratorIds || []), listData.ownerId, user.uid])
  );
  const editorIds = Array.from(
    new Set([
      ...(listData.editorIds || []),
      ...collaborators
        .filter((c) => c.permission === 'owner' || c.permission === 'editor')
        .map((c) => c.userId),
    ])
  );

  if (DRY_RUN) {
    console.log(`[dry-run] Would add collaborator ${user.email}`);
    return;
  }

  await listRef.update({
    collaborators,
    collaboratorIds,
    editorIds,
    updatedAt: now,
  });
  console.log(`Added collaborator: ${user.email}`);
}

async function importPlaces(db, listId, ownerId, places, listData) {
  const BATCH_SIZE = 120; // 3 writes per place → 360 ops max per batch
  let imported = 0;
  const collaboratorIds = Array.from(
    new Set(listData.collaboratorIds?.length ? listData.collaboratorIds : [ownerId])
  );
  const accessFields = {
    listOwnerId: ownerId,
    listIsPublic: listData.isPublic === true,
    listCollaboratorIds: collaboratorIds,
  };

  for (let i = 0; i < places.length; i += BATCH_SIZE) {
    const chunk = places.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    const placeIds = [];

    for (const place of chunk) {
      const googlePlaceId = resolveGooglePlaceId(place);
      const membershipId = `${listId}_${googlePlaceId}`;
      const now = admin.firestore.Timestamp.now();
      const location = place.location || { lat: 0, lng: 0 };

      const googlePlacePayload = {
        name: place.name,
        address: place.address || '',
        location,
        googleMapsUrl: place.googleMapsUrl || null,
        passportStampId: place.passportStampId || null,
        passportCategory: place.passportCategory || null,
        createdAt: now,
        updatedAt: now,
      };

      const membershipPayload = {
        listId,
        ...accessFields,
        googlePlaceId,
        status: 'not_visited',
        notes: place.notes || null,
        addedBy: ownerId,
        addedAt: now,
        updatedAt: now,
        suppressNotifications: true,
      };

      batch.set(db.collection('googlePlaces').doc(googlePlaceId), googlePlacePayload, {
        merge: true,
      });
      batch.set(db.collection('listPlaces').doc(membershipId), membershipPayload, { merge: true });
      placeIds.push(googlePlaceId);
      imported++;
    }

    if (!DRY_RUN) {
      await batch.commit();
      await db
        .collection('lists')
        .doc(listId)
        .update({
          placeIds: admin.firestore.FieldValue.arrayUnion(...placeIds),
          importInProgress: true,
          updatedAt: admin.firestore.Timestamp.now(),
        });
    }

    console.log(
      `${DRY_RUN ? '[dry-run] ' : ''}Imported batch ${Math.floor(i / BATCH_SIZE) + 1}: ${chunk.length} places`
    );
  }

  if (!DRY_RUN) {
    await db.collection('lists').doc(listId).update({
      importInProgress: false,
      lastImportCount: imported,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  return imported;
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId:
        process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'places-maps-list-app',
    });
  }

  const db = admin.firestore();
  const auth = admin.auth();
  const places = JSON.parse(
    readFileSync(join(__dirname, 'data/nyc-passport-places.json'), 'utf8')
  ).places;

  console.log(`Loaded ${places.length} places for import`);
  if (DRY_RUN) console.log('DRY RUN — no Firestore writes');

  const owner = await findUserByEmail(auth, db, OWNER_EMAIL);
  if (!owner) {
    throw new Error(`Owner account not found for ${OWNER_EMAIL}. Sign up in the app first.`);
  }
  console.log(`Owner: ${owner.email} (${owner.uid})`);

  for (const email of COLLABORATOR_EMAILS) {
    const user = await findUserByEmail(auth, db, email);
    if (!user) {
      console.warn(`Collaborator ${email} not found yet — sign up in the app, then re-run.`);
    }
  }

  let listId = process.env.LIST_ID;
  let listRef;
  let listData;

  if (listId) {
    listRef = db.collection('lists').doc(listId);
    const snap = await listRef.get();
    if (!snap.exists) throw new Error(`List ${listId} not found`);
    listData = snap.data();
    console.log(`Using existing list: ${listId}`);
  } else {
    const now = admin.firestore.Timestamp.now();
    listRef = db.collection('lists').doc();
    listId = listRef.id;
    listData = {
      name: LIST_NAME,
      description: LIST_DESCRIPTION,
      isPublic: false,
      ownerId: owner.uid,
      collaborators: [
        {
          userId: owner.uid,
          username: owner.username,
          email: owner.email,
          permission: 'owner',
          invitedAt: now,
          joinedAt: now,
        },
      ],
      collaboratorIds: [owner.uid],
      editorIds: [owner.uid],
      placeIds: [],
      customStatuses: [],
      tags: ['world-cup', 'passport', 'nyc'],
      icon: 'AUTO',
      color: 'Blue',
      iconSize: 36,
      listKind: 'nyc_passport',
      passportConfig: PASSPORT_CONFIG,
      importInProgress: false,
      createdAt: now,
      updatedAt: now,
      createdBy: owner.uid,
      updatedBy: owner.uid,
    };

    if (DRY_RUN) {
      console.log(`[dry-run] Would create list ${listId}`);
    } else {
      await listRef.set(listData);
      console.log(`Created list: ${listId}`);
    }
  }

  if (!listData.listKind && !DRY_RUN) {
    await listRef.update({
      listKind: 'nyc_passport',
      passportConfig: PASSPORT_CONFIG,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  const count = await importPlaces(db, listId, owner.uid, places, listData);
  console.log(`${DRY_RUN ? '[dry-run] Would import' : 'Imported'} ${count} places`);

  if (COLLABORATOR_EMAILS.length) {
    const freshList = DRY_RUN ? listData : (await listRef.get()).data();
    for (const email of COLLABORATOR_EMAILS) {
      const user = await findUserByEmail(auth, db, email);
      if (user) {
        await addCollaborator(db, listRef, freshList, user);
        freshList.collaborators = (await listRef.get()).data().collaborators;
        freshList.collaboratorIds = (await listRef.get()).data().collaboratorIds;
        freshList.editorIds = (await listRef.get()).data().editorIds;
      }
    }
  }

  console.log('\n✅ NYC Passport list ready');
  console.log(`   List ID: ${listId}`);
  console.log(`   Open: /list/${listId}`);
  console.log(
    '\n   Next: npm run passport:enrich   # fetch ratings, hours, photos from Google Places API'
  );
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
