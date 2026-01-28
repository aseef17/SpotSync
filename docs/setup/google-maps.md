# Google Maps API Setup

SpotSync integrates with Google Maps for place search, details, and list importing.

## API Configuration

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable the following APIs:
   - **Maps JavaScript API**: For displaying the map and markers.
   - **Places API**: For place search and details.
   - **Geocoding API**: For converting addresses to coordinates.

## API Key Restrictions

For security, restrict your API key to:
1. **HTTP Referrers**: Add your development and production domains (e.g., `localhost:5173/*`).
2. **API Restrictions**: Limit the key specifically to the three APIs listed above.

## Import Parser Logic

The application includes a custom parser for Google Maps list URLs. It extracts place data by simulating a browser environment to handle the dynamic nature of Google Maps web results.
