import { writeBatch } from 'firebase/firestore';
import type { PlaceList } from '@/features/lists/types/list';
import {
  assertUserCanWriteList,
  reconcileListPermissionsIfOwner,
} from '@/features/lists/utils/listPermissionSync';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { googlePlaceDocRef } from '@/features/places/api/googlePlaceFirestore';
import { listPlaceMembershipDocRef } from '@/features/places/api/listPlaceMembershipFirestore';
import { PlaceService } from '@/features/places/api/placeService';
import {
  deletePlaceMembership,
} from '@/features/places/api/placeFirestoreWrite';
import type { Place } from '@/features/places/types/place';
import { fetchListAccessFieldsForWrite } from '@/features/places/utils/fetchListAccessFieldsForWrite';
import { createPlaceFromGoogleDetails } from '@/features/places/utils/placeFactory';
import { toPlaceListAccessQuery } from '@/features/places/utils/placeAccess';
import { buildGooglePlacePayload } from '@/features/places/utils/placeWriteSplit';
import { migrateLegacyMembershipToCanonical, mergeMembershipProgressFields } from '@/features/places/utils/resolveWritableMembershipId';
import { stablePassportManualId } from '@/features/places/utils/stablePassportManualId';
import { fetchGroupedPassportSheetVenues } from '@/features/passport/lib/parsePassportSheet';
import { normalizePassportName } from '@/features/passport/utils/normalizePassportName';
import {
  getPassportStampIds,
  mergePassportStampIds,
  primaryPassportStampId,
} from '@/features/passport/utils/passportStampIds';
import { db } from '@/lib/firebase';
import { placeRepository } from '@/lib/localDb/repositories/placeRepository';
import { logger } from '@/utils/logger';
import { omitUndefined } from '@/utils/objectUtils';

const BATCH_SIZE = 120;
const ENRICH_BATCH_SIZE = 5;
const NYC_LOCATION_BIAS = { lat: 40.7128, lng: -74.006 };

export interface PassportSheetSyncResult {
  sheetVenues: number;
  updated: number;
  created: number;
  unchanged: number;
  skipped: number;
  /** Orphan manual_passport_* rows removed after matching a canonical place by name. */
  cleaned: number;
}

interface SheetVenue {
  title: string;
  normalizedTitle: string;
  stampIds: string[];
  notes: string[];
  location: string;
  passportCategory?: string;
}

interface PendingVenueUpdate {
  googlePlaceId: string;
  membershipId: string;
  stampIds: string[];
  passportCategory?: string;
  notes?: string;
  enrichment?: Omit<Place, 'id'>;
}

function notesFromSheet(notes: string[]): string | undefined {
  if (!notes.length) return undefined;
  return notes.join('\n');
}

function stampIdsChanged(existing: string[], next: string[]): boolean {
  if (existing.length !== next.length) return true;
  return existing.some((id, index) => id !== next[index]);
}

function indexPlacesByName(places: Place[]): Map<string, Place> {
  const placesByName = new Map<string, Place>();
  for (const place of places) {
    const key = normalizePassportName(place.name);
    if (key && !placesByName.has(key)) {
      placesByName.set(key, place);
    }
  }
  return placesByName;
}

function indexPlacesByGooglePlaceId(places: Place[]): Map<string, Place> {
  const byGooglePlaceId = new Map<string, Place>();
  for (const place of places) {
    if (place.googlePlaceId && !byGooglePlaceId.has(place.googlePlaceId)) {
      byGooglePlaceId.set(place.googlePlaceId, place);
    }
  }
  return byGooglePlaceId;
}

function needsPlaceEnrichment(place: Place): boolean {
  const lat = place.location?.lat ?? 0;
  const lng = place.location?.lng ?? 0;
  return lat === 0 && lng === 0;
}

function passportFieldsFromVenue(
  venue: SheetVenue,
  userId: string,
  now: Date
): Pick<Place, 'passportStampIds' | 'passportStampId' | 'passportCategory' | 'notes' | 'updatedAt' | 'updatedBy'> {
  const stampIds = mergePassportStampIds(venue.stampIds);
  return {
    passportStampIds: stampIds,
    passportStampId: primaryPassportStampId({ passportStampIds: stampIds }),
    passportCategory: venue.passportCategory,
    notes: notesFromSheet(venue.notes),
    updatedAt: now,
    updatedBy: userId,
  };
}

function findExistingPlace(
  venue: SheetVenue,
  manualGooglePlaceId: string,
  canonicalGooglePlaceId: string | undefined,
  placesByName: Map<string, Place>,
  placesByGooglePlaceId: Map<string, Place>
): Place | null {
  if (canonicalGooglePlaceId) {
    const byCanonical = placesByGooglePlaceId.get(canonicalGooglePlaceId);
    if (byCanonical) return byCanonical;
  }

  const byName = placesByName.get(venue.normalizedTitle);
  if (byName) return byName;

  return placesByGooglePlaceId.get(manualGooglePlaceId) ?? null;
}

