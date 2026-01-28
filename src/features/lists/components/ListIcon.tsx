import React from 'react';
import * as Icons from 'lucide-react';
import { COLOR_PALETTES } from '@/constants/mapIcons';

interface ListIconProps {
    icon?: string;
    color?: string;
    size?: number;
}

export const ListIcon: React.FC<ListIconProps> = ({ icon, color, size = 24 }) => {
    const isAutoIcon = !icon || icon === 'AUTO';
    const isAutoColor = !color || color === 'AUTO';

    const LucideIcon = isAutoIcon
        ? Icons.Sparkles
        : ((Icons[icon as keyof typeof Icons] || Icons.MapPin) as React.ElementType);

    const colorObj = isAutoColor
        ? null
        : COLOR_PALETTES.find((c) => c.name === color) || COLOR_PALETTES[0];

    const bgStyle = isAutoColor
        ? {
            background: 'linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 50%, #45B7D1 100%)',
        }
        : undefined;

    const bgClass = isAutoColor ? '' : colorObj?.bg;

    return (
        <div
            className={`rounded-full flex items-center justify-center text-white shadow-sm ${bgClass}`}
            style={{ width: size * 2, height: size * 2, ...bgStyle }}
        >
            <LucideIcon size={size} strokeWidth={2.5} />
        </div>
    );
};
