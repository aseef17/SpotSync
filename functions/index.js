const {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldPath, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// Set global options if needed, e.g. region
setGlobalOptions({ region: 'us-east4' });

// Helper to get tokens for list collaborators
async function getCollaboratorTokens(listId, excludeUserId, preloadedListData = null) {
  let listData = preloadedListData;
  if (!listData) {
    const listDoc = await getFirestore().collection('lists').doc(listId).get();
    if (!listDoc.exists) return null;
    listData = listDoc.data();
  }

  const { ownerId, collaborators, name: listName } = listData;

  const recipientIds = new Set();
  if (ownerId) recipientIds.add(ownerId);

  if (Array.isArray(collaborators)) {
    collaborators.forEach((c) => {
      // Handle both likely formats: object with userId or just ID string
      if (typeof c === 'string') recipientIds.add(c);
      else if (c && c.userId) recipientIds.add(c.userId);
    });
  }

  if (excludeUserId) recipientIds.delete(excludeUserId);

  if (recipientIds.size === 0) {
    console.log(
      `[Notification Warning] No recipients left after excluding actor: ${excludeUserId}`
    );
    return null;
  }

  console.log(
    `Fetching tokens for list "${listName}". Recipients: [${Array.from(recipientIds).join(', ')}]. Excluded Actor: ${excludeUserId}`
  );

  const ids = Array.from(recipientIds);
  const tokens = [];
  const chunkSize = 10;
  const promises = [];

  // Fetch user docs in batches
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    promises.push(
      getFirestore().collection('users').where(FieldPath.documentId(), 'in', chunk).get()
    );
  }

  const snapshots = await Promise.all(promises);
  let userDocsFound = 0;
  snapshots.forEach((snap) => {
    if (!snap.empty) {
      userDocsFound += snap.size;
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.notificationsDisabled === true) {
          console.log(`User ${doc.id}: Notifications are globally disabled. Skipping.`);
          return;
        }
        const userTokens = data.fcmTokens || [];
        console.log(`User ${doc.id}: Found ${userTokens.length} tokens.`);
        if (Array.isArray(userTokens)) {
          tokens.push(...userTokens);
        }
      });
    }
  });

  console.log(
    `Lookup complete. Found ${userDocsFound}/${ids.length} user docs. Total tokens: ${tokens.length}`
  );
  const uniqueTokens = Array.from(
    new Set(tokens.filter((t) => typeof t === 'string' && t.length > 0).map((t) => t.trim()))
  );
  return { tokens: uniqueTokens, listName };
}

function countNotificationRecipients(listData, excludeUserId) {
  const recipientIds = new Set();
  if (listData.ownerId) recipientIds.add(listData.ownerId);

  if (Array.isArray(listData.collaboratorIds)) {
    listData.collaboratorIds.forEach((id) => recipientIds.add(id));
  } else if (Array.isArray(listData.collaborators)) {
    listData.collaborators.forEach((c) => {
      if (typeof c === 'string') recipientIds.add(c);
      else if (c && c.userId) recipientIds.add(c.userId);
    });
  }

  if (excludeUserId) recipientIds.delete(excludeUserId);
  return recipientIds.size;
}

async function syncPlaceAccessFields(listId, listData) {
  const db = getFirestore();
  const accessFields = {
    listOwnerId: listData.ownerId,
    listIsPublic: listData.isPublic === true,
    listCollaboratorIds: listData.collaboratorIds || [listData.ownerId],
  };

  const placesSnap = await db.collection('places').where('listId', '==', listId).get();
  if (placesSnap.empty) return;

  const batchSize = 500;
  for (let i = 0; i < placesSnap.docs.length; i += batchSize) {
    const batch = db.batch();
    placesSnap.docs.slice(i, i + batchSize).forEach((placeDoc) => {
      batch.update(placeDoc.ref, accessFields);
    });
    await batch.commit();
  }
}

/**
 * Triggers when a new invitation is created.
 * Sends a notification to the invited user if they have FCM tokens.
 */
