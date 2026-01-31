import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

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
  const { theme } = useTheme();
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

  const themeColors = {
    bg: theme === 'dark' ? 'bg-gray-800' : 'bg-white',
    border: theme === 'dark' ? 'border-gray-700' : 'border-gray-300',
    hover: theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
    text: theme === 'dark' ? 'text-white' : 'text-gray-900',
    textSecondary: theme === 'dark' ? 'text-gray-400' : 'text-gray-600',
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2 py-2 ${themeColors.bg} border ${themeColors.border} rounded-lg flex items-center justify-between ${themeColors.text} focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all`}
      >
        <span
          className={`block truncate ${selected ? themeColors.text : themeColors.textSecondary}`}
        >
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-full mt-1 ${themeColors.bg} border ${themeColors.border} rounded-lg shadow-lg max-h-60 overflow-y-auto`}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left ${themeColors.text} ${themeColors.hover} transition-colors first:rounded-t-lg last:rounded-b-lg ${
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
