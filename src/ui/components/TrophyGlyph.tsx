// The icon for a trophy, by its `icon` field (§9.7 trophies are data).

import type { TrophyIcon } from '../../core/gamification/trophies';
import { BookLogo, CalendarCheck, Check, Flame, Trophy } from './Icons';

export function TrophyGlyph({ icon, size = 22, color }: { icon: TrophyIcon; size?: number; color: string }) {
  switch (icon) {
    case 'calendar':
      return <CalendarCheck size={size} color={color} />;
    case 'flame':
      return <Flame size={size} color={color} />;
    case 'check':
      return <Check size={size} color={color} stroke={2.6} />;
    case 'book':
      return <BookLogo size={size} color={color} />;
    case 'trophy':
      return <Trophy size={size} color={color} />;
  }
}