exports.onInvitationCreated = onDocumentCreated(
  {
    document: 'invitations/{invitationId}',
    region: 'us-east4',
    database: '(default)',
  },
  async (event) => {
    // In v2, snapshot is available at event.data
    const snap = event.data;
    if (!snap) return;

    const invitation = snap.data();
    const { invitedEmail, invitedUsername, invitedBy, invitedByUsername, listName } = invitation;

    console.log(
      `New invitation for ${invitedEmail || invitedUsername} from ${invitedByUsername || 'Unknown'} (ID: ${invitedBy})`
    );

    // Find the user with this email or username
    const usersRef = getFirestore().collection('users');
    let querySnapshot;

    if (invitedEmail) {
      querySnapshot = await usersRef.where('email', '==', invitedEmail).get();
    } else if (invitedUsername) {
      querySnapshot = await usersRef.where('username', '==', invitedUsername).get();
    } else {
      console.log('No invitee identifier found');
      return;
    }

    if (querySnapshot.empty) {
      console.log(
        `[Notification Error] No user found in Firestore with identifier: ${invitedEmail || invitedUsername}`
      );
      return;
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    if (userData.notificationsDisabled === true) {
      console.log(`[Notification Warning] User ${userDoc.id} has notifications globally disabled.`);
      return;
    }

    const fcmTokens = userData.fcmTokens || [];

    if (fcmTokens.length === 0) {
      console.log(
        `[Notification Error] User found (ID: ${userDoc.id}), but fcmTokens array is empty or missing.`
      );
      return;
    }

    console.log(
      `[Success] Found ${fcmTokens.length} tokens for user ${userDoc.id}. Sending multicast message...`
    );

    const uniqueTokens = Array.from(
      new Set(fcmTokens.filter((t) => typeof t === 'string' && t.length > 0).map((t) => t.trim()))
    );
    if (uniqueTokens.length === 0) {
      console.log(`[Notification Warning] User ${userDoc.id} has no valid string tokens.`);
      return;
    }

    console.log(
      `[Success] Found ${uniqueTokens.length} valid tokens for user ${userDoc.id}. Sending multicast message...`
    );

    const titleText = 'New List Invitation';
    const bodyText = `${invitedByUsername || 'Someone'} invited you to join "${listName}"`;

    const messages = uniqueTokens.map((token) => ({
      token: token,
      notification: {
        title: titleText,
        body: bodyText,
      },
    }));

    console.log('Final invitation multi-payload:', JSON.stringify(messages));

    try {
      const response = await getMessaging().sendEach(messages);
      console.log(
        `Invitation notification sent. Success: ${response.successCount}, Failure: ${response.failureCount}`
      );

      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.log(
              `[Notification Failure] Token: ${uniqueTokens[idx].substring(0, 10)}... Error: ${resp.error?.code || 'unknown'} - ${resp.error?.message || 'no message'}`
            );
            failedTokens.push(uniqueTokens[idx]);
          }
        });
        if (failedTokens.length > 0) {
          await userDoc.ref.update({
            fcmTokens: FieldValue.arrayRemove(...failedTokens),
          });
        }
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }
);

/**
 * Triggers when an invitation status changes to 'accepted'.
 * Sends a notification to the inviter.
 */
