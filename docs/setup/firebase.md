# Firebase Configuration

Follow these steps to set up the Firebase backend for SpotSync.

## Project Setup

1. Create a new project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable the following services:
   - **Authentication**: Enable Email/Password and Google sign-in providers.
   - **Firestore Database**: Create a database in production mode.
   - **Storage**: Set up a storage bucket for image uploads.
   - **Cloud Messaging**: Note your Web VAPID key in Project Settings > Messaging.

## Firestore Security Rules

Deploy the following rules to protect your data. These rules ensure that only authenticated users can access their own data, while allowing public read access for username availability checks.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /usernames/{username} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /lists/{listId} {
      allow read, write: if request.auth != null;
    }
    match /places/{placeId} {
      allow read, write: if request.auth != null;
    }
    match /invitations/{invitationId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Cloud Functions

The application uses Cloud Functions for cross-user notifications. Deploy these functions from the `functions/` directory:

```bash
cd functions
npm install
firebase deploy --only functions
```

Ensure the region in `index.js` matches your project's default resource location (e.g., `us-east4`).