function queueVenueUpdate(
  existing: Place & { googlePlaceId: string },
  venue: SheetVenue,
  pendingUpdates: PendingVenueUpdate[],
  result: PassportSheetSyncResult,
  enrichment?: Omit<Place, 'id'>
): void {
  const stampIds = mergePassportStampIds(venue.stampIds);
  const sheetNotes = notesFromSheet(venue.notes);
  const currentStampIds = getPassportStampIds(existing);
  const categoryChanged = (existing.passportCategory || '') !== (venue.passportCategory || '');
  const notesChanged = sheetNotes !== undefined && sheetNotes !== (existing.notes || '');
  const stampsChanged = stampIdsChanged(currentStampIds, stampIds);

  if (!stampsChanged && !categoryChanged && !notesChanged && !enrichment) {
    result.unchanged += 1;
    return;
  }

  pendingUpdates.push({
    googlePlaceId: existing.googlePlaceId,
    membershipId: existing.id,
    stampIds,
    passportCategory: venue.passportCategory,
    notes: sheetNotes ?? existing.notes,
    enrichment,
  });
}

async function enrichVenueFromSheet(venue: SheetVenue) {
  return GoogleMapsService.resolvePlaceDetailsForImport({
    title: venue.title,
    location: NYC_LOCATION_BIAS,
  });
}

async function buildEnrichedPlace(
  venue: SheetVenue,
  listId: string,
  userId: string,
  accessFields: Awaited<ReturnType<typeof fetchListAccessFieldsForWrite>>,
  now: Date
): Promise<{ place: Omit<Place, 'id' | 'addedAt' | 'updatedAt'>; googlePlaceId: string } | null> {
  const { details, canonicalId } = await enrichVenueFromSheet(venue);
  const passportFields = passportFieldsFromVenue(venue, userId, now);

  if (details && canonicalId) {
    const factoryPlace = createPlaceFromGoogleDetails(details, listId, userId, {
      ...passportFields,
      address: details.formatted_address || venue.location || '',
      status: 'not_visited',
      ...accessFields,
    });
    const { id: _id, addedAt: _addedAt, updatedAt: _updatedAt, ...place } = factoryPlace;
    return { place, googlePlaceId: canonicalId };
  }

  const googlePlaceId = await stablePassportManualId(venue.title);
  return {
    googlePlaceId,
    place: {
      listId,
      googlePlaceId,
      name: venue.title,
      address: venue.location || '',
      location: { lat: 0, lng: 0 },
      ...passportFields,
      status: 'not_visited',
      addedBy: userId,
      ...accessFields,
    },
  };
}

async function upgradeManualPlaceToCanonical(options: {
  listId: string;
  existing: Place;
  enrichedPlace: Omit<Place, 'id' | 'addedAt' | 'updatedAt'>;
  canonicalGooglePlaceId: string;
  now: Date;
}): Promise<{ googlePlaceId: string; membershipId: string }> {
  const { listId, existing, enrichedPlace, canonicalGooglePlaceId, now } = options;
  const legacyGooglePlaceId = existing.googlePlaceId;

  if (!legacyGooglePlaceId || legacyGooglePlaceId === canonicalGooglePlaceId) {
    return { googlePlaceId: canonicalGooglePlaceId, membershipId: existing.id };
  }

  const googlePlacePayload = buildGooglePlacePayload(
    { ...enrichedPlace, listId },
    canonicalGooglePlaceId,
    { createdAt: now, updatedAt: now }
  );
  const googlePlaceBatch = writeBatch(db);
  googlePlaceBatch.set(googlePlaceDocRef(canonicalGooglePlaceId), googlePlacePayload, {
    merge: true,
  });
  await googlePlaceBatch.commit();

  const migratedMembershipId = await migrateLegacyMembershipToCanonical(
    listId,
    existing.id,
    canonicalGooglePlaceId
  );

  return { googlePlaceId: canonicalGooglePlaceId, membershipId: migratedMembershipId };
}