exports.onInvitationAccepted = onDocumentUpdated(
  {
    document: 'invitations/{invitationId}',
    region: 'us-east4',
    database: '(default)',
  },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (!before || !after) return;

    // Only trigger if status changed to 'accepted'
    if (before.status === 'accepted' || after.status !== 'accepted') return;

    const { listId, listName, invitedBy, invitedUsername, invitedEmail } = after;
    const inviteeName = invitedUsername || invitedEmail || 'Someone';

    console.log(
      `Invitation ${event.params.invitationId} accepted by ${inviteeName}. Notifying inviter ${invitedBy}...`
    );

    // Fetch the inviter's user document
    const inviterDoc = await getFirestore().collection('users').doc(invitedBy).get();
    if (!inviterDoc.exists) {
      console.log(`[Notification Error] Inviter user doc ${invitedBy} not found.`);
      return;
    }

    const inviterData = inviterDoc.data();

    if (inviterData.notificationsDisabled === true) {
      console.log(
        `[Notification Warning] Inviter ${invitedBy} has notifications globally disabled.`
      );
      return;
    }

    const fcmTokens = inviterData.fcmTokens || [];

    if (fcmTokens.length === 0) {
      console.log(`[Notification Error] Inviter ${invitedBy} has no FCM tokens.`);
      return;
    }

    const uniqueTokens = Array.from(
      new Set(fcmTokens.filter((t) => typeof t === 'string' && t.length > 0))
    );
    if (uniqueTokens.length === 0) {
      console.log(`[Notification Warning] Inviter ${invitedBy} has no valid string tokens.`);
      return;
    }

    const titleText = 'Invitation Accepted';
    const bodyText = `${inviteeName} accepted your invitation to join "${listName}"`;

    const message = {
      tokens: uniqueTokens,
      notification: {
        title: titleText,
        body: bodyText,
      },
      data: {
        title: String(titleText),
        body: String(bodyText),
        type: 'invitation_accepted',
        listId: String(listId),
        url: `/list/${listId}`,
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          body: bodyText,
          icon: '/mappin-icon.svg',
          requireInteraction: true,
        },
      },
    };

    try {
      const response = await getMessaging().sendEachForMulticast(message);
      console.log(
        `Acceptance notification sent. Success: ${response.successCount}, Failure: ${response.failureCount}`
      );

      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.log(
              `[Notification Failure] Token: ${uniqueTokens[idx].substring(0, 10)}... Error: ${resp.error?.code || 'unknown'} - ${resp.error?.message || 'no message'}`
            );
            failedTokens.push(uniqueTokens[idx]);
          }
        });
        if (failedTokens.length > 0) {
          await inviterDoc.ref.update({
            fcmTokens: FieldValue.arrayRemove(...failedTokens),
          });
        }
      }
    } catch (error) {
      console.error('Error sending acceptance notification:', error);
    }
  }
);

/**
 * Triggers when a new place is added to a list.
 */
exports.onPlaceAdded = onDocumentCreated(
  {
    document: 'places/{placeId}',
    region: 'us-east4',
    database: '(default)',
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const place = snap.data();
    const { listId, addedBy, name, notes } = place;

    if (place.suppressNotifications) {
      console.log(`Skipping notification for "${name}" — suppressNotifications flag set`);
      return;
    }

    const listDoc = await getFirestore().collection('lists').doc(listId).get();
    if (!listDoc.exists) {
      console.log('No tokens result returned (list might not exist or no recipients).');
      return;
    }

    const listData = listDoc.data();
    if (listData.importInProgress) {
      console.log(`Skipping notification for "${name}" — bulk import in progress`);
      return;
    }

    if (countNotificationRecipients(listData, addedBy) === 0) {
      console.log(`[Notification Warning] No recipients left after excluding actor: ${addedBy}`);
      return;
    }

    console.log(`Place "${name}" added to list ${listId} by ${addedBy}`);

    const result = await getCollaboratorTokens(listId, addedBy, listData);
    if (!result) {
      console.log('No tokens result returned (list might not exist or no recipients).');
      return;
    }

    if (result.tokens.length === 0) {
      console.log('Result returned 0 tokens. No notifications sent.');
      return;
    }

    const { tokens, listName } = result;
    const uniqueTokens = Array.from(
      new Set(tokens.filter((t) => typeof t === 'string' && t.length > 0))
    );

    if (uniqueTokens.length === 0) {
      console.log('No valid tokens after filtering.');
      return;
    }

    const titleText = 'New Place Added';
    // Include notes snippet if present
    let bodyText = `"${name}" was added to "${listName}"`;
    if (notes && notes.trim()) {
      const noteSnippet = notes.length > 50 ? notes.substring(0, 50) + '...' : notes;
      bodyText += ` with note: "${noteSnippet}"`;
    }

    const messages = uniqueTokens.map((token) => ({
      token: token,
      notification: {
        title: titleText,
        body: bodyText,
      },
    }));

    console.log('Final multi-message payload:', JSON.stringify(messages));

    try {
      const response = await getMessaging().sendEach(messages);
      console.log(
        `Place added notification sent. Success: ${response.successCount}, Failure: ${response.failureCount}`
      );

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.log(
              `[Notification Failure] Token: ${uniqueTokens[idx].substring(0, 10)}... Error: ${resp.error?.code || 'unknown'} - ${resp.error?.message || 'no message'}`
            );
          }
        });
      }
    } catch (error) {
      console.error('Error sending list update:', error);
    }
  }
);

