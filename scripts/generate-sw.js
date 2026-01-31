import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the example file
const examplePath = path.join(__dirname, '../public/firebase-messaging-sw.example.js');
const targetPath = path.join(__dirname, '../public/firebase-messaging-sw.js');

let integrityCheck = true;
const requiredVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

// Check if all env vars are present (warn if not, but don't fail build for local dev convenience if they have a local file)
const env = process.env;
const missing = requiredVars.filter((key) => !env[key]);

if (missing.length > 0) {
  console.warn(
    `[Generate SW] Warning: Missing environment variables for Service Worker generation: ${missing.join(', ')}`
  );
  // If we are in CI (Netlify), this is critical. Locally, maybe the user has the file already.
  if (process.env.CI) {
    console.error('[Generate SW] Failed to generate service worker due to missing env vars in CI.');
    process.exit(1);
  }
}

try {
  let content = fs.readFileSync(examplePath, 'utf8');

  // Replace placeholders with specific Env Vars
  // Note: usage matches what is in the example file 'YOUR_API_KEY' etc.
  content = content.replace(/'YOUR_API_KEY'/g, `'${env.VITE_FIREBASE_API_KEY}'`);
  content = content.replace(
    /'YOUR_PROJECT_ID.firebaseapp.com'/g,
    `'${env.VITE_FIREBASE_AUTH_DOMAIN}'`
  );
  content = content.replace(
    /'YOUR_PROJECT_ID.firebasestorage.app'/g,
    `'${env.VITE_FIREBASE_STORAGE_BUCKET}'`
  ); // Note: bucket usually matches this pattern but let's be safe
  content = content.replace(
    /'YOUR_MESSAGING_SENDER_ID'/g,
    `'${env.VITE_FIREBASE_MESSAGING_SENDER_ID}'`
  );
  content = content.replace(/'YOUR_APP_ID'/g, `'${env.VITE_FIREBASE_APP_ID}'`);

  // Handle Project ID separately to avoid double replacement if keys overlap
  content = content.replace(/'YOUR_PROJECT_ID'/g, `'${env.VITE_FIREBASE_PROJECT_ID}'`);

  fs.writeFileSync(targetPath, content);
  console.log('[Generate SW] Successfully generated public/firebase-messaging-sw.js');
} catch (error) {
  console.error('[Generate SW] Error generating service worker:', error);
  process.exit(1);
}
