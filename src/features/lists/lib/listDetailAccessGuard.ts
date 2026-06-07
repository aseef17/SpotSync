export function shouldApplyCachedListDetails(listAccessible: boolean, cancelled: boolean): boolean {
  return !cancelled && listAccessible;
}
