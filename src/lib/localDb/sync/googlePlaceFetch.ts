import { collection, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GOOGLE_PLACES_COLLECTION } from '@/features/places/constants/firestorePaths';
import {
  googlePlaceConverter,
  googlePlaceDocRef,
} from '@/features/places/api/googlePlaceFirestore';
import type { GooglePlace } from '@/features/places/types/googlePlace';

const FIRESTORE_IN_QUERY_LIMIT = 30;

export async function fetchGooglePlaceById(googlePlaceId: string): Promise<GooglePlace | null> {
  const snapshot = await getDoc(googlePlaceDocRef(googlePlaceId));
  return snapshot.exists() ? snapshot.data() : null;
}

function chunkIds<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function fetchGooglePlacesByIds(googlePlaceIds: string[]): Promise<GooglePlace[]> {
  const uniqueIds = [...new Set(googlePlaceIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const results: GooglePlace[] = [];

  for (const idChunk of chunkIds(uniqueIds, FIRESTORE_IN_QUERY_LIMIT)) {
    const q = query(
      collection(db, GOOGLE_PLACES_COLLECTION).withConverter(googlePlaceConverter),
      where(documentId(), 'in', idChunk)
    );
    const snapshot = await getDocs(q);
    results.push(...snapshot.docs.map((docSnap) => docSnap.data()));
  }

  return results;
}

export function googlePlacesById(googlePlaces: GooglePlace[]): Map<string, GooglePlace> {
  return new Map(googlePlaces.map((googlePlace) => [googlePlace.googlePlaceId, googlePlace]));
}
