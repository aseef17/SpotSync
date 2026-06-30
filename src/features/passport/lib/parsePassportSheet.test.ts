import { describe, expect, it } from 'vitest';
import {
  groupPassportSheetRows,
  parsePassportSheetCsv,
} from '@/features/passport/lib/parsePassportSheet';

describe('parsePassportSheet', () => {
  it('groups multiple sheet rows for the same venue into stamp ids', () => {
    const rows = parsePassportSheetCsv(`Stamp,Title,Note,Location,Tags
Misha Tyutyunik,Queens Public Library,Note A,Queens,Library
Aashita Verma,Queens Public Library,Note B,Queens,Library`);

    const grouped = groupPassportSheetRows(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.stampIds).toEqual(['misha-tyutyunik', 'aashita-verma']);
    expect(grouped[0]?.passportCategory).toBe('Library');
    expect(grouped[0]?.notes).toEqual(['Note A', 'Note B']);
  });
});