/**
 * Triggers when a place is updated (Notes or Status).
 */
exports.onPlaceUpdated = onDocumentUpdated(
  {
    document: 'places/{placeId}',
    region: 'us-east4',
    database: '(default)',
  },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (!before || !after) return;

    const statusChanged = before.status !== after.status;
    const notesChanged = before.notes !== after.notes;

    if (!statusChanged && !notesChanged) return;

    const { listId, name, updatedBy } = after;

    // Exclude the user who made the update
    const result = await getCollaboratorTokens(listId, updatedBy || null);
    if (!result || result.tokens.length === 0) return;

    const { tokens, listName } = result;

    // Helper to format status for display
    const formatStatus = (status) => {
      if (!status) return 'none';
      return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    let bodyText = '';
    let titleText = 'Place Updated';

    if (statusChanged && notesChanged) {
      bodyText = `"${name}" in "${listName}" was updated: status changed to ${formatStatus(after.status)} and notes were modified`;
    } else if (statusChanged) {
      bodyText = `"${name}" status changed from ${formatStatus(before.status)} to ${formatStatus(after.status)} in "${listName}"`;
    } else if (notesChanged) {
      const noteSnippet = after.notes
        ? after.notes.length > 40
          ? after.notes.substring(0, 40) + '...'
          : after.notes
        : 'removed';
      bodyText = `Notes updated for "${name}" in "${listName}": "${noteSnippet}"`;
    }
    const message = {
      tokens: tokens,
      notification: {
        title: titleText,
        body: bodyText,
      },
      data: {
        title: String(titleText),
        body: String(bodyText),
        type: 'place_update',
        listId: String(listId),
        placeId: String(event.params.placeId),
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          body: bodyText,
          icon: '/mappin-icon.svg',
          requireInteraction: true,
        },
      },
    };

    try {
      await getMessaging().sendEachForMulticast(message);
    } catch (error) {
      console.error('Error sending place update:', error);
    }
  }
);

/**
 * Triggers when a list is renamed.
 */
exports.onListUpdated = onDocumentUpdated(
  {
    document: 'lists/{listId}',
    region: 'us-east4',
    database: '(default)',
  },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (!before || !after) return;

    const importCompleted =
      before.importInProgress === true &&
      after.importInProgress !== true &&
      (after.lastImportCount || 0) > 0;

    const accessChanged =
      before.ownerId !== after.ownerId ||
      before.isPublic !== after.isPublic ||
      JSON.stringify(before.collaboratorIds || []) !== JSON.stringify(after.collaboratorIds || []);

    if (accessChanged) {
      await syncPlaceAccessFields(event.params.listId, after);
    }

    if (importCompleted) {
      const updatedBy = after.updatedBy || null;
      const result = await getCollaboratorTokens(event.params.listId, updatedBy, after);
      if (result && result.tokens.length > 0) {
        const { tokens, listName } = result;
        const titleText = 'Import Complete';
        const bodyText = `${after.lastImportCount} places were added to "${listName}"`;
        try {
          await getMessaging().sendEachForMulticast({
            tokens,
            notification: { title: titleText, body: bodyText },
            data: {
              title: String(titleText),
              body: String(bodyText),
              type: 'import_complete',
              listId: String(event.params.listId),
            },
          });
        } catch (error) {
          console.error('Error sending import summary notification:', error);
        }
      }
    }

    if (before.name === after.name) return;

    // Get the updatedBy field to exclude the renamer
    const updatedBy = after.updatedBy || null;

    const result = await getCollaboratorTokens(event.params.listId, updatedBy);
    if (!result || result.tokens.length === 0) return;

    const { tokens } = result;

    const titleText = 'List Renamed';
    const bodyText = `List "${before.name}" was renamed to "${after.name}"`;

    const message = {
      tokens: tokens,
      notification: {
        title: titleText,
        body: bodyText,
      },
      data: {
        title: String(titleText),
        body: String(bodyText),
        type: 'list_rename',
        listId: String(event.params.listId),
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          body: bodyText,
          icon: '/mappin-icon.svg',
          requireInteraction: true,
        },
      },
    };

    try {
      await getMessaging().sendEachForMulticast(message);
    } catch (error) {
      console.error('Error sending list rename:', error);
    }
  }
);

