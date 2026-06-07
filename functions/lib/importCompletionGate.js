/** Returns true when collaborators should receive a bulk-import summary notification. */
function shouldNotifyImportCompleted(before, after) {
  const previousCount = before?.lastImportCount ?? 0;
  const nextCount = after?.lastImportCount ?? 0;

  return (
    before?.importInProgress === true &&
    after?.importInProgress !== true &&
    nextCount > 0 &&
    nextCount !== previousCount
  );
}

module.exports = { shouldNotifyImportCompleted };
