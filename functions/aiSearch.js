const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Vertex AI / Gemini
// Note: User must set GOOGLE_GENAI_API_KEY config variable
// firebase functions:config:set google_ai.api_key="THE_API_KEY"
// Or use process.env.GOOGLE_GENAI_API_KEY

exports.askList = onCall({ region: 'us-east4' }, async (request) => {
  // 1. Authentication Check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const { listId, query } = request.data;

  if (!listId || !query) {
    throw new HttpsError(
      'invalid-argument',
      'The function must be called with a "listId" and "query".'
    );
  }

  // 2. Fetch List Data (Check permissions first)
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;

  try {
    const db = admin.firestore();
    const listRef = db.collection('lists').doc(listId);
    const listDoc = await listRef.get();

    if (!listDoc.exists) {
      throw new HttpsError('not-found', 'List not found.');
    }

    const listData = listDoc.data();
    const accessMap = listData?.access || {};
    const isOwner = listData?.ownerId === request.auth.uid;
    const isCollaborator = accessMap[request.auth.uid];

    if (!isOwner && !isCollaborator) {
      throw new HttpsError('permission-denied', 'You do not have access to this list.');
    }

    // 3. Fetch Places in List
    const placesSnapshot = await db.collection('places').where('listId', '==', listId).get();

    if (placesSnapshot.empty) {
      return { placeIds: [], message: 'No places in this list.' };
    }

    // 4. Prepare Context for AI
    // Use numeric indices to avoid LLM confusion with similar characters (O vs 0, l vs 1)
    const places = placesSnapshot.docs.map((doc, index) => {
      const d = doc.data();
      return {
        index: index, // Simple numeric index
        realId: doc.id, // Keep for mapping back
        name: d.name,
        notes: d.notes || '',
        category: d.category || 'General',
        priceLevel: d.priceLevel,
        status: d.status,
        address: d.address,
        googleMapsUrl: d.googleMapsUrl,
      };
    });

    // Create a simplified version for the prompt (without realId)
    const placesForPrompt = places.map(({ realId, ...rest }) => rest);

    // 5. Call Gemini
    // We look for the API key in process.env or functions config
    // Note: For v2 functions, params/secrets are preferred, but process.env works if variables are set
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
      // Attempt 1: Gemini Flash Latest (Resolves to current working preview)
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

      // Attempt 2: Fallback to Flash Lite Latest
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
        throw e2; // Throw the second error
      }
    }

    const responseText = result.response.text();

    // 6. Parse Response
    // Clean up markdown code blocks if present
    const jsonStr = responseText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(jsonStr);

    // Map indices back to real Firestore document IDs
    const matchedIndices = parsed.matchedIndices || [];
    const matchedPlaceIds = matchedIndices
      .filter((idx) => idx >= 0 && idx < places.length)
      .map((idx) => places[idx].realId);

    return {
      placeIds: matchedPlaceIds,
      debug: { usedModel },
    };
  } catch (error) {
    console.error(
      JSON.stringify({ severity: 'ERROR', message: 'Error in askList', error: error.message })
    );
    throw new HttpsError('internal', 'Failed to process AI search.');
  }
});
