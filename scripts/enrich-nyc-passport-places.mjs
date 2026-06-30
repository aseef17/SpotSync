#!/usr/bin/env node
/**
 * Enriches existing NYC Passport googlePlaces docs with full Places API metadata,
 * matching the normal Google Maps import flow (ratings, review counts, hours, photos, etc.).
 *
 * Also bumps listPlaces membership updatedAt so clients re-resolve cached place views.
 *
 * Usage:
 *   node scripts/enrich-nyc-passport-places.mjs --dry-run
 *   node scripts/enrich-nyc-passport-places.mjs
 *   LIST_ID=abc123 node scripts/enrich-nyc-passport-places.mjs --limit=10
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEFAULT_LIST_ID,
  fetchPlaceDetails,
  googlePlaceDetailsToFirestore,
  loadGoogleMapsApiKey,
  loadPassportPlacesJson,
  normalizeName,
  omitUndefined,
  resolveGooglePlaceIdFromImport,
  searchPlaceId,
} from './lib/nyc-passport-utils.mjs';

const require = createRequire(import.meta.url);
const admin = require(
  join(dirname(fileURLToPath(import.meta.url)), '../functions/node_modules/firebase-admin')
);

const LIST_ID = process.env.LIST_ID || DEFAULT_LIST_ID;
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 0);
const SLEEP_MS = Number(process.env.PLACES_API_SLEEP_MS || 120);

const importPlaces = loadPassportPlacesJson();
const importByName = new Map(importPlaces.map((place) => [normalizeName(place.name), place]));
const importByGooglePlaceId = new Map(
  importPlaces.map((place) => [resolveGooglePlaceIdFromImport(place), place])
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function membershipDocId(listId, googlePlaceId) {
  return `${listId}_${googlePlaceId}`;
}

async function resolveCanonicalPlaceId(apiKey, googlePlaceId, importPlace) {
  if (googlePlaceId && !googlePlaceId.startsWith('manual_passport_')) {
    return googlePlaceId.replace(/^places\//, '');
  }

  if (!importPlace?.name) return null;

  return searchPlaceId(apiKey, {
    name: importPlace.name,
    lat: importPlace.location?.lat,
    lng: importPlace.location?.lng,
  });
}

async function repairListPlaceIds(db, listId) {
  const memberships = await db.collection('listPlaces').where('listId', '==', listId).get();
  const placeIds = [...new Set(memberships.docs.map((doc) => doc.data().googlePlaceId))].sort();

  if (!DRY_RUN) {
    await db.collection('lists').doc(listId).update({
      placeIds,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }

  return placeIds.length;
}

async function main() {
  const apiKey = loadGoogleMapsApiKey();

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'places-maps-list-app' });
  }

  const db = admin.firestore();
  const membershipsSnap = await db.collection('listPlaces').where('listId', '==', LIST_ID).get();
  const memberships = membershipsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const targets = LIMIT > 0 ? memberships.slice(0, LIMIT) : memberships;

  console.log(
    `${DRY_RUN ? '[dry-run] ' : ''}Enriching ${targets.length}/${memberships.length} places for list ${LIST_ID}`
  );

  let enriched = 0;
  let membershipTouched = 0;
  let failed = 0;

  for (const membership of targets) {
    const importPlace =
      importByGooglePlaceId.get(membership.googlePlaceId) ||
      importByName.get(normalizeName(membership.googlePlaceId));

    const displayName = importPlace?.name || membership.googlePlaceId;
    let googlePlaceId = membership.googlePlaceId;

    try {
      const canonicalId = await resolveCanonicalPlaceId(apiKey, googlePlaceId, importPlace);
      if (!canonicalId) {
        console.warn(`  skip (no place id): ${displayName}`);
        failed += 1;
        continue;
      }

      googlePlaceId = canonicalId;
      const details = await fetchPlaceDetails(apiKey, googlePlaceId);
      const converted = googlePlaceDetailsToFirestore(details);
      const now = admin.firestore.Timestamp.now();

      const payload = omitUndefined({
        ...converted,
        googlePlaceId,
        passportStampId: importPlace?.passportStampId || undefined,
        passportCategory: importPlace?.passportCategory || undefined,
        detailsFetchedAt: now,
        updatedAt: now,
      });

      if (!DRY_RUN) {
        const existing = await db.collection('googlePlaces').doc(googlePlaceId).get();
        if (!existing.exists) {
          payload.createdAt = now;
        }

        await db.collection('googlePlaces').doc(googlePlaceId).set(payload, { merge: true });

        const targetMembershipId = membershipDocId(LIST_ID, googlePlaceId);
        const targetMembershipRef = db.collection('listPlaces').doc(targetMembershipId);

        if (membership.id !== targetMembershipId) {
          const oldRef = db.collection('listPlaces').doc(membership.id);
          const oldSnap = await oldRef.get();
          if (oldSnap.exists) {
            await targetMembershipRef.set(
              {
                ...oldSnap.data(),
                id: targetMembershipId,
                googlePlaceId,
                updatedAt: now,
              },
              { merge: true }
            );
            await oldRef.delete();
          }
        } else {
          await targetMembershipRef.set({ updatedAt: now }, { merge: true });
        }

        membershipTouched += 1;
      }

      enriched += 1;
      const ratingLabel =
        converted.rating !== undefined
          ? `${converted.rating}★ (${converted.userRatingsTotal ?? 0} reviews)`
          : 'no rating';
      console.log(`  ok: ${payload.name || displayName} — ${ratingLabel}`);
      await sleep(SLEEP_MS);
    } catch (error) {
      failed += 1;
      console.warn(`  fail: ${displayName} — ${error.message}`);
      await sleep(SLEEP_MS);
    }
  }

  const placeIdCount = await repairListPlaceIds(db, LIST_ID);

  console.log('\nDone.');
  console.log(`  enriched: ${enriched}`);
  console.log(`  memberships touched: ${membershipTouched}`);
  console.log(`  list.placeIds repaired: ${placeIdCount}`);
  console.log(`  failed: ${failed}`);
  if (DRY_RUN) {
    console.log('No Firestore writes (dry run).');
  } else {
    console.log('\nRefresh the list in the app to see ratings and hours.');
    console.log('Then use "Sync photos" once to upload compressed images to Firebase Storage.');
  }
}

main().catch((err) => {
  console.error('Enrich failed:', err.message);
  process.exit(1);
});
