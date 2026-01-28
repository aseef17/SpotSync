# SpotSync

A real-time collaborative map app for organizing shared places. Import directly from Google Maps, plan trips with friends, and stay in sync with instant updates and cross-platform push notifications. Built with React, Firebase, and Google Places API for a seamless mobile experience.

## Visual Overview

### Getting Started
| Login | Register |
|:---:|:---:|
| ![Login](docs/images/login.png) | ![Register](docs/images/register.png) |

### Dashboard & Settings
| Dashboard | Settings | Account Linking | Theme Options |
|:---:|:---:|:---:|:---:|
| ![Dashboard](docs/images/dashboard.png) | ![Settings](docs/images/settings.png) | ![Account Linking](docs/images/settings_account_linking.png) | ![Theme](docs/images/theme.png) |

### List Management
| List View | Expanded View | Collaboration |
|:---:|:---:|:---:|
| ![List View](docs/images/list_view.png) | ![Expanded View](docs/images/list_view_expanded.png) | ![Collaborators](docs/images/list_collabrator.png) |

### Place Discovery & Details
| Search | Map Selection | Selection Details | Place Details |
|:---:|:---:|:---:|:---:|
| ![Search](docs/images/search.png) | ![Map Selection](docs/images/place_selection_map.png) | ![Selection Details](docs/images/place_selection_details.png) | ![Place Details](docs/images/place_details.png) |

### Google Maps Import
| Import Preview | Success State |
|:---:|:---:|
| ![Preview](docs/images/import_preview.png) | ![Success](docs/images/import_success.png) |

## Core Functionality

- **Secure Authentication**: Integration with Google OAuth and standard email/password flows.
- **Real-time Collaboration**: Share lists with specific collaborators and manage permissions.
- **Google Maps Synchronization**: Import existing saved lists from Google Maps directly into the app.
- **AI-Powered Search**: Ask natural language questions about your saved places (e.g., "Find brunch spots") using Gemini AI.
- **Comprehensive Place Data**: Captures detailed info including hours, delivery/dine-in options, accessibility, and service options.
- **Smart Push Notifications**: Reliable delivery system optimized for both Chrome and Safari.
- **Design System**: A cohesive, premium dark-mode aesthetic with smooth animations.

## Technical Foundation

- **Frontend**: React 19, TypeScript, Vite
- **State Management**: React Context hooks
- **Backend Services**: Firebase (Auth, Firestore, Cloud Functions, FCM, Storage)
- **External APIs**: Google Maps Platform (JavaScript, Places, Geocoding)

## Application Workflow

1.  **Authentication**: Users sign up via Email/Password or Google OAuth. Profiles are created in Firestore.
2.  **Dashboard**: Users land on the dashboard to view their lists and syncing status.
3.  **List Creation**:
    *   **Manual**: Create a fresh empty list.
    *   **Import**: Paste a Google Maps shared link to automatically scrape and import places.
4.  **Place Management**:
    *   **Search**: Use the integrated Google Places Autocomplete to find locations.
    *   **AI Search**: Ask natural language questions like "Find Italian restaurants" to filter your list.
    *   **Details**: View place photos, ratings, hours, and service options.
    *   **Status**: Mark places as "To Visit", "Visited", or "Skipped".
5.  **Collaboration**:
    *   **Invite**: Send invitations by email or username.
    *   **Real-time Interaction**: Changes made by any member are instantly reflected for all.
    *   **Notifications**: Push notifications alert members of additions, updates, or invites.

## Firestore Structure

The database is designed for scalability and real-time synchronization.

```text
users (collection)
└── userId (document)
    ├── email: string
    ├── username: string
    ├── photoURL: string
    ├── fcmTokens: string[]  <-- For Push Notifications
    └── createdAt: timestamp

lists (collection)
└── listId (document)
    ├── name: string
    ├── ownerId: string
    ├── collaborators: array
    │   └── { userId, role }
    └── createdAt: timestamp

places (collection)
└── placeId (document)
    ├── listId: string       <-- Parent List Reference
    ├── googlePlaceId: string
    ├── name: string
    ├── status: enum (want_to_go, visited)
    ├── notes: string
    └── addedBy: string

invitations (collection)
└── invitationId (document)
    ├── listId: string
    ├── invitedEmail: string
    ├── status: enum (pending, accepted)
    └── invitedBy: string
```

## Project Structure

```text
src/
├── features/               # Feature-based architecture
│   ├── auth/              # Authentication logic & components
│   ├── lists/             # List management & Dashboard
│   ├── places/            # Place search, details, and import
│   ├── maps/              # Google Maps integration
│   └── notifications/     # FCM & Toast handlers
├── components/            # Shared UI components (Modals, Inputs)
├── hooks/                 # Global hooks (useToast, useTheme)
├── lib/                   # Configuration (Firebase, Axios)
├── utils/                 # Helpers (Geo-parsing, Date formatting)
├── providers/             # React Context Providers
└── functions/             # Firebase Cloud Functions (Backend Logic)
```

## Getting Started

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/aseef17/SpotSync.git
   cd spot-sync
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables in a `.env` file:
   ```env
   VITE_FIREBASE_API_KEY=your_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_id
   VITE_FIREBASE_STORAGE_BUCKET=your_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key
   ```

4.  **Configure Service Worker**:
    Copy the example service worker and update it with your Firebase config:
    ```bash
    cp public/firebase-messaging-sw.example.js public/firebase-messaging-sw.js
    ```
    Then edit `public/firebase-messaging-sw.js` to include your specific Firebase keys.

5.  **Configure Cloud Functions** (optional, for AI Search):
    See [Cloud Functions Setup](docs/setup/cloud-functions.md) for Gemini AI configuration.

6.  Launch development server:
    ```bash
    npm run dev
    ```

## Detailed Documentation

Comprehensive setup guides for the various integrated services:

- [Firebase Configuration](docs/setup/firebase.md)
- [Google Maps API Setup](docs/setup/google-maps.md)
- [Cloud Functions & AI Setup](docs/setup/cloud-functions.md)

## License

This project is licensed under the MIT License.
