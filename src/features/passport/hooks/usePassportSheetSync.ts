import { useCallback, useRef, useState } from 'react';
import type { PlaceList } from '@/features/lists/types/list';
import { syncPassportListFromSheet } from '@/features/passport/api/passportSheetSyncService';
import { getPassportConfig, isPassportList } from '@/features/passport/utils/passportList';
import { useToast } from '@/hooks/useToast';

export function usePassportSheetSync(
  list: PlaceList | null | undefined,
  userId: string | undefined
) {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInFlightRef = useRef(false);

  const syncFromSheet = useCallback(async () => {
    if (!list || !userId || !isPassportList(list) || syncInFlightRef.current) return;
    const sheetUrl = getPassportConfig(list)?.sheetUrl;
    if (!sheetUrl) {
      toast.error('This passport list has no spreadsheet URL configured.');
      return;
    }

    syncInFlightRef.current = true;
    setIsSyncing(true);
    toast.info('Syncing passport data from spreadsheet...');
    try {
      const result = await syncPassportListFromSheet({
        listId: list.id,
        sheetUrl,
        userId,
        list,
      });
      const summary = [
        `${result.updated} updated`,
        `${result.created} added`,
        result.cleaned > 0 ? `${result.cleaned} duplicates removed` : null,
        `${result.unchanged} unchanged`,
        result.skipped > 0 ? `${result.skipped} skipped` : null,
      ]
        .filter(Boolean)
        .join(', ');
      toast.success(`Sheet sync complete: ${summary}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sync from spreadsheet.');
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
  }, [list, toast, userId]);

  const canSyncFromSheet = Boolean(isPassportList(list) && getPassportConfig(list)?.sheetUrl);

  return { syncFromSheet, isSyncing, canSyncFromSheet };
}
