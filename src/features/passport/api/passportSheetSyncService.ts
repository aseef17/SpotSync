import { writeBatch } from 'firebase/firestore';
import type { PlaceList } from '@/features/lists/types/list';
import { googlePlaceDocRef } from '@/features/places/api/googlePlaceFirestore';
import { listPlaceMembershipDocRef } from '@/features/places/api/listPlaceMembershipFirestore';
import { writePlaceCreateAndLinkToList } from '@/features/places/api/placeFirestoreWrite';
import type { Place } from '@/features/places/types/place';
import { fetchListAccessFieldsForWrite } from '@/features/places/utils/fetchListAccessFieldsForWrite';
import { toPlaceListAccessQuery } from '@/features/places/utils/placeAccess';
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

export interface PassportSheetSyncResult {
  sheetVenues: number;
  updated: number;
  created: number;
  unchanged: number;
  skipped: number;
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

function queueVenueUpdate(
  existing: Place & { googlePlaceId: string },
  venue: {
    stampIds: string[];
    passportCategory?: string;
    notes: string[];
  },
  pendingUpdates: Array<{
    googlePlaceId: string;
    membershipId: string;
    stampIds: string[];
    passportCategory?: string;
    notes?: string;
  }>,
  result: PassportSheetSyncResult
): void {
  const stampIds = mergePassportStampIds(venue.stampIds);
  const sheetNotes = notesFromSheet(venue.notes);
  const currentStampIds = getPassportStampIds(existing);
  const categoryChanged = (existing.passportCategory || '') !== (venue.passportCategory || '');
  const notesChanged = sheetNotes !== undefined && sheetNotes !== (existing.notes || '');
  const stampsChanged = stampIdsChanged(currentStampIds, stampIds);

  if (!stampsChanged && !categoryChanged && !notesChanged) {
    result.unchanged += 1;
    return;
  }

  pendingUpdates.push({
    googlePlaceId: existing.googlePlaceId,
    membershipId: existing.id,
    stampIds,
    passportCategory: venue.passportCategory,
    notes: sheetNotes ?? existing.notes,
  });
}

export async function syncPassportListFromSheet(options: {
  listId: string;
  sheetUrl: string;
  userId: string;
  list: Pick<PlaceList, 'ownerId' | 'isPublic'>;
}): Promise<PassportSheetSyncResult> {
  const { listId, sheetUrl, userId, list } = options;
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
  };

  const pendingUpdates: Array<{
    googlePlaceId: string;
    membershipId: string;
    stampIds: string[];
    passportCategory?: string;
    notes?: string;
  }> = [];

  for (const venue of groupedVenues) {
    const stampIds = mergePassportStampIds(venue.stampIds);
    const existingByName = placesByName.get(venue.normalizedTitle);
    const manualGooglePlaceId = await stablePassportManualId(venue.title);
    const existing =
      existingByName ?? placesByGooglePlaceId.get(manualGooglePlaceId) ?? null;

    if (existing?.googlePlaceId) {
      queueVenueUpdate(
        { ...existing, googlePlaceId: existing.googlePlaceId },
        venue,
        pendingUpdates,
        result
      );
      continue;
    }

    try {
      const googlePlaceId = manualGooglePlaceId;
      const membershipId = `${listId}_${googlePlaceId}`;
      const placePayload: Omit<Place, 'id'> = {
        listId,
        googlePlaceId,
        name: venue.title,
        address: venue.location || '',
        location: { lat: 0, lng: 0 },
        passportStampIds: stampIds,
        passportStampId: primaryPassportStampId({ passportStampIds: stampIds }),
        passportCategory: venue.passportCategory,
        notes: notesFromSheet(venue.notes),
        status: 'not_visited',
        addedBy: userId,
        addedAt: now,
        updatedAt: now,
        updatedBy: userId,
        ...accessFields,
      };

      await writePlaceCreateAndLinkToList({
        listId,
        googlePlaceId,
        membershipId,
        place: placePayload,
        timestamps: { addedAt: now, updatedAt: now },
      });

      result.created += 1;
    } catch (error) {
      logger.error('Failed to create passport place from sheet row:', error, { venue });
      result.skipped += 1;
    }
  }

  for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
    const chunk = pendingUpdates.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const update of chunk) {
      const primaryStampId = update.stampIds[0];
      batch.set(
        googlePlaceDocRef(update.googlePlaceId),
        omitUndefined({
          passportStampIds: update.stampIds,
          passportStampId: primaryStampId,
          passportCategory: update.passportCategory,
          updatedAt: now,
        }),
        { merge: true }
      );

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

  return result;
}
