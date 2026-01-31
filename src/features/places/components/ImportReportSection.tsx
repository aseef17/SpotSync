import React from 'react';
import { ChevronDown, ChevronRight, AlertCircle, MapPin } from 'lucide-react';
import type { ParsedPlace } from '@/utils/googleTakeoutParser';
import { themeColors } from '@/styles/colors';
import { GoogleMapsService } from '@/features/places/api/googleMapsService';

interface ImportReportSectionProps {
  title: string;
  places: ParsedPlace[];
  type: 'failed' | 'skipped';
  isOpen: boolean;
  onToggle: () => void;
}

export const ImportReportSection: React.FC<ImportReportSectionProps> = ({
  title,
  places,
  type,
  isOpen,
  onToggle,
}) => {
  return (
    <div className="border rounded-md bg-white dark:bg-gray-800 overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between p-3 text-sm font-medium transition-colors ${
          type === 'failed'
            ? 'bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-300 dark:hover:bg-red-900/20'
            : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/10 dark:text-yellow-300 dark:hover:bg-yellow-900/20'
        }`}
      >
        <div className="flex items-center gap-2">
          {type === 'failed' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>
            {title} ({places.length})
          </span>
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {isOpen && (
        <div className="divide-y dark:divide-gray-700 max-h-60 overflow-y-auto">
          {places.map((place, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              {/* Image / Icon */}
              <div
                className="h-10 w-10 rounded bg-gray-200 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center bg-cover bg-center overflow-hidden"
                style={
                  place.photoUrls?.[0]
                    ? {
                        backgroundImage: `url(${GoogleMapsService.getPhotoUrl(place.photoUrls[0])})`,
                      }
                    : undefined
                }
              >
                {!place.photoUrls?.[0] && <MapPin className="h-5 w-5 text-gray-400" />}
              </div>

              {/* Text Info */}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${themeColors.text.primary}`}>
                  {place.title || 'Unknown Place'}
                </p>
                {place.address && (
                  <p className={`text-xs truncate ${themeColors.text.secondary}`}>
                    {place.address}
                  </p>
                )}
                {type === 'failed' && <p className="text-xs text-red-500 mt-0.5">Import Error</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
