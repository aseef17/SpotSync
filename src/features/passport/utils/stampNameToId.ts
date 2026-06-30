import { PASSPORT_UNKNOWN_STAMP_ID } from '@/features/passport/constants/stamps';

const STAMP_NAME_TO_ID: Record<string, string> = {
  'Anagh Banerjee': 'anagh-banerjee',
  'Stephanie Gamarra': 'stephanie-gamarra',
  'Aya Karpinska': 'aya-karpinska',
  'Tijay Mohammed': 'tijay-mohammed',
  'Autumn Morgan': 'autumn-morgan',
  'Hoda Ramy': 'hoda-ramy',
  'Camila Rosa': 'camila-rosa',
  Sonni: 'sonni',
  'Misha Tyutyunik': 'misha-tyutyunik',
  Vash: 'vash',
  'Aashita Verma': 'aashita-verma',
  'Dawn Xintong Yang': 'dawn-xintong-yang',
  Unknown: PASSPORT_UNKNOWN_STAMP_ID,
};

export function stampNameToId(name: string | undefined | null): string | null {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  return STAMP_NAME_TO_ID[trimmed] ?? null;
}
