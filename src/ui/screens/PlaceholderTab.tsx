// Tabs that aren't built yet (Collections, Trophies — milestone M5).

import { useInput } from '../input/InputProvider';
import { useNav } from '../nav';
import { C, chakra } from '../tokens';
import { PromptBar } from '../components/Glyph';
import { Eyebrow } from '../components/Game';
import type { TabProps } from './LibraryScreen';

export function PlaceholderTab({ cycleTab, goTab, title, body }: TabProps & { title: string; body: string }) {
  const nav = useNav();
  useInput({
    context: 'library',
    onAction: (e) => {
      if (e.action === 'tab_prev') cycleTab(-1);
      if (e.action === 'tab_next') cycleTab(1);
      if (e.action === 'back') goTab('home');
      if (e.action === 'menu') nav.showSettings();
    },
  });
  return (
    <>
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 560, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center', alignItems: 'center' }}>
          <Eyebrow>{title}</Eyebrow>
          <span style={{ font: chakra(600, 26) }}>Coming soon</span>
          <span style={{ fontSize: 15, lineHeight: 1.5, color: C.textMuted }}>{body}</span>
        </div>
      </main>
      <PromptBar
        prompts={[
          { glyphs: ['L1', 'R1'], label: 'Tabs' },
          { glyphs: ['Menu'], label: 'Settings' },
          { glyphs: ['B'], label: 'Home' },
        ]}
      />
    </>
  );
}
