import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { themeColors } from '@/styles/colors';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  value: string[];
  options: Option[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const MultiSelectDropdown: React.FunctionComponent<MultiSelectDropdownProps> = ({
  value = [],
  options,
  onChange,
  placeholder = 'Select...',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleOption = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange(newValue);
  };

  const selectOnly = (optionValue: string) => {
    onChange([optionValue]);
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectAll = () => {
    onChange(options.map((o) => o.value));
  };

  const displayLabel = () => {
    if (value.length === 0) return placeholder;
    if (value.length === 1) {
      const option = options.find((o) => o.value === value[0]);
      return option ? option.label : placeholder;
    }
    if (value.length === options.length) return 'All Selected';
    return `${value.length} Selected`;
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 ${themeColors.background.card} ${themeColors.border.default} border rounded-lg flex items-center justify-between ${themeColors.text.primary} focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
      >
        <span
          className={`block truncate ${value.length > 0 ? themeColors.text.primary : themeColors.text.secondary}`}
        >
          {displayLabel()}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-64 mt-1 ${themeColors.background.card} ${themeColors.border.default} border rounded-lg shadow-xl max-h-80 overflow-y-auto overflow-x-hidden flex flex-col`}
        >
          {/* Header Actions */}
          <div
            className={`flex items-center justify-between p-2 border-b ${themeColors.border.default}`}
          >
            <button
              onClick={selectAll}
              className={`text-xs font-medium text-blue-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20`}
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              className={`text-xs font-medium ${themeColors.text.secondary} hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20`}
            >
              Clear
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {options.map((option) => {
              const isSelected = value.includes(option.value);
              return (
                <div
                  key={option.value}
                  className={`group flex items-center justify-between px-3 py-2 cursor-pointer relative hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                  }`}
                  onClick={() => toggleOption(option.value)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : `${themeColors.border.default} bg-transparent`
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className={`truncate text-sm ${themeColors.text.primary}`}>
                      {option.label}
                    </span>
                  </div>

                  {/* "Only" button appears on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      selectOnly(option.value);
                    }}
                    className={`hidden group-hover:block absolute right-2 text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-medium hover:bg-blue-200 dark:hover:bg-blue-800 shadow-sm`}
                  >
                    Only
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