/**
 * Triggers when a place is deleted.
 */
exports.onPlaceDeleted = onDocumentDeleted(
  {
    document: 'places/{placeId}',
    region: 'us-east4',
    database: '(default)',
  },
  async (event) => {
    const deletedPlace = event.data.data();
    if (!deletedPlace) return;

    const { listId, name, deletedBy } = deletedPlace;

    const result = await getCollaboratorTokens(listId, deletedBy || null);
    if (!result || result.tokens.length === 0) return;

    const { tokens, listName } = result;

    const titleText = 'List Update';
    const bodyText = `"${name}" was removed from "${listName}"`;

    const message = {
      tokens: tokens,
      notification: {
        title: titleText,
        body: bodyText,
      },
      data: {
        title: String(titleText),
        body: String(bodyText),
        type: 'place_deleted',
        listId: String(listId),
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          body: bodyText,
          icon: '/mappin-icon.svg',
          requireInteraction: true,
        },
      },
    };

    try {
      await getMessaging().sendEachForMulticast(message);
    } catch (error) {
      console.error('Error sending place delete notification:', error);
    }
  }
);

/**
 * Triggers when a list is deleted.
 */
exports.onListDeleted = onDocumentDeleted(
  {
    document: 'lists/{listId}',
    region: 'us-east4',
    database: '(default)',
  },
  async (event) => {
    const deletedList = event.data.data();
    if (!deletedList) return;

    const { name: listName, deletedBy } = deletedList;

    const result = await getCollaboratorTokens(event.params.listId, deletedBy || null);
    if (!result || result.tokens.length === 0) return;

    const { tokens } = result;

    const titleText = 'List Deleted';
    const bodyText = `The list "${listName}" was deleted`;

    const message = {
      tokens: tokens,
      notification: {
        title: titleText,
        body: bodyText,
      },
      data: {
        title: String(titleText),
        body: String(bodyText),
        type: 'list_deleted',
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          body: bodyText,
          icon: '/mappin-icon.svg',
          requireInteraction: true,
        },
      },
    };

    try {
      await getMessaging().sendEachForMulticast(message);
    } catch (error) {
      console.error('Error sending list delete notification:', error);
    }
  }
);

/**
 * Accept a list invitation server-side so list collaborator updates cannot be forged by clients.
 */
exports.acceptInvitation = onCall({ region: 'us-east4' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to accept an invitation.');
  }

  const { invitationId } = request.data || {};
  if (!invitationId || typeof invitationId !== 'string') {
    throw new HttpsError('invalid-argument', 'invitationId is required.');
  }

  const userId = request.auth.uid;
  const email = (request.auth.token.email || '').toLowerCase();
  const db = getFirestore();
  const invitationRef = db.collection('invitations').doc(invitationId);
  const invitationSnap = await invitationRef.get();

  if (!invitationSnap.exists) {
    throw new HttpsError('not-found', 'Invitation not found.');
  }

  const invitation = invitationSnap.data();
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User profile not found.');
  }

  const userData = userDoc.data();
  const invitedEmail = invitation.invitedEmail
    ? String(invitation.invitedEmail).toLowerCase()
    : null;
  const invitedUsername = invitation.invitedUsername
    ? String(invitation.invitedUsername).trim()
    : null;

  const matchesInvitee =
    (invitedEmail && invitedEmail === email) ||
    (invitedUsername && invitedUsername === userData.username);

  if (!matchesInvitee) {
    throw new HttpsError('permission-denied', 'This invitation is not for you.');
  }

  const expiresAt =
    invitation.expiresAt && typeof invitation.expiresAt.toDate === 'function'
      ? invitation.expiresAt.toDate()
      : new Date(invitation.expiresAt);

  if (expiresAt < new Date()) {
    await invitationRef.update({ status: 'expired' });
    throw new HttpsError('failed-precondition', 'Invitation has expired.');
  }

  if (invitation.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Invitation has already been responded to.');
  }

  const listRef = db.collection('lists').doc(invitation.listId);
  const listSnap = await listRef.get();

  if (!listSnap.exists) {
    throw new HttpsError('not-found', 'List not found.');
  }

  const list = listSnap.data();
  const now = new Date();
  const newCollaborator = {
    userId,
    username: userData.username || '',
    email: userData.email || email,
    permission: invitation.role,
    invitedAt: invitation.createdAt,
    joinedAt: now,
  };

  const updatedCollaborators = [...(list.collaborators || []), newCollaborator];
  const allCollaboratorIds = Array.from(
    new Set([...updatedCollaborators.map((c) => c.userId), list.ownerId, userId])
  );
  const editorIds = Array.from(
    new Set(
      updatedCollaborators
        .filter((c) => c.permission === 'owner' || c.permission === 'editor')
        .map((c) => c.userId)
    )
  );

  await db.runTransaction(async (transaction) => {
    const freshInvitation = await transaction.get(invitationRef);
    if (!freshInvitation.exists || freshInvitation.data().status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Invitation has already been responded to.');
    }

    transaction.update(listRef, {
      collaborators: updatedCollaborators,
      collaboratorIds: allCollaboratorIds,
      editorIds,
      updatedAt: now,
    });
    transaction.update(invitationRef, { status: 'accepted' });
  });

  return { listId: invitation.listId };
});

