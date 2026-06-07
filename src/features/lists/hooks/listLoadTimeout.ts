/** Whether the slow-load timeout should set a blocking list error. */
export function shouldSetSlowListLoadError(listMetadataLoaded: boolean): boolean {
  return !listMetadataLoaded;
}
