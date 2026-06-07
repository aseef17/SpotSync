import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { PlaceService } from '@/features/places/api/placeService';
import { placeRepository } from '@/lib/localDb/repositories/placeRepository';
import { ListService } from '@/features/lists/api/listService';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { parseTakeoutJson, type ParsedPlace } from '@/utils/googleTakeoutParser';
import type { Place } from '@/features/places/types/place';
import { parseGoogleMapsUrl, extractPlaceIdFromUrl } from '@/utils/googleMapsUrlParser';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/useToast';
import { createPlaceFromGoogleDetails } from '@/features/places/utils/placeFactory';
import type { LegacyGooglePlace } from '@/features/places/api/googleMapsService';
import { omit } from '@/utils/objects';

interface EnrichedPlace extends ParsedPlace {
  rawDetails?: LegacyGooglePlace;
}

const INITIAL_IMPORT_STATUS = { success: 0, failed: 0, skipped: 0 };

export const useGoogleMapsImport = (existingLists: { id: string; name: string }[] = []) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [placesFound, setPlacesFound] = useState<EnrichedPlace[]>([]);
  const [progress, setProgress] = useState(0);
  const [importStatus, setImportStatus] = useState(INITIAL_IMPORT_STATUS);
  const [skippedPlaces, setSkippedPlaces] = useState<EnrichedPlace[]>([]);
  const [failedPlaces, setFailedPlaces] = useState<EnrichedPlace[]>([]);
  const [importComplete, setImportComplete] = useState(false);
  const [lastImportedListId, setLastImportedListId] = useState<string | null>(null);

  const [targetListId, setTargetListId] = useState<string>('new');
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [userLists, setUserLists] = useState<{ id: string; name: string }[]>(existingLists);

  const [importUrl, setImportUrl] = useState('');

  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);

  useEffect(() => {
    if (existingLists.length > 0) {
      setUserLists(existingLists);
    }
  }, [existingLists]);

  const resetImportState = useCallback(() => {
    setFile(null);
    setParsing(false);
    setResolving(false);
    setPlacesFound([]);
    setProgress(0);
    setImportStatus(INITIAL_IMPORT_STATUS);
    setSkippedPlaces([]);
    setFailedPlaces([]);
    setImportComplete(false);
    setLastImportedListId(null);
    setImportUrl('');
    setEnriching(false);
    setEnrichProgress(0);
    setTargetListId('new');
    setNewListName('');
    setNewListDescription('');
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPlacesFound([]);
      setSkippedPlaces([]);
      setFailedPlaces([]);
      setImportStatus(INITIAL_IMPORT_STATUS);
      setProgress(0);
      setImportComplete(false);
      setLastImportedListId(null);
    }
  };

  const handleParseFile = async () => {
    if (!file) return;
    setParsing(true);
    setImportComplete(false);
    try {
      const text = await file.text();
      const places = parseTakeoutJson(text);
      setPlacesFound(places);
      setProgress(0);
    } catch (error) {
      logger.error('File parse error:', error);
      toast.error('Failed to parse file. Please ensure it is a valid Google Takeout JSON.');
    } finally {
      setParsing(false);
    }
  };

  const handleParseUrl = async () => {
    if (!importUrl) return;

    try {
      if (targetListId && targetListId !== 'new') {
        const placeId = extractPlaceIdFromUrl(importUrl);
        if (placeId) {
          const existingPlaces = await placeRepository.getAllForList(targetListId);
          if (existingPlaces.some((p) => p.googlePlaceId === placeId || p.id === placeId)) {
            toast.info('This place is already in the list.');
            return;
          }
        }
      }
    } catch (e) {
      logger.warn('Failed pre-check for existing place', e);
    }

    setParsing(true);
    setImportComplete(false);
    try {
      const result = await parseGoogleMapsUrl(importUrl);

      logger.debug('Parsed result:', result);

      const parsed: EnrichedPlace[] = result.places.map((p) => ({
        title: p.name,
        address: p.address,
        location: p.location,
        url: p.googleUrl,
        comment: p.note,
        placeId: extractPlaceIdFromUrl(p.googleUrl),
        googlePlaceId: p.cid,
        rating: p.rating,
        userRatingsTotal: p.userRatingsTotal,
      }));

      setPlacesFound(parsed);
      setNewListName(result.title);
      setProgress(0);
    } catch (error: unknown) {
      logger.error('URL parse error:', error);
      toast.error(`Failed to parse list: ${(error as Error).message}`);
    } finally {
      setParsing(false);
    }
  };

  const dedupePlaces = (
    candidates: EnrichedPlace[],
    existingMap: Map<string, boolean>
  ): { unique: EnrichedPlace[]; skipped: EnrichedPlace[] } => {
    const skipped: EnrichedPlace[] = [];
    const batchMap = new Set<string>();
    const unique: EnrichedPlace[] = [];

    for (const place of candidates) {
      const pAddr = place.address ? place.address.toLowerCase().trim() : '';
      const pName = place.title.toLowerCase().trim();
      const batchKey = place.placeId || place.googlePlaceId || `${pName}|${pAddr}`;

      if (batchMap.has(batchKey)) {
        skipped.push(place);
        continue;
      }
      batchMap.add(batchKey);

      if (place.googlePlaceId && existingMap.has(place.googlePlaceId)) {
        skipped.push(place);
        continue;
      }
      if (place.placeId && existingMap.has(place.placeId)) {
        skipped.push(place);
        continue;
      }
      if (existingMap.has(`${pName}|${pAddr}`)) {
        skipped.push(place);
        continue;
      }
      if (!pAddr && existingMap.has(`${pName}|`)) {
        skipped.push(place);
        continue;
      }

      unique.push(place);
    }

    return { unique, skipped };
  };

  const handleImport = async () => {
    if (!user || placesFound.length === 0) return;

    setResolving(true);
    setImportComplete(false);
    setProgress(0);
    setSkippedPlaces([]);
    setFailedPlaces([]);
    setLastImportedListId(null);

    try {
      let listId = targetListId;
      if (listId === 'new') {
        listId = await ListService.createList(
          user.id,
          newListName,
          newListDescription,
          'AUTO',
          'AUTO',
          36,
          false,
          user.email,
          user.username
        );
      }

      await ListService.ensureListExists(listId);

      logger.info(`Checking for duplicates in list ${listId}...`);
      const listPlaces = await placeRepository.getAllForList(listId);
      const existingMap = new Map<string, boolean>();

      listPlaces.forEach((p) => {
        if (p.googlePlaceId) existingMap.set(p.googlePlaceId, true);
        const addr = p.address ? p.address.toLowerCase().trim() : '';
        const name = p.name.toLowerCase().trim();
        if (name) existingMap.set(`${name}|${addr}`, true);
        if (name && !addr) existingMap.set(`${name}|`, true);
      });

      const { unique: uniquePlaces, skipped: preSkipped } = dedupePlaces(placesFound, existingMap);
      let skippedCount = preSkipped.length;
      setSkippedPlaces(preSkipped);

      if (uniquePlaces.length === 0) {
        toast.info(`All ${placesFound.length} places are already in this list.`);
        setImportStatus({ success: 0, failed: 0, skipped: skippedCount });
        setProgress(100);
        setImportComplete(true);
        setLastImportedListId(listId);
        return;
      }

      logger.info(`Enriching ${uniquePlaces.length} places...`);
      setEnriching(true);

      const placesToImport: EnrichedPlace[] = [];
      const seenImportGooglePlaceIds = new Set<string>();
      const enrichSkipped: EnrichedPlace[] = [];

      const BATCH_SIZE = 5;
      for (let i = 0; i < uniquePlaces.length; i += BATCH_SIZE) {
        const batch = uniquePlaces.slice(i, i + BATCH_SIZE);
        const progressPercent = Math.round(((i + batch.length) / uniquePlaces.length) * 100);
        setEnrichProgress(progressPercent);

        const batchPromises = batch.map(async (place) => {
          const enriched = { ...place };
          const { details, canonicalId } = await GoogleMapsService.resolvePlaceDetailsForImport({
            placeId: enriched.placeId,
            googlePlaceId: enriched.googlePlaceId,
            title: enriched.title,
            location: enriched.location,
          });

          if (details) {
            enriched.rawDetails = details;
            if (canonicalId) {
              enriched.googlePlaceId = canonicalId;
            }
            if (details.formatted_address) enriched.address = details.formatted_address;
            if (details.name) enriched.title = details.name;
            if (details.formatted_phone_number)
              enriched.phoneNumber = details.formatted_phone_number;
            if (details.website) enriched.website = details.website;
            if (details.rating) enriched.rating = details.rating;
          }
          return enriched;
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach((enriched) => {
          if (enriched.googlePlaceId && existingMap.has(enriched.googlePlaceId)) {
            skippedCount++;
            enrichSkipped.push(enriched);
            return;
          }
          if (enriched.googlePlaceId) {
            if (seenImportGooglePlaceIds.has(enriched.googlePlaceId)) {
              skippedCount++;
              enrichSkipped.push(enriched);
              return;
            }
            seenImportGooglePlaceIds.add(enriched.googlePlaceId);
          }
          placesToImport.push(enriched);
        });

        if (i + BATCH_SIZE < uniquePlaces.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      setEnriching(false);
      if (enrichSkipped.length > 0) {
        setSkippedPlaces((prev) => [...prev, ...enrichSkipped]);
      }

      if (placesToImport.length === 0) {
        toast.info('All places were skipped as duplicates.');
        setImportStatus({ success: 0, failed: 0, skipped: skippedCount });
        setProgress(100);
        setImportComplete(true);
        setLastImportedListId(listId);
        return;
      }

      const total = placesToImport.length;
      logger.info(`Preparing ${total} places for bulk import...`);

      const placesToCreate = placesToImport.map((placeData) => {
        const basePlace = {
          name: placeData.title,
          address: placeData.address || '',
          googleMapsUrl: placeData.url,
          status: 'not_visited' as const,
          addedBy: user.id,
        };

        if (placeData.rawDetails) {
          const factoryPlace = createPlaceFromGoogleDetails(placeData.rawDetails, listId, user.id, {
            notes: placeData.comment,
            clientId: `import-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          });

          const rest = omit(factoryPlace, ['id', 'addedAt', 'updatedAt']);
          return rest;
        }

        const placeToSave: Partial<Place> = {
          ...basePlace,
          listId,
          clientId: `import-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          location: placeData.location,
          notes: placeData.comment,
          googlePlaceId: (placeData.googlePlaceId || placeData.placeId) ?? undefined,
          phoneNumber: placeData.phoneNumber,
          website: placeData.website,
          rating: placeData.rating,
          userRatingsTotal: placeData.userRatingsTotal,
          priceLevel: placeData.priceLevel,
          photoUrls: placeData.photoUrls,
          category: placeData.category,
          types: placeData.types,
          cuisines: placeData.cuisines,
          openingHours: placeData.openingHours,
          openNow: placeData.openNow,
          delivery: placeData.delivery,
          dineIn: placeData.dineIn,
          takeout: placeData.takeout,
          reservable: placeData.reservable,
          servesBeer: placeData.servesBeer,
          servesWine: placeData.servesWine,
          servesVegetarianFood: placeData.servesVegetarianFood,
          wheelchairAccessible: placeData.wheelchairAccessible,
        };

        (Object.keys(placeToSave) as Array<keyof typeof placeToSave>).forEach((key) => {
          if (placeToSave[key] === undefined) {
            delete placeToSave[key];
          }
        });

        return placeToSave as Omit<Place, 'id' | 'addedAt' | 'updatedAt'>;
      });

      logger.info(`Starting bulk import of ${total} places...`);
      await ListService.beginBulkImport(listId, user.id);

      let result;
      try {
        result = await PlaceService.bulkCreatePlaces(listId, placesToCreate, {
          suppressNotifications: true,
        });
        await ListService.completeBulkImport(listId, result.successCount, user.id);
      } catch (importError) {
        await ListService.updateList(listId, { importInProgress: false }, user.id);
        throw importError;
      }

      if (result.errors && result.errors.length > 0) {
        const failures = result.errors
          .map((err) => placesToImport[err.index])
          .filter((place): place is EnrichedPlace => Boolean(place));
        setFailedPlaces(failures);
      }

      setProgress(100);
      setImportComplete(true);
      setLastImportedListId(listId);
      setImportStatus({
        success: result.successCount,
        failed: result.failedCount,
        skipped: skippedCount,
      });

      if (result.successCount > 0) {
        toast.success(`Imported ${result.successCount} places successfully`);
      } else if (result.failedCount > 0) {
        toast.error(`Failed to import ${result.failedCount} places`);
      }
      if (result.failedCount > 0 && result.successCount > 0) {
        toast.warning(`Failed to import ${result.failedCount} places`);
      }

      logger.info(
        `Import complete: ${result.successCount} added, ${result.failedCount} failed, ${skippedCount} skipped`
      );
    } catch (error) {
      logger.error('Import process failed:', error);
      setProgress(100);
      setImportComplete(true);
      toast.error(error instanceof Error ? error.message : 'Import failed. Please try again.');
    } finally {
      setResolving(false);
      setEnriching(false);
    }
  };

  return {
    state: {
      file,
      parsing,
      resolving,
      placesFound,
      skippedPlaces,
      failedPlaces,
      progress,
      importStatus,
      importComplete,
      lastImportedListId,
      targetListId,
      newListName,
      newListDescription,
      userLists,
      importUrl,
      enriching,
      enrichProgress,
    },
    actions: {
      setImportUrl,
      setTargetListId,
      setNewListName,
      setNewListDescription,
      handleFileChange,
      handleParseFile,
      handleParseUrl,
      handleImport,
      resetImportState,
    },
  };
};
