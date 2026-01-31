import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import { themeColors } from '@/styles/colors';
import { AVAILABLE_ICONS, COLOR_PALETTES } from '@/constants/mapIcons';

interface IconPickerProps {
  selectedIcon: string;
  selectedColor: string;
  selectedSize: number;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: number) => void;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  selectedIcon,
  selectedColor,
  selectedSize = 36,
  onIconChange,
  onColorChange,
  onSizeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Resolve current icon for preview
  // If AUTO, show Sparkles as placeholder
  const isAutoIcon = selectedIcon === 'AUTO';
  const CurrentIcon = isAutoIcon
    ? Icons.Sparkles
    : ((Icons[selectedIcon as keyof typeof Icons] || Icons.MapPin) as React.ElementType);

  // Resolve current color for preview
  const isAutoColor = selectedColor === 'AUTO';
  const selectedColorObj =
    COLOR_PALETTES.find((c) => c.name === selectedColor) || COLOR_PALETTES[0];

  // Auto color style
  const bgStyle = isAutoColor
    ? { background: 'linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 50%, #45B7D1 100%)' }
    : undefined;

  const bgClass = isAutoColor ? '' : selectedColorObj.bg;

  return (
    <div className="space-y-4">
      <div>
        <label className={`block text-sm font-medium ${themeColors.form.label} mb-2`}>
          List Icon & Style
        </label>

        <div className="flex items-center space-x-4">
          {/* Preview / Toggle Button */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`w-full flex items-center space-x-3 p-2 rounded-lg border transition-colors text-left ${themeColors.background.card} ${themeColors.border.default} hover:bg-gray-50 dark:hover:bg-gray-800`}
            title="Customize appearance"
          >
            <div
              className={`rounded-full flex items-center justify-center text-white shadow-sm transition-all ${bgClass}`}
              style={{
                width: selectedSize,
                height: selectedSize,
                ...bgStyle,
              }}
            >
              <CurrentIcon size={selectedSize * 0.5} strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <div className={`text-sm font-medium ${themeColors.text.primary}`}>
                {isAutoIcon ? 'Auto Icon' : selectedIcon}
              </div>
              <div className={`text-xs ${themeColors.text.secondary}`}>
                {isAutoColor ? 'Auto Color' : selectedColor} • {selectedSize}px
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Picker UI */}
      {isOpen && (
        <div
          className={`p-4 rounded-lg border ${themeColors.border.default} ${themeColors.background.card} animate-in fade-in slide-in-from-top-2 duration-200 space-y-5`}
        >
          {/* Color Selection */}
          <div>
            <label
              className={`block text-xs font-medium ${themeColors.text.secondary} uppercase tracking-wider mb-2`}
            >
              Color
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {/* Auto Color Option */}
              <button
                type="button"
                onClick={() => onColorChange('AUTO')}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none ${
                  selectedColor === 'AUTO'
                    ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 scale-110'
                    : ''
                }`}
                style={{
                  background: 'linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 50%, #45B7D1 100%)',
                }}
                title="Auto Assign Colors"
              >
                {selectedColor === 'AUTO' && <Icons.Check size={14} className="text-white" />}
              </button>

              {COLOR_PALETTES.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => onColorChange(color.name)}
                  className={`w-8 h-8 rounded-full ${color.bg} transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${
                    color.class
                  } ${
                    selectedColor === color.name
                      ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 scale-110'
                      : ''
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800"></div>

          {/* Size Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label
                className={`block text-xs font-medium ${themeColors.text.secondary} uppercase tracking-wider`}
              >
                Size
              </label>
              <span className={`text-xs ${themeColors.text.secondary}`}>{selectedSize}px</span>
            </div>
            <input
              type="range"
              min="24"
              max="64"
              step="2"
              value={selectedSize}
              onChange={(e) => onSizeChange(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
            />
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800"></div>

          {/* Icon Selection */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label
                className={`block text-xs font-medium ${themeColors.text.secondary} uppercase tracking-wider`}
              >
                Icon
              </label>
              <div className="flex items-center space-x-3">
                <span className={`text-sm ${themeColors.text.secondary}`}>Auto-Assign</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={selectedIcon === 'AUTO'}
                  onClick={() => onIconChange(selectedIcon === 'AUTO' ? 'MapPin' : 'AUTO')}
                  className={`${
                    selectedIcon === 'AUTO' ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                >
                  <span
                    className={`${
                      selectedIcon === 'AUTO' ? 'translate-x-6' : 'translate-x-1'
                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                  />
                </button>
              </div>
            </div>

            {selectedIcon !== 'AUTO' && (
              <div className="space-y-3">
                {/* Search Bar */}
                <div className="relative">
                  <Icons.Search
                    className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${themeColors.text.secondary}`}
                  />
                  <input
                    type="text"
                    placeholder="Search icons..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-9 pr-4 py-2 text-sm rounded-md border ${themeColors.border.default} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>

                {/* Scrollable Icon Grid */}
                <div className="max-h-60 overflow-y-auto pr-1 grid grid-cols-6 gap-2 custom-scrollbar">
                  {AVAILABLE_ICONS.filter((icon) =>
                    icon.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((iconName) => {
                    const IconComponent = Icons[iconName] as React.ElementType;
                    const isSelected = selectedIcon === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => onIconChange(iconName as string)}
                        className={`flex items-center justify-center p-2 rounded-md transition-colors ${
                          isSelected
                            ? `light-bg-app ring-2 ring-${selectedColorObj.class}`
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                        title={iconName as string}
                      >
                        <IconComponent
                          size={20}
                          className={isSelected ? `text-${selectedColorObj.class}` : ''}
                        />
                      </button>
                    );
                  })}
                  {AVAILABLE_ICONS.filter((icon) =>
                    icon.toLowerCase().includes(searchQuery.toLowerCase())
                  ).length === 0 && (
                    <div
                      className={`col-span-6 text-center py-8 text-sm ${themeColors.text.secondary}`}
                    >
                      No icons found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
