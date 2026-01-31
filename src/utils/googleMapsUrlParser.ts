/**
 * Client-side parser for Google Maps list URLs
 * Bypasses bot detection by running in user's browser
 * Updated parser logic for robust extraction and additional fields
 */

import { logger } from '@/utils/logger';

export interface ParsedGoogleMapsList {
  title: string;
  places: Array<{
    name: string;
    address?: string;
    location?: { lat: number; lng: number };
    note?: string;
    googleUrl?: string;
    cid?: string;
    rating?: number;
    userRatingsTotal?: number;
  }>;
}

interface DiscoveredPlace {
  name: string;
  address: string;
  location?: { lat: number; lng: number };
  googleUrl: string;
  note?: string;
  cid?: string;
}

/**
 * Parse a Google Maps list URL and extract places
 * Uses CORS proxy to fetch HTML, then parses client-side
 */
export async function parseGoogleMapsUrl(url: string): Promise<ParsedGoogleMapsList> {
  // Use CORS proxy to fetch the HTML
  const corsProxies = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://proxy.cors.sh/', // Might require a key but sometimes works
    'https://api.codetabs.com/v1/proxy?quest=',
  ];

  const fetchWithProxy = async (targetUrl: string): Promise<string> => {
    let lastError: Error | null = null;
    for (const proxy of corsProxies) {
      try {
        const proxyUrl = proxy + encodeURIComponent(targetUrl);
        // Add a custom header if using proxy.cors.sh (dummy key)
        const headers: Record<string, string> = {};
        if (proxy.includes('cors.sh')) {
          headers['x-cors-gratis'] = 'true';
        }

        const response = await fetch(proxyUrl, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();

        if (!text || text.length < 500)
          throw new Error('Response too short to be a valid Maps page');

        // Bot/Consent/Landing Page Detection
        const isBlocked =
          text.includes('detected unusual traffic') ||
          text.includes('recaptcha') ||
          text.includes('consent.google.com') ||
          (text.includes('google.com/sorry') && text.length < 5000);

        // Stricter check: Must contain some Google markers if it's supposed to be a list
        const isGoogle =
          text.includes('google.com') || text.includes('window.APP_INITIALIZATION_STATE');
        const isAstro = text.includes('Astro v'); // Specifically detect the proxy's own landing page

        if (isBlocked || !isGoogle || isAstro) {
          logger.warn(`Proxy ${proxy} returned invalid/blocked content for ${targetUrl}`);
          throw new Error('Invalid content or blocked by Google');
        }

        logger.info(`Successfully fetched content using ${proxy}`);
        return text;
      } catch (e) {
        logger.warn(`Proxy ${proxy} failed for ${targetUrl}`, e);
        lastError = e as Error;
      }
    }
    throw new Error(lastError?.message || 'All CORS proxies failed to return valid Google content');
  };

  let html = '';
  try {
    // 1. Try to extract List ID directly for RPC fetch
    const listId = extractListIdFromUrl(url);
    if (listId) {
      logger.info(`Detected List ID: ${listId}. Attempting direct RPC fetches...`);
      // Try multiple RPC variations (!3e1, !3e2, !3e8)
      const variations = [
        `https://www.google.com/maps/preview/entitylist/getlist?pb=!1m4!1s${listId}!2e1!3m1!1e1!2e2!3e2!4i500`, // Standard
        `https://www.google.com/maps/preview/entitylist/getlist?pb=!1m4!1s${listId}!2e1!3m1!1e1!2e2!3e1!4i500`, // Variant 1
        `https://www.google.com/maps/preview/entitylist/getlist?pb=!1m5!1s${listId}!2e1!3m1!1e1!2e2!3e1!4i500`, // Variant 2
      ];

      for (const rpcUrl of variations) {
        try {
          const rpcHtml = await fetchWithProxy(rpcUrl);
          const result = parseGoogleMapsHtml(rpcHtml);
          if (result.places.length > 0) return result;
        } catch (rpcErr) {
          logger.warn(`RPC variant failed`, rpcErr);
        }
      }
    }

    html = await fetchWithProxy(url);
  } catch (e) {
    throw new Error(`Failed to fetch URL: ${(e as Error).message}`);
  }

  try {
    return parseGoogleMapsHtml(html);
  } catch (initialError) {
    if (typeof extractListRpcUrl === 'function') {
      const rpcUrl = extractListRpcUrl(html);
      if (rpcUrl) {
        logger.info('Found dynamic list RPC URL, fetching...', rpcUrl);
        try {
          const fullRpcUrl = rpcUrl.startsWith('http') ? rpcUrl : 'https://www.google.com' + rpcUrl;
          const rpcHtml = await fetchWithProxy(fullRpcUrl);
          return parseGoogleMapsHtml(rpcHtml);
        } catch (rpcError) {
          logger.warn('Failed to fetch/parse dynamic RPC URL', rpcError);
        }
      }
    }

    throw initialError;
  }
}

