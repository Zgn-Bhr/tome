// Y in the reader: the stage map and focused-stage card over a dimmed page (§7.3).

import { useMemo } from 'react';
import type { Stage } from '../../../core/models';
import { serpentineGraph } from '../../../core/input/focus';
import { stageForPage } from '../../../core/stages/derive';
import { useInput } from '../../input/InputProvider';
import { useFocus } from '../../focus/useFocus';
import { C, chakra } from '../../tokens';
import { PromptItem } from '../../components/Glyph';
import { Scrim } from '../../components/Overlay';
import { StageMap, geometry } from '../../components/StageMap';
import { StageCard } from '../DetailsScreen';

export function StageMapOverlay({
  stages,
  page,
  showXp,
  counted,
  cleared,
  onJump,
  onGoTo,
  onClose,
}: {
  stages: readonly Stage[];
  page: number;
  showXp: boolean;
  counted: ReadonlySet<number>;
  cleared: ReadonlySet<number>;
  onJump: (s: Stage) => void;
  onGoTo: () => void;
  onClose: () => void;
}) {
  const current = stageForPage(stages, page);
  const ids = useMemo(() => stages.map((s) => String(s.index)), [stages]);
  const graph = useMemo(() => serpentineGraph(ids, geometry(stages.length).perRow), [ids, stages.length]);
  // Always open on the current stage.
  const { focused, setFocused, navigate } = useFocus(`reader-map:${page}`, graph, String(current?.index ?? 0));
  const focusedStage = stages[Number(focused)];

  useInput({
    context: 'overlay',
    onAction: (e) => {
      if (navigate(e.action)) return;
      const i = Number(focused);
      if (e.action === 'tab_prev' && i > 0) setFocused(String(i - 1));
      if (e.action === 'tab_next' && i < stages.length - 1) setFocused(String(i + 1));
      if (e.action === 'confirm' && focusedStage) onJump(focusedStage);
      if (e.action === 'tertiary') onGoTo();
      if (e.action === 'back') onClose();
    },
  });

  return (
    <Scrim dim={0.78}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 920,
          padding: '28px 40px 22px',
          background: C.surfaceModal,
          borderLeft: `1px solid ${C.line3}`,
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'sheet-in 150ms ease-out',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, font: chakra(600, 18), letterSpacing: '0.08em' }}>STAGE MAP</h2>
          <span style={{ fontSize: 13, color: C.textDim }}>{stages.length} stages</span>
        </div>
        {stages.length ? (
          <StageMap stages={stages} currentIndex={current?.index ?? -1} cleared={cleared} focusedIndex={Number(focused)} />
        ) : (
          <span style={{ marginTop: 40, fontSize: 14, color: C.textMuted }}>Reading the outline…</span>
        )}
        <div style={{ flex: 1 }} />
        {focusedStage ? (
          <StageCard stage={focusedStage} isCurrent={focusedStage.index === current?.index} counted={counted} showXp={showXp} cleared={cleared.has(focusedStage.index)} />
        ) : null}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 22 }}>
          <PromptItem p={{ glyphs: ['Dpad'], label: 'Choose stage' }} size={14} gap={9} />
          <PromptItem p={{ glyphs: ['A'], label: 'Jump here' }} size={14} gap={9} />
          <PromptItem p={{ glyphs: ['Y'], label: 'Go to page' }} size={14} gap={9} />
          <PromptItem p={{ glyphs: ['B'], label: 'Close' }} size={14} gap={9} />
        </div>
      </div>
    </Scrim>
  );
}