async function batchDeleteDocRefs(db, docRefs) {
  const BATCH_SIZE = 499;
  for (let i = 0; i < docRefs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    docRefs.slice(i, i + BATCH_SIZE).forEach((docRef) => batch.delete(docRef));
    await batch.commit();
  }
}

async function deleteListAndPlaces(db, listId) {
  const placesSnapshot = await db.collection('places').where('listId', '==', listId).get();
  const BATCH_SIZE = 499;
  const placeDocs = placesSnapshot.docs;

  if (placeDocs.length === 0) {
    await db.collection('lists').doc(listId).delete();
    return;
  }

  for (let i = 0; i < placeDocs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = placeDocs.slice(i, i + BATCH_SIZE);
    chunk.forEach((placeDoc) => batch.delete(placeDoc.ref));
    if (i + BATCH_SIZE >= placeDocs.length) {
      batch.delete(db.collection('lists').doc(listId));
    }
    await batch.commit();
  }
}

async function pruneSavedListReferences(db, listIds) {
  if (!listIds.length) return;

  const userRefs = new Map();
  for (const listId of listIds) {
    const saversSnapshot = await db
      .collection('users')
      .where('savedLists', 'array-contains', listId)
      .get();
    saversSnapshot.docs.forEach((userDoc) => userRefs.set(userDoc.id, userDoc.ref));
  }

  const refs = Array.from(userRefs.values());
  const BATCH_SIZE = 499;
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_SIZE).forEach((userRef) => {
      batch.update(userRef, {
        savedLists: FieldValue.arrayRemove(...listIds),
        updatedAt: new Date(),
      });
    });
    await batch.commit();
  }
}

/**
 * Public username availability check. Also backfills the usernames registry for legacy accounts.
 */
exports.checkUsernameExists = onCall({ region: 'us-east4' }, async (request) => {
  const { username } = request.data || {};
  if (!username || typeof username !== 'string') {
    throw new HttpsError('invalid-argument', 'username is required.');
  }

  const normalized = username.toLowerCase().trim();
  const db = getFirestore();
  const usernameRef = db.collection('usernames').doc(normalized);
  const usernameDoc = await usernameRef.get();

  if (usernameDoc.exists) {
    return { exists: true };
  }

  const usersSnapshot = await db
    .collection('users')
    .where('username', '==', normalized)
    .limit(1)
    .get();

  if (!usersSnapshot.empty) {
    const uid = usersSnapshot.docs[0].id;
    await usernameRef.set({ uid });
    return { exists: true };
  }

  return { exists: false };
});

/**
 * Permanently delete the authenticated user's account, owned lists, and auth record.
 */
