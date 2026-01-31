import { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { PlaceService } from '@/features/places/api/placeService';
import { ListService } from '@/features/lists/api/listService';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';
import { parseTakeoutJson, type ParsedPlace } from '@/utils/googleTakeoutParser';
import type { Place } from '@/features/places/types/place';
import { parseGoogleMapsUrl, extractPlaceIdFromUrl } from '@/utils/googleMapsUrlParser';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/useToast';

export const useGoogleMapsImport = (existingLists: { id: string; name: string }[] = []) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [placesFound, setPlacesFound] = useState<ParsedPlace[]>([]);
  const [progress, setProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<{
    success: number;
    failed: number;
    skipped: number;
  }>({ success: 0, failed: 0, skipped: 0 });
  const [skippedPlaces, setSkippedPlaces] = useState<ParsedPlace[]>([]);
  const [failedPlaces, setFailedPlaces] = useState<ParsedPlace[]>([]);

  const [targetListId, setTargetListId] = useState<string>('new');
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  // Initialize with passed lists
  const [userLists, setUserLists] = useState<{ id: string; name: string }[]>(existingLists);

  const [importUrl, setImportUrl] = useState('');

  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(0);

  // Sync prop changes if needed (optional, but good for real-time)
  useEffect(() => {
    if (existingLists.length > 0) {
      setUserLists(existingLists);
    }
  }, [existingLists]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPlacesFound([]); // Reset
      setSkippedPlaces([]);
      setFailedPlaces([]);
      setImportStatus({ success: 0, failed: 0, skipped: 0 });
    }
  };

  const handleParseFile = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const text = await file.text();
      const places = parseTakeoutJson(text);
      setPlacesFound(places);
    } catch (error) {
      logger.error('File parse error:', error);
      toast.error('Failed to parse file. Please ensure it is a valid Google Takeout JSON.');
    } finally {
      setParsing(false);
    }
  };

  const handleParseUrl = async () => {
    if (!importUrl) return;
    setParsing(true);
    try {
      // Use client-side parser to bypass bot detection
      const result = await parseGoogleMapsUrl(importUrl);

      logger.debug('Parsed result:', result);

      const parsed: ParsedPlace[] = result.places.map((p) => ({
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
    } catch (error: unknown) {
      logger.error('URL parse error:', error);
      toast.error(`Failed to parse list: ${(error as Error).message}`);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!user || placesFound.length === 0) return;

    setResolving(true);
    setProgress(0);
    setSkippedPlaces([]);
    setFailedPlaces([]);
    let successCount = 0;
    let failedCount = 0;

    try {
      // 1. Determine Target List
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

      // 2. Build Existing Map
      logger.info(`Checking for duplicates in list ${listId}...`);
      const listPlaces = await PlaceService.getListPlaces(listId);
      const existingMap = new Map<string, boolean>();

      // Internal Dedupe Set (to avoid duplicates within the import batch itself)
      const batchMap = new Set<string>();

      listPlaces.forEach((p) => {
        if (p.googlePlaceId) existingMap.set(p.googlePlaceId, true);
        const addr = p.address ? p.address.toLowerCase().trim() : '';
        const name = p.name.toLowerCase().trim();
        if (name) existingMap.set(`${name}|${addr}`, true);
        if (name && !addr) existingMap.set(`${name}|`, true);
      });

      // 3. Pre-Enrichment Filter
      const uniquePlaces = placesFound.filter((p) => {
        // Internal Batch Dedupe
        const pAddr = p.address ? p.address.toLowerCase().trim() : '';
        const pName = p.title.toLowerCase().trim();
        const batchKey = p.googlePlaceId || `${pName}|${pAddr}`;

        if (batchMap.has(batchKey)) {
          setSkippedPlaces((prev) => [...prev, p]);
          return false;
        }
        batchMap.add(batchKey);

        // Existing List Dedupe
        if (p.googlePlaceId && existingMap.has(p.googlePlaceId)) {
          setSkippedPlaces((prev) => [...prev, p]);
          return false;
        }
        if (p.placeId && existingMap.has(p.placeId)) {
          setSkippedPlaces((prev) => [...prev, p]);
          return false;
        }

        if (existingMap.has(`${pName}|${pAddr}`)) {
          setSkippedPlaces((prev) => [...prev, p]);
          return false;
        }
        if (!pAddr && existingMap.has(`${pName}|`)) {
          setSkippedPlaces((prev) => [...prev, p]);
          return false;
        }

        return true;
      });

      let skippedCount = placesFound.length - uniquePlaces.length;

      if (uniquePlaces.length === 0) {
        toast.info(`All ${placesFound.length} places are already in this list.`);
        setImportStatus({ success: 0, failed: 0, skipped: skippedCount });
        setProgress(100);
        setResolving(false);
        return;
      }

      // 4. Data Enrichment & Post-Enrichment Dedupe
      logger.info(`Enriching ${uniquePlaces.length} places...`);
      setEnriching(true);

      const placesToImport: ParsedPlace[] = [];

      const BATCH_SIZE = 5;
      for (let i = 0; i < uniquePlaces.length; i += BATCH_SIZE) {
        const batch = uniquePlaces.slice(i, i + BATCH_SIZE);
        const progressPercent = Math.round(((i + batch.length) / uniquePlaces.length) * 100);
        setEnrichProgress(progressPercent);

        const batchPromises = batch.map(async (place) => {
          const enriched = { ...place };
          let details = null;

          // ... (Existing enrichment logic) ...
          // Strategy 1: Try ID
          if (enriched.googlePlaceId) {
            try {
              details = await GoogleMapsService.getPlaceDetails(enriched.googlePlaceId);
            } catch {
              /* ignore */
            }
          }

          // Strategy 2: Fallback Search
          if (!details && enriched.title) {
            try {
              const results = await GoogleMapsService.searchPlaces(
                enriched.title,
                enriched.location
              );
              if (results.length > 0) {
                details = results[0];
                enriched.googlePlaceId = details.place_id;
              }
            } catch {
              /* warn */
            }
          }

          if (details) {
            if (details.formatted_phone_number)
              enriched.phoneNumber = details.formatted_phone_number;
            if (details.website) enriched.website = details.website;
            if (details.rating) enriched.rating = details.rating;
            if (details.user_ratings_total) enriched.userRatingsTotal = details.user_ratings_total;
            if (details.price_level) enriched.priceLevel = details.price_level;
            if (details.photos?.length) {
              enriched.photoUrls = details.photos.map((p) =>
                p.getUrl({ maxWidth: 400, maxHeight: 300 })
              );
            }
            if (!enriched.address && details.formatted_address)
              enriched.address = details.formatted_address;
            if (!enriched.location && details.geometry?.location) {
              enriched.location = {
                lat: details.geometry.location.lat(),
                lng: details.geometry.location.lng(),
              };
            }

            // Enrich Category & Cuisines
            if (details.category) enriched.category = details.category;
            if (details.types) enriched.types = details.types;
            if (details.cuisines) enriched.cuisines = details.cuisines;
            if (details.opening_hours?.weekday_text)
              enriched.openingHours = details.opening_hours.weekday_text;

            // Enrich Service Options
            if (details.delivery !== undefined) enriched.delivery = details.delivery;
            if (details.dine_in !== undefined) enriched.dineIn = details.dine_in;
            if (details.takeout !== undefined) enriched.takeout = details.takeout;
            if (details.reservable !== undefined) enriched.reservable = details.reservable;
            if (details.serves_beer !== undefined) enriched.servesBeer = details.serves_beer;
            if (details.serves_wine !== undefined) enriched.servesWine = details.serves_wine;
            if (details.serves_vegetarian_food !== undefined)
              enriched.servesVegetarianFood = details.serves_vegetarian_food;
            if (details.wheelchair_accessible_entrance !== undefined)
              enriched.wheelchairAccessible = details.wheelchair_accessible_entrance;
          }
          return enriched;
        });

        const batchResults = await Promise.all(batchPromises);

        // Post-Enrichment Dedupe: Check if the discovered ID already exists
        batchResults.forEach((enriched) => {
          if (enriched.googlePlaceId && existingMap.has(enriched.googlePlaceId)) {
            skippedCount++;
            setSkippedPlaces((prev) => [...prev, enriched]);
            return; // Skip duplicate
          }
          placesToImport.push(enriched);
        });

        if (i + BATCH_SIZE < uniquePlaces.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      setEnriching(false);

      if (placesToImport.length === 0) {
        toast.info(`All places were skipped as duplicates.`);
        setImportStatus({ success: 0, failed: 0, skipped: skippedCount });
        setProgress(100);
        setResolving(false);
        return;
      }

      const total = placesToImport.length;
      logger.info(`Preparing ${total} places for bulk import...`);

      const placesToCreate = placesToImport.map((placeData) => {
        const basePlace = {
          name: placeData.title,
          address: placeData.address || '',
          googleMapsUrl: placeData.url,
          status: 'not_visited',
          addedBy: user.id,
        };

        const placeToSave = {
          ...basePlace,
          listId,
          location: placeData.location,
          notes: placeData.comment,
          googlePlaceId: placeData.googlePlaceId || placeData.placeId,
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
      const result = await PlaceService.bulkCreatePlaces(listId, placesToCreate);

      successCount = result.successCount;
      failedCount = result.failedCount;

      // Identify failed items based on returned error indices
      if (result.errors && result.errors.length > 0) {
        const failures = result.errors.map((err) => {
          // Map the index back to the source array (placesToImport)
          // placesToCreate was mapped 1:1 from placesToImport
          return placesToImport[err.index];
        });
        setFailedPlaces(failures);
      }

      setProgress(100);
      setImportStatus({ success: successCount, failed: failedCount, skipped: skippedCount });

      if (successCount > 0) {
        toast.success(`Imported ${successCount} places successfully`);
      }
      if (failedCount > 0) {
        toast.warning(`Failed to import ${failedCount} places`);
      }

      logger.info(`Import complete: ${successCount} added, ${failedCount} failed`);
    } catch (error) {
      logger.error('Import process failed:', error);
    } finally {
      setResolving(false);
    }
  };

  // Reset helper
  const resetPlaces = () => {
    setPlacesFound([]);
    setSkippedPlaces([]);
    setFailedPlaces([]);
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
      resetPlaces,
    },
  };
};
