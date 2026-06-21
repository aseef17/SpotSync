import React from 'react';
import { X, ExternalLink, Info } from 'lucide-react';
import type { PassportConfig, PassportInfoLink } from '@/features/lists/types/list';
import {
  DEFAULT_PASSPORT_INFO_LINKS,
  PASSPORT_ALL_STAMPS_IMAGE,
} from '@/features/passport/constants/stamps';
import { themeColors } from '@/styles/colors';

interface PassportInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: PassportConfig;
}

export const PassportInfoModal: React.FunctionComponent<PassportInfoModalProps> = ({
  isOpen,
  onClose,
  config,
}) => {
  if (!isOpen) return null;

  const links: PassportInfoLink[] = config?.infoLinks?.length
    ? config.infoLinks
    : DEFAULT_PASSPORT_INFO_LINKS;
  const grouped = links.reduce<Record<string, PassportInfoLink[]>>((acc, link) => {
    const category = link.category || 'Links';
    if (!acc[category]) acc[category] = [];
    acc[category].push(link);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passport-info-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={`relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl ${themeColors.background.card} shadow-2xl border ${themeColors.border.default}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-inherit">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2
              id="passport-info-title"
              className={`text-lg font-semibold ${themeColors.text.primary}`}
            >
              NYC Neighborhood Passport
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <p className={`text-sm ${themeColors.text.secondary}`}>
            Collect artist-designed stamps at cultural institutions and community spots across all
            five boroughs. Mark places as visited when you get a stamp, or skip ones you are not
            planning to visit.
          </p>

          <div>
            <h3 className={`text-sm font-semibold mb-2 ${themeColors.text.primary}`}>
              All stamp designs
            </h3>
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white">
              <img
                src={config?.referenceImageUrl || PASSPORT_ALL_STAMPS_IMAGE}
                alt="All 12 NYC Neighborhood Passport stamp designs"
                className="w-full h-auto"
              />
            </div>
          </div>

          {Object.entries(grouped).map(([category, categoryLinks]) => (
            <div key={category}>
              <h3 className={`text-sm font-semibold mb-2 ${themeColors.text.primary}`}>
                {category}
              </h3>
              <ul className="space-y-2">
                {categoryLinks.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span>{link.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
