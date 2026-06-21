import type { PassportInfoLink } from '@/features/lists/types/list';

export interface PassportStamp {
  id: string;
  name: string;
  /** Index in the 4×3 reference grid (left-to-right, top-to-bottom). */
  gridIndex: number;
}

/** Order matches the official NYC Neighborhood Passport poster (4 cols × 3 rows). */
export const PASSPORT_STAMPS: PassportStamp[] = [
  { id: 'anagh-banerjee', name: 'Anagh Banerjee', gridIndex: 0 },
  { id: 'stephanie-gamarra', name: 'Stephanie Gamarra', gridIndex: 1 },
  { id: 'aya-karpinska', name: 'Aya Karpinska', gridIndex: 2 },
  { id: 'tijay-mohammed', name: 'Tijay Mohammed', gridIndex: 3 },
  { id: 'autumn-morgan', name: 'Autumn Morgan', gridIndex: 4 },
  { id: 'hoda-ramy', name: 'Hoda Ramy', gridIndex: 5 },
  { id: 'camila-rosa', name: 'Camila Rosa', gridIndex: 6 },
  { id: 'sonni', name: 'Sonni', gridIndex: 7 },
  { id: 'misha-tyutyunik', name: 'Misha Tyutyunik', gridIndex: 8 },
  { id: 'vash', name: 'Vash', gridIndex: 9 },
  { id: 'aashita-verma', name: 'Aashita Verma', gridIndex: 10 },
  { id: 'dawn-xintong-yang', name: 'Dawn Xintong Yang', gridIndex: 11 },
];

export const PASSPORT_STAMP_BY_ID = Object.fromEntries(
  PASSPORT_STAMPS.map((stamp) => [stamp.id, stamp])
) as Record<string, PassportStamp>;

/** Sheet rows labeled "Unknown" fall back to this stamp image. */
export const PASSPORT_UNKNOWN_STAMP_ID = 'unknown';

export function passportStampImageUrl(stampId: string): string {
  return `/passport/stamps/${stampId}.png`;
}

export const PASSPORT_ALL_STAMPS_IMAGE = '/passport/all-stamps.png';

export const DEFAULT_PASSPORT_INFO_LINKS: PassportInfoLink[] = [
  {
    label: 'Google Maps list',
    url: 'https://maps.app.goo.gl/5WSDvDbFWcEj4SVo8',
    category: 'Maps',
  },
  {
    label: 'Community spreadsheet',
    url: 'https://docs.google.com/spreadsheets/d/11QW5icu14Bpc6xeGz3JTAryJkFGdGZshCn4W5byJImE/edit?usp=sharing',
    category: 'Resources',
  },
  {
    label: 'NYC Tourism — Passport program',
    url: 'https://www.nyctourism.com/worldcup26/the-nyc-neighborhood-passport-world-cup-program/',
    category: 'Official',
  },
  {
    label: 'Mayor’s office announcement',
    url: 'https://www.nyc.gov/mayors-office/news/2026/05/mayor-mamdani--nyc-tourism---conventions-and-team-wonder-launch-',
    category: 'Official',
  },
  {
    label: 'Queens Public Library spotlight',
    url: 'https://www.queenslibrary.org/spotlight/worldcup/nyc-neighborhood-passport',
    category: 'Official',
  },
  {
    label: 'Team Wonder — Already Home',
    url: 'https://team-wonder.com/alreadyhome',
    category: 'Official',
  },
];
