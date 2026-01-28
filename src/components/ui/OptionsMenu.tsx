import React from 'react';
import { Menu } from '@headlessui/react';
import { MoreVertical } from 'lucide-react';
import { themeColors } from '@/styles/colors';

interface OptionsMenuProps {
    options: {
        label: string;
        icon?: React.ReactNode;
        onClick: () => void;
        variant?: 'default' | 'danger';
    }[];
}

export const OptionsMenu: React.FC<OptionsMenuProps> = ({ options }) => {
    return (
        <Menu as="div" className="relative inline-block text-left">
            <Menu.Button
                className={`p-2 rounded-full ${themeColors.text.secondary} hover:${themeColors.background.app} transition-colors`}
            >
                <MoreVertical className="h-5 w-5" />
            </Menu.Button>

            <Menu.Items className={`absolute right-0 mt-2 w-56 origin-top-right rounded-lg ${themeColors.background.card} shadow-lg border ${themeColors.border.default} focus:outline-none z-50`}>
                <div className="p-1">
                    {options.map((option, index) => (
                        <Menu.Item key={index}>
                            {({ active }) => (
                                <button
                                    onClick={option.onClick}
                                    className={`${active ? themeColors.background.app : ''
                                        } ${option.variant === 'danger'
                                            ? 'text-red-600 dark:text-red-400'
                                            : themeColors.text.primary
                                        } group flex w-full items-center rounded-md px-3 py-2 text-sm transition-colors`}
                                >
                                    {option.icon && <span className="mr-3 h-5 w-5">{option.icon}</span>}
                                    {option.label}
                                </button>
                            )}
                        </Menu.Item>
                    ))}
                </div>
            </Menu.Items>
        </Menu>
    );
};
