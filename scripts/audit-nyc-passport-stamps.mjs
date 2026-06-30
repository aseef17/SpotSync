#!/usr/bin/env node
/**
 * Audits NYC Passport stamp linkage: Google Sheet vs Firestore vs import JSON.
 *
 * Usage:
 *   node scripts/audit-nyc-passport-stamps.mjs
 *   LIST_ID=abc123 node scripts/audit-nyc-passport-stamps.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEFAULT_LIST_ID,
  fetchSheetRows,
  loadPassportPlacesJson,
  normalizeName,
  resolveGooglePlaceIdFromImport,
  stampNameToId,
} from './lib/nyc-passport-utils.mjs';

const require = createRequire(import.meta.url);
const admin = require(
  join(dirname(fileURLToPath(import.meta.url)), '../functions/node_modules/firebase-admin')
);

const LIST_ID = process.env.LIST_ID || DEFAULT_LIST_ID;

function findImportPlace(importPlaces, title) {
  const normalizedTitle = normalizeName(title);
  return importPlaces.find((place) => normalizeName(place.name) === normalizedTitle);
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'places-maps-list-app' });
  }

  const db = admin.firestore();
  const importPlaces = loadPassportPlacesJson();
  const sheetRows = await fetchSheetRows();

  const memberships = await db.collection('listPlaces').where('listId', '==', LIST_ID).get();
  const googlePlaceIds = memberships.docs.map((doc) => doc.data().googlePlaceId);
  const googlePlaceSnaps = await Promise.all(
    googlePlaceIds.map((id) => db.collection('googlePlaces').doc(id).get())
  );

  const firestoreByName = new Map();
  for (const snap of googlePlaceSnaps) {
    if (!snap.exists) continue;
    const data = snap.data();
    firestoreByName.set(normalizeName(data.name), {
      googlePlaceId: snap.id,
      passportStampId: data.passportStampId || null,
      passportCategory: data.passportCategory || null,
    });
  }

  const importByName = new Map(importPlaces.map((place) => [normalizeName(place.name), place]));

  const sheetWithStamp = sheetRows.filter((row) => row.stamp && row.stamp !== 'Stamp');
  const sheetStampedUnique = new Set(sheetWithStamp.map((row) => normalizeName(row.title)));

  let matchedFirestore = 0;
  let missingInFirestore = 0;
  let stampMismatch = 0;
  let missingStampInFirestore = 0;
  const issues = [];

  for (const row of sheetWithStamp) {
    const expectedStampId = stampNameToId(row.stamp);
    const normalizedTitle = normalizeName(row.title);
    const firestorePlace = firestoreByName.get(normalizedTitle);
    const importPlace =
      importByName.get(normalizedTitle) || findImportPlace(importPlaces, row.title);

    if (!expectedStampId) {
      issues.push({ type: 'unknown-stamp-name', row, expectedStampId });
      continue;
    }

    if (!firestorePlace) {
      missingInFirestore += 1;
      issues.push({
        type: 'missing-in-firestore',
        title: row.title,
        expectedStampId,
        importStampId: importPlace?.passportStampId || null,
      });
      continue;
    }

    matchedFirestore += 1;

    if (!firestorePlace.passportStampId) {
      missingStampInFirestore += 1;
      issues.push({
        type: 'missing-stamp-in-firestore',
        title: row.title,
        expectedStampId,
        importStampId: importPlace?.passportStampId || null,
      });
    } else if (firestorePlace.passportStampId !== expectedStampId) {
      stampMismatch += 1;
      issues.push({
        type: 'stamp-mismatch',
        title: row.title,
        expectedStampId,
        actualStampId: firestorePlace.passportStampId,
        sheetStamp: row.stamp,
      });
    }
  }

  const firestoreStamped = [...firestoreByName.values()].filter((p) => p.passportStampId).length;
  const importStamped = importPlaces.filter((p) => p.passportStampId).length;

  console.log('\n=== NYC Passport Stamp Audit ===\n');
  console.log(`List ID: ${LIST_ID}`);
  console.log(
    `Sheet rows (with stamp): ${sheetWithStamp.length} (${sheetStampedUnique.size} unique titles)`
  );
  console.log(`Import JSON places: ${importPlaces.length} (${importStamped} with stamp)`);
  console.log(
    `Firestore memberships: ${memberships.size} (${firestoreStamped} with stamp in googlePlaces)`
  );
  console.log('');
  console.log(`Sheet rows matched in Firestore: ${matchedFirestore}`);
  console.log(`Sheet rows missing in Firestore: ${missingInFirestore}`);
  console.log(`Firestore missing stamp (sheet expects one): ${missingStampInFirestore}`);
  console.log(`Stamp ID mismatches: ${stampMismatch}`);

  if (issues.length) {
    console.log('\n--- Issues (first 25) ---');
    for (const issue of issues.slice(0, 25)) {
      console.log(JSON.stringify(issue));
    }
    if (issues.length > 25) {
      console.log(`... and ${issues.length - 25} more`);
    }
  } else {
    console.log('\nAll sheet stamp rows match Firestore.');
  }

  const sheetTitles = new Set(sheetWithStamp.map((row) => normalizeName(row.title)));
  const importStampedNotInSheet = importPlaces.filter(
    (place) => place.passportStampId && !sheetTitles.has(normalizeName(place.name))
  );
  if (importStampedNotInSheet.length) {
    console.log(`\nImport places with stamp not in sheet (${importStampedNotInSheet.length}):`);
    for (const place of importStampedNotInSheet.slice(0, 10)) {
      console.log(`  - ${place.name} (${place.passportStampId})`);
    }
  }
}

main().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
