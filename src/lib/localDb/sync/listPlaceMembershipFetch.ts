import { getDoc, getDocs } from 'firebase/firestore';
import {
  buildListPlaceMembershipsQuery,
  listPlaceMembershipDocRef,
} from '@/features/places/api/listPlaceMembershipFirestore';
import { listPlaceMembershipDocId } from '@/features/places/constants/firestorePaths';
import type { ListPlaceMembership } from '@/features/places/types/listPlaceMembership';

export async function fetchListPlaceMembershipById(
  membershipId: string
): Promise<ListPlaceMembership | null> {
  const snapshot = await getDoc(listPlaceMembershipDocRef(membershipId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function fetchListPlaceMembershipsForList(
  listId: string
): Promise<ListPlaceMembership[]> {
  const snapshot = await getDocs(buildListPlaceMembershipsQuery(listId));
  return snapshot.docs.map((docSnap) => docSnap.data());
}

export async function fetchListPlaceMembershipByListAndGooglePlaceId(
  listId: string,
  googlePlaceId: string
): Promise<ListPlaceMembership | null> {
  const membershipId = listPlaceMembershipDocId(listId, googlePlaceId);
  return fetchListPlaceMembershipById(membershipId);
}
