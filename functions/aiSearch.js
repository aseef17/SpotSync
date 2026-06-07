const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.askList = onCall({ region: 'us-east4' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const { listId, query, placesSummary } = request.data;

  if (!listId || !query) {
    throw new HttpsError(
      'invalid-argument',
      'The function must be called with a "listId" and "query".'
    );
  }

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;

  try {
    const db = admin.firestore();
    const listRef = db.collection('lists').doc(listId);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      throw new HttpsError('not-found', 'List not found.');
    }

    const listData = listDoc.data();
    const isOwner = listData?.ownerId === request.auth.uid;
    const collaboratorIds = listData?.collaboratorIds || [];
    const isCollaborator = collaboratorIds.includes(request.auth.uid);

    if (!isOwner && !isCollaborator) {
      throw new HttpsError('permission-denied', 'You do not have access to this list.');
    }

    let places;

    if (Array.isArray(placesSummary) && placesSummary.length > 0) {
      places = placesSummary.map((entry, index) => ({
        index,
        realId: entry.id,
        name: entry.name,
        notes: entry.notes || '',
        category: entry.category || 'General',
        status: entry.status,
        address: entry.address,
      }));
    } else {
      const membershipsSnapshot = await db
        .collection('listPlaces')
        .where('listId', '==', listId)
        .get();

      if (membershipsSnapshot.empty) {
        return { placeIds: [], message: 'No places in this list.' };
      }

      const googlePlaceIds = [
        ...new Set(
          membershipsSnapshot.docs
            .map((membershipDoc) => membershipDoc.data().googlePlaceId)
            .filter(Boolean)
        ),
      ];
      const googlePlacesById = new Map();

      if (googlePlaceIds.length > 0) {
        const googleRefs = googlePlaceIds.map((id) => db.collection('googlePlaces').doc(id));
        const googleSnaps = await db.getAll(...googleRefs);
        googleSnaps.forEach((snap) => {
          if (snap.exists) {
            googlePlacesById.set(snap.id, snap.data());
          }
        });
      }

      places = membershipsSnapshot.docs.map((membershipDoc, index) => {
        const membership = membershipDoc.data();
        const googlePlace = googlePlacesById.get(membership.googlePlaceId) || {};
        return {
          index,
          realId: membershipDoc.id,
          name: googlePlace.name || 'Unknown',
          notes: membership.notes || '',
          category: googlePlace.category || 'General',
          priceLevel: googlePlace.priceLevel,
          status: membership.status,
          address: googlePlace.address || '',
          googleMapsUrl: googlePlace.googleMapsUrl,
        };
      });
    }

    if (!places.length) {
      return { placeIds: [], message: 'No places in this list.' };
    }

    const placesForPrompt = places.map(({ realId, ...rest }) => rest);

    if (!apiKey) {
      console.error('Missing Google GenAI API Key');
      throw new HttpsError('internal', 'AI Service not configured.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `
        You are a helpful assistant for a travel app.
        The user wants to find places in their list matching this query: "${query}"

        Here is the list of places (JSON):
        ${JSON.stringify(placesForPrompt)}

        Analyze the place names, notes, categories, and attributes.
        Return a JSON object with a single property "matchedIndices" which is an array of the INDEX numbers (not IDs) of the places that best match the query.
        If no places match significantly, return an empty array.
        Do not include any explanation, just the JSON.
        Example response: {"matchedIndices": [0, 2, 5]}
        `;

    let result = null;
    let usedModel = 'gemini-flash-latest';

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
      result = await model.generateContent(prompt);
    } catch (e1) {
      console.log(
        JSON.stringify({
          severity: 'WARNING',
          message: 'Gemini Flash Latest failed, retrying with Lite',
          error: e1.message,
        })
      );

      try {
        usedModel = 'gemini-flash-lite-latest';
        const modelLite = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
        result = await modelLite.generateContent(prompt);
      } catch (e2) {
        console.error(
          JSON.stringify({
            severity: 'ERROR',
            message: 'Gemini Flash Lite also failed',
            error: e2.message,
          })
        );
        throw e2;
      }
    }

    const responseText = result.response.text();
    const jsonStr = responseText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(jsonStr);

    const matchedIndices = parsed.matchedIndices || [];
    const matchedPlaceIds = matchedIndices
      .filter((idx) => idx >= 0 && idx < places.length)
      .map((idx) => places[idx].realId);

    return {
      placeIds: matchedPlaceIds,
      debug: {
        usedModel,
        usedClientSummary: Array.isArray(placesSummary) && placesSummary.length > 0,
      },
    };
  } catch (error) {
    console.error(
      JSON.stringify({ severity: 'ERROR', message: 'Error in askList', error: error.message })
    );
    throw new HttpsError('internal', 'Failed to process AI search.');
  }
});
