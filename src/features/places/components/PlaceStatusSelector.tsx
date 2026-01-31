import React, { useState, useRef, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { CheckCircle, XCircle, Circle, Edit3, Plus } from 'lucide-react';
import { PlaceService } from '@/features/places/api/placeService';
import type { Place, PlaceStatus } from '@/features/places/types/place';

interface PlaceStatusSelectorProps {
  place: Place;
  customStatuses?: string[];
  onStatusChanged: () => void;
}

export const PlaceStatusSelector: React.FunctionComponent<PlaceStatusSelectorProps> = ({
  place,
  customStatuses = [],
  onStatusChanged,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customStatus, setCustomStatus] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustomInput(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const defaultStatuses: {
    value: PlaceStatus;
    label: string;
    icon: React.ReactNode;
    color: string;
    customValue?: string;
  }[] = [
    {
      value: 'not_visited',
      label: 'Not Visited',
      icon: <Circle className="h-4 w-4" />,
      color: 'bg-gray-100 text-gray-800',
    },
    {
      value: 'visited',
      label: 'Visited',
      icon: <CheckCircle className="h-4 w-4" />,
      color: 'bg-green-100 text-green-800',
    },
    {
      value: 'not_going',
      label: 'Not Going',
      icon: <XCircle className="h-4 w-4" />,
      color: 'bg-red-100 text-red-800',
    },
  ];

  const allStatuses = [
    ...defaultStatuses,
    ...customStatuses.map((status) => ({
      value: 'custom' as const,
      label: status,
      icon: <Edit3 className="h-4 w-4" />,
      color: 'bg-purple-100 text-purple-800',
      customValue: status,
    })),
  ];

  const handleStatusChange = async (newStatus: PlaceStatus, customValue?: string) => {
    setIsChanging(true);
    setIsOpen(false);
    try {
      await PlaceService.updatePlaceStatus(place.id, newStatus, customValue);
      onStatusChanged();
    } catch (error) {
      logger.error('Failed to update place status:', error);
    } finally {
      setIsChanging(false);
    }
  };

  const handleCustomStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (customStatus.trim()) {
      await handleStatusChange('custom', customStatus.trim());
      setCustomStatus('');
      setShowCustomInput(false);
    }
  };

  const currentStatus = allStatuses.find(
    (s) =>
      s.value === place.status && (s.value !== 'custom' || s.customValue === place.customStatus)
  );

  return (
    <div className="relative z-10" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        disabled={isChanging}
        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium transition-colors ${
          currentStatus?.color || 'bg-gray-100 text-gray-800'
        } ${isChanging ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
      >
        {currentStatus?.icon}
        <span className="ml-1">{currentStatus?.label || place.customStatus || 'Unknown'}</span>
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-2 w-48 light-bg-card border light-border-default rounded-lg shadow-lg z-[200]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1">
            {allStatuses.map((status) => (
              <button
                key={`${status.value}-${status.customValue || ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusChange(status.value, status.customValue);
                }}
                className="w-full px-3 py-2 text-left text-sm light-text-primary hover:light-bg-app flex items-center"
              >
                <span className="mr-2">{status.icon}</span>
                {status.label}
              </button>
            ))}

            <div className="border-t light-border-default mt-1 pt-1">
              {showCustomInput ? (
                <form
                  onSubmit={handleCustomStatusSubmit}
                  className="px-3 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value)}
                    placeholder="Enter custom status..."
                    className="w-full px-2 py-1 text-sm light-form-input rounded focus:outline-none focus:ring-1 focus:ring-blue-500 border light-border-default"
                    autoFocus
                  />
                  <div className="flex justify-end mt-2 space-x-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCustomInput(false);
                      }}
                      className="px-2 py-1 text-xs light-text-secondary hover:light-text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCustomInput(true);
                  }}
                  className="w-full px-3 py-2 text-left text-sm light-text-primary hover:light-bg-app flex items-center text-blue-600"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Custom Status
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
