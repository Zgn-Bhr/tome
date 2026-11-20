// Settings defaults (spec §11).

import type { Settings } from './models';
import { DEFAULT_BACK_GRIP_KEYS } from './input/keyboard';
import { GAME } from './gamification/config';

export const DEFAULT_SETTINGS: Settings = {
  folders: ['~/Documents', '~/Downloads'],
  includeSdCards: true,
  rescanOnLaunch: true,
  defaultFit: 'auto',
  gutters: 'wide',
  autoCrop: true,
  pageTheme: 'paper',
  pageTransition: 'slide',
  zen: false,
  tateHand: 'left',
  gameIntensity: 'full',
  dailyGoal: GAME.dailyGoalDefault,
  xpModel: 'pages',
  backGripKeys: { ...DEFAULT_BACK_GRIP_KEYS },
  haptics: true,
  reduceMotion: false,
  debugOverlay: false,
};

export const GUTTER_PX: Record<Settings['gutters'], number> = { wide: 110, narrow: 40, none: 0 };

export function withDefaults(partial: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    backGripKeys: { ...DEFAULT_SETTINGS.backGripKeys, ...partial?.backGripKeys },
  };
}
