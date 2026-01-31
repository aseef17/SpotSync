import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Link as LinkIcon } from 'lucide-react';
import { themeColors } from '@/styles/colors';
import { useGoogleMapsImport } from '@/features/places/hooks/useGoogleMapsImport';
import { LoadingButton } from '@/components/Elements/Button/LoadingButton';
import { ImportReportSection } from '@/features/places/components/ImportReportSection';

interface ImportGoogleMapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  existingLists?: { id: string; name: string }[];
}

export const ImportGoogleMapsModal: React.FunctionComponent<ImportGoogleMapsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingLists = [],
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'link'>('link');
  const [expandedSection, setExpandedSection] = useState<'failed' | 'skipped' | null>(null);

  const { state, actions } = useGoogleMapsImport(existingLists);
  const {
    file,
    parsing,
    resolving,
    placesFound,
    progress,
    importStatus,
    targetListId,
    newListName,
    newListDescription,
    userLists,
    importUrl,
    enriching,
    enrichProgress,
    skippedPlaces,
    failedPlaces,
  } = state;
  const {
    setImportUrl,
    setTargetListId,
    setNewListName,
    setNewListDescription,
    handleFileChange,
    handleParseFile,
    handleParseUrl,
    handleImport,
    resetPlaces,
  } = actions;

  const successNotified = React.useRef(false);
  const autoCloseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimeoutRef.current) clearTimeout(autoCloseTimeoutRef.current);
    };
  }, []);

  // Auto-close on complete success (no warnings)
  useEffect(() => {
    const isFinished = !resolving && progress === 100;
    const hasWarnings = importStatus.skipped > 0 || importStatus.failed > 0;

    if (isFinished && importStatus.success > 0 && !successNotified.current) {
      successNotified.current = true;
      if (onSuccess) onSuccess();

      // Only auto-close if there are NO warnings
      if (!hasWarnings) {
        // Clear any existing timer just in case
        if (autoCloseTimeoutRef.current) clearTimeout(autoCloseTimeoutRef.current);

        autoCloseTimeoutRef.current = setTimeout(() => {
          onClose();
        }, 2000);
      }
    }

    // Reset notified state when resetting or starting new import
    if (parsing || (progress === 0 && !resolving)) {
      successNotified.current = false;
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current);
        autoCloseTimeoutRef.current = null;
      }
    }
  }, [resolving, progress, importStatus, onClose, onSuccess, parsing]);

  // Reset helper wrapper
  const handleReset = () => {
    successNotified.current = false;
    if (autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current);
      autoCloseTimeoutRef.current = null;
    }
    resetPlaces();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className={`fixed inset-0 ${themeColors.background.modalOverlay} flex items-center justify-center p-4 z-50`}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`${themeColors.background.card} rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col z-10 border ${themeColors.border.default}`}
          >
            <div className={`p-6 overflow-y-auto custom-scrollbar`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-xl font-bold ${themeColors.text.primary}`}>
                  Import from Google Maps
                </h2>
                <button
                  onClick={onClose}
                  className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 ${themeColors.text.secondary} transition-colors`}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!placesFound.length ? (
                <div className="space-y-4">
                  {/* Link Import Section (Primary) */}
                  {!activeTab || activeTab === 'link' ? (
                    <>
                      <div
                        className={`p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm border border-blue-100 dark:border-blue-800/30`}
                      >
                        <p className="font-medium mb-1 flex items-center gap-2">
                          <LinkIcon className="h-4 w-4" />
                          Import from Shared List:
                        </p>
                        <p className="opacity-80">
                          Paste a shared Google Maps list URL (e.g. <code>maps.app.goo.gl/...</code>
                          ).
                        </p>
                        <p className="text-xs mt-1 opacity-60 italic">
                          Note: Use a "Public" or "Shared" link.
                        </p>
                      </div>

                      <div>
                        <label
                          className={`block text-sm font-medium ${themeColors.text.primary} mb-1.5`}
                        >
                          List URL
                        </label>
                        <input
                          type="text"
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          placeholder="https://maps.app.goo.gl/..."
                          className={`w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${themeColors.form.input}`}
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        <LoadingButton
                          onClick={handleParseUrl}
                          isLoading={parsing}
                          disabled={!importUrl}
                          loadingText="Fetching List..."
                          className="w-full py-3 rounded-xl font-semibold"
                        >
                          Fetch Places
                        </LoadingButton>

                        <div className="text-center">
                          <button
                            onClick={() => setActiveTab('upload')}
                            className={`text-sm ${themeColors.text.secondary} hover:text-blue-600 transition-colors font-medium`}
                          >
                            Having trouble? Try uploading the file instead
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    // File Upload Section (Secondary/Fallback)
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className={`font-medium ${themeColors.text.primary}`}>
                          Upload Google Takeout File
                        </h3>
                        <button
                          onClick={() => setActiveTab('link')}
                          className={`text-sm text-blue-600 hover:text-blue-700 font-medium`}
                        >
                          Back to Link Import
                        </button>
                      </div>

                      <div
                        className={`p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm border border-blue-100 dark:border-blue-800/30 mb-4`}
                      >
                        <p className="font-medium mb-1">How to export your data:</p>
                        <ol className="list-decimal pl-5 space-y-1 opacity-90">
                          <li>
                            Go to{' '}
                            <a
                              href="https://takeout.google.com/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2"
                            >
                              Google Takeout
                            </a>
                          </li>
                          <li>
                            Deselect all, then find and select <strong>Maps (your places)</strong>
                          </li>
                          <li>Export as JSON and download the zip file</li>
                          <li>
                            Extract <strong>Saved Places.json</strong> from the zip
                          </li>
                        </ol>
                      </div>

                      <div className="relative group">
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleFileChange}
                          className="hidden"
                          id="file-upload"
                        />
                        <label
                          htmlFor="file-upload"
                          className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-all"
                        >
                          <Upload
                            className={`h-10 w-10 ${themeColors.text.secondary} mb-3 group-hover:text-blue-600 transition-colors`}
                          />
                          <span className={`block font-semibold ${themeColors.text.primary}`}>
                            {file ? file.name : 'Click to upload Saved Places.json'}
                          </span>
                          <span className={`text-xs ${themeColors.text.secondary} mt-1`}>
                            or drag and drop here
                          </span>
                        </label>
                      </div>

                      <div className="mt-4">
                        <LoadingButton
                          onClick={handleParseFile}
                          isLoading={parsing}
                          disabled={!file}
                          loadingText="Parsing File..."
                          className="w-full py-3 rounded-xl font-semibold"
                        >
                          Analyze JSON File
                        </LoadingButton>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                    <span className={`text-sm font-medium ${themeColors.text.secondary}`}>
                      Found <strong className="text-blue-600">{placesFound.length}</strong> places
                    </span>
                    <button
                      onClick={handleReset}
                      className="text-sm text-red-500 hover:text-red-600 font-medium"
                    >
                      {activeTab === 'link' ? 'Change Link' : 'Change File'}
                    </button>
                  </div>

                  {!resolving && (
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <label
                          className={`block text-sm font-semibold ${themeColors.text.primary}`}
                        >
                          Import Destination
                        </label>
                        <select
                          value={targetListId}
                          onChange={(e) => setTargetListId(e.target.value)}
                          className={`w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${themeColors.form.input}`}
                        >
                          <option value="new">Create New List</option>
                          {userLists.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {targetListId === 'new' && (
                        <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                          <div className="space-y-2">
                            <label
                              className={`block text-sm font-semibold ${themeColors.text.primary}`}
                            >
                              New List Name
                            </label>
                            <input
                              type="text"
                              value={newListName}
                              onChange={(e) => setNewListName(e.target.value)}
                              placeholder="Enter list name..."
                              className={`w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${themeColors.form.input}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <label
                              className={`block text-sm font-semibold ${themeColors.text.primary}`}
                            >
                              Description
                            </label>
                            <textarea
                              value={newListDescription}
                              onChange={(e) => setNewListDescription(e.target.value)}
                              placeholder="Describe this list..."
                              rows={2}
                              className={`w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${themeColors.form.input}`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {resolving && (
                    <div className="space-y-3 py-4">
                      <div className="flex justify-between text-sm font-medium mb-1">
                        <span className="text-blue-600">
                          {enriching
                            ? `Enriching data (${enrichProgress}%)...`
                            : `${Math.round(progress)}% Complete`}
                        </span>
                        <span className={themeColors.text.secondary}>
                          {importStatus.success} added
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-200 dark:border-gray-700">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${enriching ? enrichProgress : progress}%` }}
                          className="bg-blue-600 h-full rounded-full"
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <p className="text-[10px] text-center text-gray-400 font-medium tracking-wide flex justify-center gap-4">
                        <span>{importStatus.skipped} SKIPPED</span>
                        <span>{importStatus.failed} FAILED</span>
                      </p>
                    </div>
                  )}

                  <LoadingButton
                    onClick={progress === 100 ? onClose : handleImport}
                    isLoading={resolving}
                    disabled={targetListId === 'new' && !newListName.trim() && progress !== 100}
                    loadingText={enriching ? 'Enriching Details...' : 'Importing Places...'}
                    className="w-full py-3 rounded-xl font-bold shadow-lg shadow-blue-500/10"
                  >
                    {progress === 100 ? 'Done' : 'Start Import'}
                  </LoadingButton>

                  {progress === 100 && !enriching && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div
                        className={`p-5 rounded-2xl text-center border-2 ${
                          importStatus.failed > 0
                            ? 'bg-red-50/50 border-red-100 text-red-900 dark:bg-red-900/10 dark:text-red-300 dark:border-red-900/20'
                            : importStatus.skipped > 0
                              ? 'bg-amber-50/50 border-amber-100 text-amber-900 dark:bg-amber-900/10 dark:text-amber-300 dark:border-amber-900/20'
                              : 'bg-emerald-50/50 border-emerald-100 text-emerald-900 dark:bg-emerald-900/10 dark:text-emerald-300 dark:border-emerald-900/20'
                        }`}
                      >
                        <p className="font-black text-xl mb-1 flex items-center justify-center gap-2">
                          {importStatus.failed === 0 ? '🎉 Success!' : '⚠️ Partial Success'}
                        </p>
                        <p className="text-sm font-medium opacity-80 mb-3">
                          The import process has finished.
                        </p>
                        <div className="flex justify-center gap-6 text-sm font-bold">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {importStatus.success} Success
                          </span>
                          {importStatus.skipped > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              {importStatus.skipped} Duplicates
                            </span>
                          )}
                          {importStatus.failed > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              {importStatus.failed} Failed
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {failedPlaces.length > 0 && (
                          <ImportReportSection
                            title="Failed to Import"
                            places={failedPlaces}
                            type="failed"
                            isOpen={expandedSection === 'failed'}
                            onToggle={() =>
                              setExpandedSection((prev) => (prev === 'failed' ? null : 'failed'))
                            }
                          />
                        )}
                        {skippedPlaces.length > 0 && (
                          <ImportReportSection
                            title="Skipped (Already in List)"
                            places={skippedPlaces}
                            type="skipped"
                            isOpen={expandedSection === 'skipped'}
                            onToggle={() =>
                              setExpandedSection((prev) => (prev === 'skipped' ? null : 'skipped'))
                            }
                          />
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