function findManualPassportDuplicates(places: Place[]): Array<{ manual: Place; keep: Place }> {
  const byName = new Map<string, Place[]>();
  for (const place of places) {
    const key = normalizePassportName(place.name);
    if (!key) continue;
    const group = byName.get(key) ?? [];
    group.push(place);
    byName.set(key, group);
  }

  const duplicates: Array<{ manual: Place; keep: Place }> = [];
  for (const group of byName.values()) {
    const manuals = group.filter((place) => place.googlePlaceId?.startsWith('manual_passport_'));
    if (manuals.length === 0) continue;

    const keepers = group.filter((place) => !place.googlePlaceId?.startsWith('manual_passport_'));
    if (keepers.length === 0) continue;

    const keep =
      keepers.find((place) => !needsPlaceEnrichment(place)) ??
      keepers.reduce((best, place) => {
        const bestTime = best.updatedAt?.getTime() ?? 0;
        const placeTime = place.updatedAt?.getTime() ?? 0;
        return placeTime > bestTime ? place : best;
      });

    for (const manual of manuals) {
      if (manual.googlePlaceId !== keep.googlePlaceId) {
        duplicates.push({ manual, keep });
      }
    }
  }

  return duplicates;
}

async function cleanupManualPassportDuplicates(options: {
  listId: string;
  userId: string;
  places: Place[];
  now: Date;
}): Promise<number> {
  const duplicates = findManualPassportDuplicates(options.places);
  let cleaned = 0;

  for (const { manual, keep } of duplicates) {
    if (!keep.googlePlaceId || !manual.googlePlaceId) continue;

    try {
      const manualStamps = getPassportStampIds(manual);
      const keepStamps = getPassportStampIds(keep);
      const mergedStamps = mergePassportStampIds([...keepStamps, ...manualStamps]);
      const stampsNeedMerge = stampIdsChanged(keepStamps, mergedStamps);
      const mergedNotes =
        manual.notes && keep.notes && manual.notes !== keep.notes
          ? `${keep.notes}\n${manual.notes}`
          : manual.notes || keep.notes;
      const progressPatch = mergeMembershipProgressFields(keep, manual);

      if (
        stampsNeedMerge ||
        mergedNotes !== keep.notes ||
        Object.keys(progressPatch).length > 0
      ) {
        const batch = writeBatch(db);
        if (stampsNeedMerge) {
          batch.set(
            googlePlaceDocRef(keep.googlePlaceId),
            omitUndefined({
              passportStampIds: mergedStamps,
              passportStampId: primaryPassportStampId({ passportStampIds: mergedStamps }),
              passportCategory: keep.passportCategory || manual.passportCategory,
              updatedAt: options.now,
            }),
            { merge: true }
          );
        }
        if (mergedNotes !== keep.notes || Object.keys(progressPatch).length > 0) {
          batch.set(
            listPlaceMembershipDocRef(keep.id),
            omitUndefined({
              ...progressPatch,
              notes: mergedNotes,
              updatedAt: options.now,
              updatedBy: options.userId,
            }),
            { merge: true }
          );
        }
        await batch.commit();
      }

      await deletePlaceMembership(manual.id, options.listId);
      cleaned += 1;
    } catch (error) {
      logger.error('Failed to clean up duplicate passport place:', error, { manual, keep });
    }
  }

  return cleaned;
}

