import { normalizePassportName } from '@/features/passport/utils/normalizePassportName';
import { stampNameToId } from '@/features/passport/utils/stampNameToId';
import { mergePassportStampIds } from '@/features/passport/utils/passportStampIds';
import { PASSPORT_UNKNOWN_STAMP_ID } from '@/features/passport/constants/stamps';

export interface PassportSheetRow {
  stamp: string;
  title: string;
  note: string;
  location: string;
  tags: string;
}

export interface GroupedPassportSheetVenue {
  title: string;
  normalizedTitle: string;
  stampIds: string[];
  notes: string[];
  location: string;
  passportCategory?: string;
}

export function sheetUrlToCsvExportUrl(sheetUrl: string): string {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match?.[1]) {
    throw new Error('Invalid Google Sheets URL');
  }
  return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

export function parsePassportSheetCsv(text: string): PassportSheetRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows: PassportSheetRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const stamp = (cols[0] || '').trim();
    const title = (cols[1] || '').trim();
    const note = (cols[2] || '').trim();
    const location = (cols[3] || '').trim();
    const tags = (cols[4] || '').trim();
    if (!title) continue;
    rows.push({ stamp, title, note, location, tags });
  }

  return rows;
}

function resolveStampIdFromSheetCell(stamp: string): string {
  return stampNameToId(stamp) ?? PASSPORT_UNKNOWN_STAMP_ID;
}

function resolvePassportCategoryFromTags(tags: string): string | undefined {
  const first = tags
    .split(',')
    .map((tag) => tag.trim())
    .find(Boolean);
  return first || undefined;
}

export function groupPassportSheetRows(rows: PassportSheetRow[]): GroupedPassportSheetVenue[] {
  const byTitle = new Map<string, GroupedPassportSheetVenue>();

  for (const row of rows) {
    const normalizedTitle = normalizePassportName(row.title);
    if (!normalizedTitle) continue;

    const stampId = resolveStampIdFromSheetCell(row.stamp);
    const existing = byTitle.get(normalizedTitle) ?? {
      title: row.title,
      normalizedTitle,
      stampIds: [],
      notes: [],
      location: row.location,
      passportCategory: undefined,
    };

    existing.stampIds = mergePassportStampIds([...existing.stampIds, stampId]);
    if (row.note && !existing.notes.includes(row.note)) {
      existing.notes.push(row.note);
    }
    if (!existing.location && row.location) {
      existing.location = row.location;
    }
    const category = resolvePassportCategoryFromTags(row.tags);
    if (category && !existing.passportCategory) {
      existing.passportCategory = category;
    }

    byTitle.set(normalizedTitle, existing);
  }

  return [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export async function fetchGroupedPassportSheetVenues(
  sheetUrl: string
): Promise<GroupedPassportSheetVenue[]> {
  const csvUrl = sheetUrlToCsvExportUrl(sheetUrl);
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet (${response.status})`);
  }
  const text = await response.text();
  return groupPassportSheetRows(parsePassportSheetCsv(text));
}
