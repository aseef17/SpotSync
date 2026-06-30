import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import { themeColors } from '@/styles/colors';
import {
  AVAILABLE_ICONS,
  COLOR_PALETTES,
  DEFAULT_LIST_CARD_COLOR,
  DEFAULT_LIST_CARD_ICON,
  resolveListCardAppearance,
} from '@/constants/mapIcons';

interface ListCardIconPickerProps {
  selectedIcon: string;
  selectedColor: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}

const PREVIEW_SIZE = 48;

export const ListCardIconPicker: React.FunctionComponent<ListCardIconPickerProps> = ({
  selectedIcon,
  selectedColor,
  onIconChange,
  onColorChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const resolved = resolveListCardAppearance(selectedIcon, selectedColor);
  const PreviewIcon = (Icons[resolved.icon as keyof typeof Icons] ||
    Icons.MapPin) as React.ElementType;
  const previewColor = COLOR_PALETTES.find((c) => c.name === resolved.color) || COLOR_PALETTES[0];

  const filteredIcons = AVAILABLE_ICONS.filter((icon) =>
    icon.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <label className={`block text-sm font-medium ${themeColors.form.label} mb-2`}>
          List Icon
        </label>
        <p className={`text-xs ${themeColors.text.secondary} mb-2`}>
          How this list appears on your lists page so you can tell it apart at a glance. Map markers
          use the settings above.
        </p>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center space-x-3 p-2 rounded-lg border transition-colors text-left ${themeColors.background.card} ${themeColors.border.default} hover:bg-gray-50 dark:hover:bg-gray-800`}
          title="Customize list icon"
        >
          <div
            className={`rounded-full flex items-center justify-center text-white shadow-sm ${previewColor.bg}`}
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
          >
            <PreviewIcon size={PREVIEW_SIZE * 0.5} strokeWidth={2.5} />
          </div>
          <div className="text-left">
            <div className={`text-sm font-medium ${themeColors.text.primary}`}>{resolved.icon}</div>
            <div className={`text-xs ${themeColors.text.secondary}`}>{resolved.color}</div>
          </div>
        </button>
      </div>

      {isOpen && (
        <div
          className={`p-4 rounded-lg border ${themeColors.border.default} ${themeColors.background.card} animate-in fade-in slide-in-from-top-2 duration-200 space-y-5`}
        >
          <div>
            <label
              className={`block text-xs font-medium ${themeColors.text.secondary} uppercase tracking-wider mb-2`}
            >
              Color
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {COLOR_PALETTES.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => onColorChange(color.name)}
                  className={`w-8 h-8 rounded-full ${color.bg} transition-transform hover:scale-110 focus:outline-none ${
                    resolved.color === color.name
                      ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 scale-110'
                      : ''
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label
                className={`block text-xs font-medium ${themeColors.text.secondary} uppercase tracking-wider`}
              >
                Icon
              </label>
              <button
                type="button"
                onClick={() => {
                  onIconChange(DEFAULT_LIST_CARD_ICON);
                  onColorChange(DEFAULT_LIST_CARD_COLOR);
                }}
                className={`text-xs font-medium text-blue-500 hover:text-blue-600`}
              >
                Reset to default
              </button>
            </div>

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

            <div className="max-h-60 overflow-y-auto pr-1 grid grid-cols-6 gap-2 custom-scrollbar">
              {filteredIcons.map((iconName) => {
                const IconComponent = Icons[iconName] as React.ElementType;
                const isSelected = resolved.icon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => onIconChange(iconName as string)}
                    className={`flex items-center justify-center p-2 rounded-md transition-colors ${
                      isSelected
                        ? `light-bg-app ring-2 ring-${previewColor.class}`
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                    title={iconName as string}
                  >
                    <IconComponent
                      size={20}
                      className={isSelected ? `text-${previewColor.class}` : ''}
                    />
                  </button>
                );
              })}
              {filteredIcons.length === 0 && (
                <div
                  className={`col-span-6 text-center py-8 text-sm ${themeColors.text.secondary}`}
                >
                  No icons found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
