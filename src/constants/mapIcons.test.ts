import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIST_CARD_COLOR,
  DEFAULT_LIST_CARD_ICON,
  resolveListCardAppearance,
} from '@/constants/mapIcons';

describe('resolveListCardAppearance', () => {
  it('uses MapPin and Blue when card fields are unset', () => {
    expect(resolveListCardAppearance()).toEqual({
      icon: DEFAULT_LIST_CARD_ICON,
      color: DEFAULT_LIST_CARD_COLOR,
    });
  });

  it('keeps explicit card icon and color', () => {
    expect(resolveListCardAppearance('Star', 'Purple')).toEqual({
      icon: 'Star',
      color: 'Purple',
    });
  });
});