function parseGoogleMapsHtml(html: string): ParsedGoogleMapsList {
  let pos = 0;
  const discoveredPlaces = new Map<string, DiscoveredPlace>();
  let listName = '';

  const isProbablyPlaceName = (val: unknown): boolean => {
    if (typeof val !== 'string') return false;
    const s = val.trim();
    if (s.length < 2 || s.length > 100) return false;
    if (s.startsWith('//') || s.startsWith('http') || s.startsWith('0x')) return false;
    if (/^[a-zA-Z0-9_-]{15,}$/.test(s)) return false;
    return true;
  };

  const scavengeArray = (arr: unknown[], parentPath: string) => {
    let name = '';
    let address = '';
    let lat: number | undefined;
    let lng: number | undefined;
    let note: string | undefined;
    let cid: string | undefined;

    for (let i = 0; i < Math.min(arr.length, 5); i++) {
      if (isProbablyPlaceName(arr[i])) {
        name = arr[i] as string;
        break;
      }
    }
    if (!name) return;

    const metadata = arr.find((sub): sub is unknown[] => Array.isArray(sub) && sub.length > 5);
    if (metadata) {
      const foundAddress = metadata.find(
        (sub): sub is string => typeof sub === 'string' && sub.includes(',') && sub.length > 8
      );
      address =
        foundAddress ||
        (typeof metadata[4] === 'string' ? metadata[4] : '') ||
        (typeof metadata[2] === 'string' ? metadata[2] : '') ||
        '';
      const coords = metadata.find(
        (sub): sub is number[] =>
          Array.isArray(sub) &&
          ((sub.length >= 2 &&
            typeof sub[0] === 'number' &&
            typeof sub[1] === 'number' &&
            sub[0] !== 0) ||
            (sub.length >= 4 &&
              typeof sub[2] === 'number' &&
              typeof sub[3] === 'number' &&
              sub[2] !== 0))
      );
      if (coords) {
        if (typeof coords[0] === 'number' && coords[0] !== 0) {
          lat = coords[0];
          lng = coords[1];
        } else {
          lat = coords[2];
          lng = coords[3];
        }
      }
      cid =
        metadata.find((sub): sub is string => typeof sub === 'string' && sub.startsWith('0x')) ||
        (metadata[8] as string[])?.[0];
    }

    // 3. Look for Note in specific indices
    const possibleNote = arr[3] || arr[13] || arr[14];
    if (typeof possibleNote === 'string' && possibleNote.length > 0 && possibleNote !== name) {
      note = possibleNote;
    }

    if (name && (lat || address || cid)) {
      const placeKey = cid || `${name}|${address || ''}|${lat || ''},${lng || ''}`;
      // Use parentPath to allow intentional duplicates within the same source array
      const dedupeKey = `${parentPath}:${placeKey}`;

      if (!discoveredPlaces.has(dedupeKey)) {
        discoveredPlaces.set(dedupeKey, {
          name,
          address: typeof address === 'string' ? address : '',
          location: lat && lng ? { lat, lng } : undefined,
          googleUrl: `https://www.google.com/maps/place/${encodeURIComponent(name)}${lat ? `/@${lat},${lng},17z` : ''}`,
          note,
          cid: typeof cid === 'string' ? cid : undefined,
        });
      }
    }
  };

  const deepSearch = (obj: unknown, path = 'root', depth = 0) => {
    if (depth > 15 || !obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      scavengeArray(obj, path);
      for (let i = 0; i < obj.length; i++) {
        deepSearch(obj[i], `${path}[${i}]`, depth + 1);
      }
    } else {
      for (const key in obj as object) {
        const val = (obj as Record<string, unknown>)[key];
        if (depth < 5 && isProbablyPlaceName(val) && (val as string).length > 10) {
          listName = val as string;
        }
        deepSearch(val, `${path}.${key}`, depth + 1);
      }
    }
  };

  // 1. Process XSSI Blocks
  while (true) {
    const xssiMatch = html.indexOf(")]}'", pos);
    if (xssiMatch === -1) break;
    let start = xssiMatch + 4;
    while (start < html.length && /\s/.test(html[start])) start++;

    const isQuoted = html[start] === '"';
    let end = start;
    let foundEnd = false;
    let content = '';

    if (isQuoted) {
      start++;
      let escape = false;
      for (let i = start; i < html.length; i++) {
        const char = html[i];
        if (escape) escape = false;
        else if (char === '\\') escape = true;
        else if (char === '"') {
          end = i;
          foundEnd = true;
          break;
        }
      }
      if (foundEnd)
        content = html.substring(start, end).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else {
      let open = 0;
      let inString = false;
      let escape = false;
      if (html[start] === '[' || html[start] === '{') {
        for (let i = start; i < html.length; i++) {
          const char = html[i];
          if (inString) {
            if (escape) escape = false;
            else if (char === '\\') escape = true;
            else if (char === '"') inString = false;
          } else {
            if (char === '"') inString = true;
            else if (char === '[' || char === '{') open++;
            else if (char === ']' || char === '}') {
              open--;
              if (open === 0) {
                end = i + 1;
                foundEnd = true;
                break;
              }
            }
          }
        }
      }
      if (foundEnd) content = html.substring(start, end);
    }
    if (foundEnd && content.length > 20) {
      try {
        const parsed = JSON.parse(content);
        deepSearch(parsed, 'root');
      } catch {
        /* ignore parsing errors of sub-blocks */
      }
    }
    pos = foundEnd ? end : start + 1;
  }

  // 2. Global Vars Fallback
  const globalRegexes = [
    /mapslite\s*=\s*(\{[\s\S]+?\});/,
    /APP_INITIALIZATION_STATE\s*=\s*(\{[\s\S]+?\});/,
    /window\._u_data\s*=\s*(\{[\s\S]+?\});/,
  ];
  for (const regex of globalRegexes) {
    const match = html.match(regex);
    if (match && match[1]) {
      try {
        const cleaned = match[1]
          .replace(/([{,])\s*(\w+):/g, '$1"$2":')
          .replace(/:\s*'([^']*)'/g, ':"$1"')
          .replace(/,\s*([}\]])/g, '$1');
        deepSearch(JSON.parse(cleaned), 'root');
      } catch {
        deepSearch(match[1], 'root');
      }
    }
  }

  // 3. Raw Array Fallback
  pos = 0;
  while (pos < html.length) {
    const bracketMatch = html.indexOf('[[', pos);
    if (bracketMatch === -1) break;
    let open = 0,
      end = -1;
    for (let i = bracketMatch; i < Math.min(bracketMatch + 500000, html.length); i++) {
      if (html[i] === '[') open++;
      else if (html[i] === ']') {
        open--;
        if (open === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end !== -1) {
      try {
        deepSearch(
          JSON.parse(html.substring(bracketMatch, end).replace(/,\s*([}\]])/g, '$1')),
          'root'
        );
      } catch {
        /* ignore */
      }
      pos = end;
    } else pos = bracketMatch + 1;
  }

  if (discoveredPlaces.size === 0) {
    logger.error('Parser failed. Snippet:', html.substring(0, 500).replace(/\s+/g, ' '));
    throw new Error(`Could not find list data in HTML. Length: ${html.length}`);
  }

  return {
    title: listName,
    places: Array.from(discoveredPlaces.values()),
  };
}

export const extractListRpcUrl = (html: string): string | null => {
  const match = html.match(/href="(\/maps\/preview\/entitylist\/getlist\?[^"]+)"/);
  if (match && match[1]) {
    return match[1].replace(/&amp;/g, '&');
  }
  return null;
};

/**
 * Extract Google List ID from a Google Maps URL
 */
export function extractListIdFromUrl(url: string): string | null {
  // Look for patterns like !2sCnDspgKyTdWOP7P9LVACYQ
  const match = url.match(/!2s([A-Za-z0-9_-]{20,})/);
  return match ? match[1] : null;
}

/**
 * Extract Google Place ID from a Google Maps URL
 */
export function extractPlaceIdFromUrl(url?: string): string | null {
  if (!url) return null;

  try {
    const placeIdMatch = url.match(/[?&]place_id=([^&]+)/);
    if (placeIdMatch) return placeIdMatch[1];

    const chijMatch = url.match(/(ChIJ[A-Za-z0-9_-]+)/);
    if (chijMatch) return chijMatch[1];

    return null;
  } catch (error) {
    logger.warn('Error extracting place ID from URL:', error);
    return null;
  }
}
