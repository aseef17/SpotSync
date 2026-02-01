import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { themeColors } from '@/styles/colors';

interface Option {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const CustomDropdown: React.FunctionComponent<CustomDropdownProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

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

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2 py-2 ${themeColors.background.card} ${themeColors.border.default} border rounded-lg flex items-center justify-between ${themeColors.text.primary} focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
      >
        <span
          className={`block truncate ${selected ? themeColors.text.primary : themeColors.text.secondary}`}
        >
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-full mt-1 ${themeColors.background.card} ${themeColors.border.default} border rounded-lg shadow-lg max-h-60 overflow-y-auto`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left ${themeColors.text.primary} hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                option.value === value ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