exports.deleteAccount = onCall(
  { region: 'us-east4', timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in to delete your account.');
    }

    const uid = request.auth.uid;
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Retry after a prior partial deletion removed the profile but left auth intact.
      try {
        await getAuth().deleteUser(uid);
      } catch (error) {
        if (error.code !== 'auth/user-not-found') {
          throw error;
        }
      }
      return { success: true };
    }

    const userData = userDoc.data();
    const normalizedUsername = userData.username
      ? String(userData.username).toLowerCase().trim()
      : null;
    const normalizedEmail = userData.email ? String(userData.email).toLowerCase().trim() : null;

    console.log(`[deleteAccount] Starting deletion for uid=${uid}`);

    const ownedListsSnapshot = await db.collection('lists').where('ownerId', '==', uid).get();
    const ownedListIds = ownedListsSnapshot.docs.map((listDoc) => listDoc.id);
    console.log(`[deleteAccount] Deleting ${ownedListIds.length} owned lists`);
    if (ownedListIds.length > 0) {
      await pruneSavedListReferences(db, ownedListIds);
      for (const listId of ownedListIds) {
        await deleteListAndPlaces(db, listId);
      }
    }

    const collaboratorListsSnapshot = await db
      .collection('lists')
      .where('collaboratorIds', 'array-contains', uid)
      .get();

    console.log(
      `[deleteAccount] Removing user from ${collaboratorListsSnapshot.size} collaborator lists`
    );
    for (const listDoc of collaboratorListsSnapshot.docs) {
      const listData = listDoc.data();
      if (listData.ownerId === uid) continue;

      const updatedCollaborators = (listData.collaborators || []).filter((c) => c.userId !== uid);
      const collaboratorIds = (listData.collaboratorIds || []).filter((id) => id !== uid);
      const editorIds = (listData.editorIds || []).filter((id) => id !== uid);
      const updatedListData = {
        ...listData,
        collaborators: updatedCollaborators,
        collaboratorIds,
        editorIds,
      };

      await listDoc.ref.update({
        collaborators: updatedCollaborators,
        collaboratorIds,
        editorIds,
        updatedAt: new Date(),
      });
      await syncPlaceAccessFields(listDoc.id, updatedListData);
    }

    const invitationDeletes = new Map();
    const queueInvitationDelete = (doc) => invitationDeletes.set(doc.id, doc.ref);

    const sentInvitationsSnapshot = await db
      .collection('invitations')
      .where('invitedBy', '==', uid)
      .get();
    sentInvitationsSnapshot.docs.forEach(queueInvitationDelete);

    if (normalizedEmail) {
      const receivedByEmailSnapshot = await db
        .collection('invitations')
        .where('invitedEmail', '==', normalizedEmail)
        .get();
      receivedByEmailSnapshot.docs.forEach(queueInvitationDelete);
    }

    if (normalizedUsername) {
      const receivedByUsernameSnapshot = await db
        .collection('invitations')
        .where('invitedUsername', '==', normalizedUsername)
        .get();
      receivedByUsernameSnapshot.docs.forEach(queueInvitationDelete);
    }

    if (invitationDeletes.size > 0) {
      console.log(`[deleteAccount] Deleting ${invitationDeletes.size} invitations`);
      await batchDeleteDocRefs(db, Array.from(invitationDeletes.values()));
    }

    const usernameDeletes = new Map();
    if (normalizedUsername) {
      usernameDeletes.set(normalizedUsername, db.collection('usernames').doc(normalizedUsername));
    }

    const usernamesForUidSnapshot = await db.collection('usernames').where('uid', '==', uid).get();
    usernamesForUidSnapshot.docs.forEach((doc) => usernameDeletes.set(doc.id, doc.ref));

    for (const usernameRef of usernameDeletes.values()) {
      const usernameDoc = await usernameRef.get();
      if (usernameDoc.exists && usernameDoc.data()?.uid === uid) {
        await usernameRef.delete();
      }
    }

    // Delete profile before Auth so a failed profile delete leaves the user signed in and able
    // to retry. Auth is deleted last; if the profile was already removed on a prior partial run,
    // the early return above finishes by deleting any leftover Auth record.
    console.log('[deleteAccount] Deleting users profile document');
    await userRef.delete();

    console.log('[deleteAccount] Deleting Firebase Auth user');
    await getAuth().deleteUser(uid);

    console.log(`[deleteAccount] Completed deletion for uid=${uid}`);
    return { success: true };
  }
);

exports.getGoogleMapsList = require('./getGoogleMapsList').getGoogleMapsList;
exports.askList = require('./aiSearch').askList;
