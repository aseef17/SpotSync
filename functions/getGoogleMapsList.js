const { onCall, HttpsError } = require('firebase-functions/v2/https');
const axios = require('axios');

// Explicitly setting region (optional if passed in props, but good for safety) and CORS
// Note: setGlobalOptions in index.js might handle region, but this overrides/ensures it.
exports.getGoogleMapsList = onCall(
  {
    cors: true,
    region: 'us-east4',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    // In v2, context.auth is request.auth
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { url } = request.data;
    if (!url || typeof url !== 'string') {
      throw new HttpsError('invalid-argument', 'The function must be called with a valid URL.');
    }

    try {
      console.log('=== Starting Google Maps List Import ===');
      console.log('Input URL:', url);

      // 1. Fetch the initial URL to resolve redirects (e.g. maps.app.goo.gl)
      console.log('Step 1: Fetching initial URL to resolve redirects...');
      const initialResponse = await axios.get(url, {
        maxRedirects: 10,
        validateStatus: (status) => status < 400,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const html = initialResponse.data;
      const finalUrl = initialResponse.request.res.responseUrl || url;

      console.log('✓ Initial request successful');
      console.log('Resolved URL:', finalUrl);
      console.log('HTML length:', html.length);

      // 2. Extract the Data Endpoint
      console.log('Step 2: Extracting data endpoint from HTML...');
      const linkMatch = html.match(/<link\s+href="([^"]*\/entitylist\/getlist[^"]*)"/);

      let dataUrl = '';
      if (linkMatch && linkMatch[1]) {
        if (linkMatch[1].startsWith('http')) {
          dataUrl = linkMatch[1];
        } else {
          const urlObj = new URL(finalUrl);
          dataUrl = `${urlObj.origin}${linkMatch[1].replace(/&amp;/g, '&')}`;
        }
        console.log('✓ Data endpoint extracted');
        console.log('Data URL:', dataUrl);
      } else {
        console.error('✗ Could not find entitylist/getlist link in HTML');
        console.log('HTML snippet (first 500 chars):', html.substring(0, 500));
      }

      if (!dataUrl) {
        throw new HttpsError('not-found', 'Could not extract list data source from parameters.');
      }

      console.log('Step 3: Fetching list data from endpoint...');

      // 3. Fetch the Data with Retry Logic for Rate Limiting
      let dataResponse;
      let retries = 0;
      const maxRetries = 3;

      while (retries <= maxRetries) {
        try {
          // Add a small delay before each request to avoid triggering rate limits
          if (retries > 0) {
            const delay = Math.min(1000 * Math.pow(2, retries - 1), 5000); // Exponential backoff: 1s, 2s, 4s
            console.log(`⏳ Retry ${retries}/${maxRetries} after ${delay}ms delay...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }

          console.log(
            `Attempt ${retries + 1}/${maxRetries + 1}: Sending request to data endpoint...`
          );
          dataResponse = await axios.get(dataUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              Referer: finalUrl,
            },
            validateStatus: (status) => status < 500, // Don't throw on 4xx errors
          });

          console.log(`Response received: HTTP ${dataResponse.status}`);

          // Check for rate limiting
          if (dataResponse.status === 429) {
            console.warn(`⚠️  Rate limited (429) on attempt ${retries + 1}`);
            console.log('Response headers:', JSON.stringify(dataResponse.headers));
            if (retries === maxRetries) {
              throw new HttpsError(
                'resource-exhausted',
                'Google blocked this request with bot protection. Please use the Google Takeout import method instead.'
              );
            }
            retries++;
            continue;
          }

          // Check for other errors
          if (dataResponse.status >= 400) {
            console.error(`✗ HTTP ${dataResponse.status} error fetching data`);
            console.log(
              'Response body (first 200 chars):',
              String(dataResponse.data).substring(0, 200)
            );
            throw new HttpsError(
              'unavailable',
              `Failed to fetch list data (HTTP ${dataResponse.status}). The list may be private or unavailable.`
            );
          }

          // Success!
          console.log('✓ Data fetched successfully');
          console.log('Response size:', String(dataResponse.data).length, 'bytes');
          break;
        } catch (error) {
          if (error instanceof HttpsError) {
            throw error;
          }

          console.error(`✗ Error fetching data (attempt ${retries + 1}):`, error.message);
          console.error('Error code:', error.code);
          console.error('Error response status:', error.response?.status);

          if (retries === maxRetries) {
            throw new HttpsError(
              'unavailable',
              `Failed to fetch Google Maps data after ${maxRetries + 1} attempts: ${error.message}`
            );
          }

          retries++;
        }
      }

      const rawText = dataResponse.data;

      // 4. Parse the JSON
      console.log('Step 4: Parsing JSON response...');
      const jsonText = rawText.replace(/^\)]}'\\s*/, '');
      let jsonData;
      try {
        jsonData = JSON.parse(jsonText);
        console.log('✓ JSON parsed successfully');
      } catch (e) {
        console.error('✗ JSON Parse Error:', e.message);
        console.log('Raw text (first 200 chars):', rawText.substring(0, 200));
        throw new HttpsError('internal', 'Failed to parse Google Maps data.');
      }

      // 5. Extract Places
      console.log('Step 5: Extracting places from parsed data...');
      const listData = jsonData[0];
      if (!listData) {
        console.error('✗ Invalid data structure: Root not found');
        throw new HttpsError('internal', 'Invalid data structure: Root not found');
      }

      const extractedTitle = listData[4] || 'Imported List';
      const placesArray = listData[8] || listData[7];

      console.log('List title:', extractedTitle);
      console.log('Places array found at index:', listData[8] ? 8 : listData[7] ? 7 : 'none');

      if (!Array.isArray(placesArray)) {
        console.error('✗ Places array not found at index 8 or 7');
        console.log('Available indices:', Object.keys(listData).slice(0, 15));
        return { title: extractedTitle, places: [] };
      }

      console.log(`Found ${placesArray.length} places in array`);

      const parsedPlaces = placesArray
        .map((item, idx) => {
          try {
            const details = item[1];
            if (!details) return null;

            const name = item[2];
            const address = details[4];
            const coordsArr = details[5];
            const lat = coordsArr && coordsArr[2];
            const lng = coordsArr && coordsArr[3];
            const note = item[13];
            const googleUrl = details[2];

            if (!name) return null;

            return {
              name,
              address,
              location: lat && lng ? { lat, lng } : undefined,
              note,
              googleUrl,
            };
          } catch (err) {
            console.warn(`Error parsing item ${idx}:`, err.message);
            return null;
          }
        })
        .filter((p) => p !== null);

      console.log(`✓ Successfully parsed ${parsedPlaces.length} places`);
      console.log('=== Import Complete ===');

      return {
        title: extractedTitle,
        places: parsedPlaces,
      };
    } catch (error) {
      console.error('Scraping Error:', error);
      throw new HttpsError('internal', error.message || 'Failed to process Google Maps URL.');
    }
  }
);
