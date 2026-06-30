#!/usr/bin/env node
/**
 * Inspect Firestore docs using VITE_FIREBASE_PROJECT_ID from .env and
 * Firebase CLI OAuth credentials (authorized_user refresh token).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

async function getAccessToken() {
  const config = JSON.parse(
    readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8')
  );
  const tokens = config.tokens ?? {};
  if (tokens.access_token && (tokens.expires_at ?? 0) > Date.now() + 60_000) {
    return tokens.access_token;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: '563584335869-fgrhgmd47bqnekijtpi0tj2kk794mg4o.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

function decodeFields(doc) {
  if (!doc?.fields) return null;
  const out = {};
  for (const [key, value] of Object.entries(doc.fields)) {
    if ('stringValue' in value) out[key] = value.stringValue;
    else if ('booleanValue' in value) out[key] = value.booleanValue;
    else if ('integerValue' in value) out[key] = Number(value.integerValue);
    else if ('timestampValue' in value) out[key] = value.timestampValue;
    else if ('arrayValue' in value)
      out[key] = value.arrayValue?.values?.map((v) => v.stringValue ?? v);
    else out[key] = value;
  }
  return out;
}

async function getDoc(token, projectId, path) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return decodeFields(await res.json());
}

async function runQuery(token, projectId, collection, field, value) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`query: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return rows
    .filter((r) => r.document)
    .map((r) => ({
      id: r.document.name.split('/').pop(),
      ...decodeFields(r.document),
    }));
}

const LIST_ID = process.env.LIST_ID || 'Gzzf9zOWcEkCxyJx2Mo8';
const CHIJ = 'ChIJwfbFiiNZwokRN8hnF940DbY';
const MANUAL = 'manual_passport_0f6e093656b1354e';

const env = loadEnv();
const projectId = env.VITE_FIREBASE_PROJECT_ID;
const token = await getAccessToken();

const list = await getDoc(token, projectId, `lists/${LIST_ID}`);
const chijMem = await getDoc(token, projectId, `listPlaces/${LIST_ID}_${CHIJ}`);
const manualMem = await getDoc(token, projectId, `listPlaces/${LIST_ID}_${MANUAL}`);
const gpChij = await getDoc(token, projectId, `googlePlaces/${CHIJ}`);
const gpManual = await getDoc(token, projectId, `googlePlaces/${MANUAL}`);

const memberships = await runQuery(token, projectId, 'listPlaces', 'listId', LIST_ID);
const manualCount = memberships.filter((m) => m.id.includes('manual_passport_')).length;
const visitedCount = memberships.filter((m) => m.status === 'visited').length;

let aseefUid = null;
const users = await fetch(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'email' },
            op: 'EQUAL',
            value: { stringValue: 'aseef17@gmail.com' },
          },
        },
        limit: 1,
      },
    }),
  }
).then((r) => r.json());

if (users[0]?.document) {
  aseefUid = users[0].document.name.split('/').pop();
}

const tombstone = aseefUid ? await getDoc(token, projectId, `accountDeletions/${aseefUid}`) : null;

console.log(
  JSON.stringify(
    {
      projectId,
      list: {
        ownerId: list?.ownerId,
        isPublic: list?.isPublic,
        editorIds: list?.editorIds,
        placeIdsCount: list?.placeIds?.length,
        hasChijInPlaceIds: list?.placeIds?.includes(CHIJ),
        hasManualInPlaceIds: list?.placeIds?.includes(MANUAL),
      },
      aseef17: { uid: aseefUid, isListOwner: aseefUid === list?.ownerId },
      accountDeletionTombstone: Boolean(tombstone),
      chijMembership: chijMem,
      manualMembership: manualMem,
      googlePlaces: {
        chij: gpChij ? { name: gpChij.name } : null,
        manual: gpManual ? { name: gpManual.name } : null,
      },
      membershipStats: {
        total: memberships.length,
        manualPassport: manualCount,
        visited: visitedCount,
      },
    },
    null,
    2
  )
);
