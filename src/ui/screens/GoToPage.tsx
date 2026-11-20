// Go to page (§7.8): D-pad ↑/↓ ±1, ←/→ ±10, L1/R1 ±100; A go, B cancel.

import { useState } from 'react';
import type { Stage } from '../../core/models';
import { stageForPage, stageTitle } from '../../core/stages/derive';
import { useInput } from '../input/InputProvider';
import { C, chakra } from '../tokens';
import { Dialog } from '../components/Overlay';

export function GoToPage({ pageCount, start, stages, onGo, onClose }: { pageCount: number; start: number; stages: readonly Stage[]; onGo: (page: number) => void; onClose: () => void }) {
  const [page, setPage] = useState(start);
  const add = (d: number) => setPage((p) => Math.min(pageCount, Math.max(1, p + d)));
  useInput({
    context: 'overlay',
    onAction: (e) => {
      switch (e.action) {
        case 'nav_up':
          return add(1);
        case 'nav_down':
          return add(-1);
        case 'nav_right':
          return add(10);
        case 'nav_left':
          return add(-10);
        case 'tab_next':
          return add(100);
        case 'tab_prev':
          return add(-100);
        case 'confirm':
          return onGo(page);
        case 'back':
        case 'tertiary':
          return onClose();
      }
    },
  });
  const stage = stageForPage(stages, page);
  return (
    <Dialog
      title="GO TO PAGE"
      width={480}
      prompts={[
        { glyphs: ['Dpad'], label: '±1 / ±10' },
        { glyphs: ['L1', 'R1'], label: '±100' },
        { glyphs: ['A'], label: 'Go' },
        { glyphs: ['B'], label: 'Cancel' },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ font: chakra(700, 72), color: C.cyan, minWidth: 160, textAlign: 'center' }}>{page}</span>
          <span style={{ font: chakra(600, 20), color: C.textDim }}>/ {pageCount}</span>
        </div>
        {stage ? <span style={{ fontSize: 14, color: C.textMuted }}>Stage {stage.index + 1} · {stageTitle(stage)}</span> : null}
      </div>
    </Dialog>
  );
}