async function enrichVenuesInBatches<T>(
  items: T[],
  enricher: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += ENRICH_BATCH_SIZE) {
    const batch = items.slice(i, i + ENRICH_BATCH_SIZE);
    await Promise.all(batch.map(enricher));
    if (i + ENRICH_BATCH_SIZE < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

export async function syncPassportListFromSheet(options: {
  listId: string;
  sheetUrl: string;
  userId: string;
  list: PlaceList;
}): Promise<PassportSheetSyncResult> {
  const { listId, sheetUrl, userId } = options;
  let list = await reconcileListPermissionsIfOwner(listId, options.list, userId);
  assertUserCanWriteList(list, userId);

  const groupedVenues = await fetchGroupedPassportSheetVenues(sheetUrl);
  const places = await placeRepository.getAllForList(toPlaceListAccessQuery(listId, userId, list));
  const placesByName = indexPlacesByName(places);
  const placesByGooglePlaceId = indexPlacesByGooglePlaceId(places);

  const accessFields = await fetchListAccessFieldsForWrite(listId);
  const now = new Date();
  const result: PassportSheetSyncResult = {
    sheetVenues: groupedVenues.length,
    updated: 0,
    created: 0,
    unchanged: 0,
    skipped: 0,
    cleaned: 0,
  };

  const pendingUpdates: PendingVenueUpdate[] = [];
  const venuesToCreate: SheetVenue[] = [];
  const venuesToEnrich: Array<{ venue: SheetVenue; existing: Place }> = [];

  for (const venue of groupedVenues) {
    const manualGooglePlaceId = await stablePassportManualId(venue.title);
    const existing =
      findExistingPlace(venue, manualGooglePlaceId, undefined, placesByName, placesByGooglePlaceId);

    if (existing?.googlePlaceId) {
      if (needsPlaceEnrichment(existing)) {
        venuesToEnrich.push({ venue, existing });
      } else {
        queueVenueUpdate(
          { ...existing, googlePlaceId: existing.googlePlaceId },
          venue,
          pendingUpdates,
          result
        );
      }
      continue;
    }

    venuesToCreate.push(venue);
  }

  await enrichVenuesInBatches(venuesToEnrich, async ({ venue, existing }) => {
    try {
      const built = await buildEnrichedPlace(venue, listId, userId, accessFields, now);
      if (!built) {
        result.skipped += 1;
        return;
      }

      let targetGooglePlaceId = built.googlePlaceId;
      let targetMembershipId = existing.id;
      let enrichment: Omit<Place, 'id'> | undefined = built.place;

      if (
        existing.googlePlaceId?.startsWith('manual_passport_') &&
        !built.googlePlaceId.startsWith('manual_passport_') &&
        existing.googlePlaceId !== built.googlePlaceId
      ) {
        const upgraded = await upgradeManualPlaceToCanonical({
          listId,
          existing,
          enrichedPlace: built.place,
          canonicalGooglePlaceId: built.googlePlaceId,
          now,
        });
        targetGooglePlaceId = upgraded.googlePlaceId;
        targetMembershipId = upgraded.membershipId;
        enrichment = undefined;
      }

      queueVenueUpdate(
        { ...existing, googlePlaceId: targetGooglePlaceId, id: targetMembershipId },
        venue,
        pendingUpdates,
        result,
        enrichment
      );
    } catch (error) {
      logger.error('Failed to enrich existing passport place from sheet row:', error, { venue });
      queueVenueUpdate(
        { ...existing, googlePlaceId: existing.googlePlaceId! },
        venue,
        pendingUpdates,
        result
      );
    }
  });

  const placesToCreate: Array<Omit<Place, 'id' | 'addedAt' | 'updatedAt'>> = [];

  for (let i = 0; i < venuesToCreate.length; i += ENRICH_BATCH_SIZE) {
    const batch = venuesToCreate.slice(i, i + ENRICH_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (venue) => {
        try {
          const manualGooglePlaceId = await stablePassportManualId(venue.title);
          const built = await buildEnrichedPlace(venue, listId, userId, accessFields, now);

          const existingAfterEnrich = findExistingPlace(
            venue,
            manualGooglePlaceId,
            built.googlePlaceId,
            placesByName,
            placesByGooglePlaceId
          );

          if (existingAfterEnrich?.googlePlaceId) {
            queueVenueUpdate(
              { ...existingAfterEnrich, googlePlaceId: existingAfterEnrich.googlePlaceId },
              venue,
              pendingUpdates,
              result,
              needsPlaceEnrichment(existingAfterEnrich) ? built.place : undefined
            );
            return null;
          }

          return built.place;
        } catch (error) {
          logger.error('Failed to enrich passport place from sheet row:', error, { venue });
          result.skipped += 1;
          return null;
        }
      })
    );

    for (const place of batchResults) {
      if (place) placesToCreate.push(place);
    }

    if (i + ENRICH_BATCH_SIZE < venuesToCreate.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  if (placesToCreate.length > 0) {
    const bulkResult = await PlaceService.bulkCreatePlaces(listId, placesToCreate, {
      suppressNotifications: true,
    });
    result.created += bulkResult.successCount;
    result.skipped += bulkResult.failedCount;
    if (bulkResult.errors.length > 0) {
      logger.error('Some passport places failed bulk create:', bulkResult.errors);
    }
  }

  for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
    const chunk = pendingUpdates.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const update of chunk) {
      const primaryStampId = update.stampIds[0];
      const stampPatch = omitUndefined({
        passportStampIds: update.stampIds,
        passportStampId: primaryStampId,
        passportCategory: update.passportCategory,
        updatedAt: now,
      });

      if (update.enrichment) {
        const enrichmentPayload = buildGooglePlacePayload(
          { ...update.enrichment, ...stampPatch, listId },
          update.googlePlaceId,
          { updatedAt: now }
        );
        batch.set(googlePlaceDocRef(update.googlePlaceId), enrichmentPayload, { merge: true });
      } else {
        batch.set(googlePlaceDocRef(update.googlePlaceId), stampPatch, { merge: true });
      }

      if (update.notes !== undefined) {
        batch.set(
          listPlaceMembershipDocRef(update.membershipId),
          {
            notes: update.notes,
            updatedAt: now,
            updatedBy: userId,
          },
          { merge: true }
        );
      }
    }

    await batch.commit();
    result.updated += chunk.length;
  }

  const refreshedPlaces = await placeRepository.getAllForList(
    toPlaceListAccessQuery(listId, userId, list)
  );
  result.cleaned = await cleanupManualPassportDuplicates({
    listId,
    userId,
    places: refreshedPlaces,
    now,
  });

  return result;
}
