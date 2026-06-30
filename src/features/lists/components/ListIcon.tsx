import React from 'react';
import * as Icons from 'lucide-react';
import { COLOR_PALETTES, resolveListCardAppearance } from '@/constants/mapIcons';

interface ListIconProps {
  cardIcon?: string;
  cardColor?: string;
  size?: number;
}

export const ListIcon: React.FunctionComponent<ListIconProps> = ({
  cardIcon,
  cardColor,
  size = 24,
}) => {
  const resolved = resolveListCardAppearance(cardIcon, cardColor);

  const LucideIcon = (Icons[resolved.icon as keyof typeof Icons] ||
    Icons.MapPin) as React.ElementType;

  const colorObj = COLOR_PALETTES.find((c) => c.name === resolved.color) || COLOR_PALETTES[0];

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white shadow-sm ${colorObj.bg}`}
      style={{ width: size * 2, height: size * 2 }}
    >
      <LucideIcon size={size} strokeWidth={2.5} />
    </div>
  );
};
