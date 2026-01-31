# Cloud Functions & AI Setup

This guide covers setting up Firebase Cloud Functions with Gemini AI for the AI-powered search feature.

## Prerequisites

- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project created and configured
- Google AI Studio API key (for Gemini)

## Getting Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Select your Google Cloud project (or create one)
4. Copy the generated API key

## Installation

1. Navigate to the functions directory:

   ```bash
   cd functions
   npm install
   ```

2. Set the Gemini API key as a Firebase secret:

   ```bash
   firebase functions:secrets:set GOOGLE_GENAI_API_KEY
   ```

   When prompted, paste your API key.

3. Deploy the Cloud Functions:
   ```bash
   firebase deploy --only functions
   ```

## Available Functions

### `askList`

AI-powered natural language search for places in a list.

**Trigger**: HTTPS Callable  
**Region**: `us-east4`  
**Authentication**: Required

**Request**:

```json
{
  "listId": "your-list-id",
  "query": "Find brunch spots with vegetarian options"
}
```

**Response**:

```json
{
  "placeIds": ["place-id-1", "place-id-2"],
  "debug": {
    "usedModel": "gemini-flash-latest"
  }
}
```

## Troubleshooting

### "AI Service not configured" error

The Gemini API key is not set. Run:

```bash
firebase functions:secrets:set GOOGLE_GENAI_API_KEY
firebase deploy --only functions
```

### Function timeout

For large lists, the AI query may take longer. The function has a default timeout that should handle most cases.

### Model fallback

The function automatically falls back from `gemini-flash-latest` to `gemini-flash-lite-latest` if the primary model fails.
