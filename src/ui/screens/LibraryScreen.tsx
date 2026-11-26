// The library shell (§7.0): header with L1/R1 tabs, then the active tab.

import { TABS, LibraryHeader, type Tab } from '../components/Header';
import { useNav, type Route } from '../nav';
import { C } from '../tokens';
import { HomeTab } from './HomeTab';
import { LibraryTab } from './LibraryTab';
import { PlaceholderTab } from './PlaceholderTab';
import { CollectionsTab } from './CollectionsTab';

export interface TabProps {
  /** Move to the previous (-1) or next (+1) tab, wrapping around. */
  cycleTab: (d: -1 | 1) => void;
  goTab: (t: Tab, opts?: { openSort?: boolean }) => void;
}

export function LibraryScreen({ route }: { route: Extract<Route, { name: 'library' }> }) {
  const nav = useNav();
  const goTab: TabProps['goTab'] = (tab, opts) => nav.replace({ name: 'library', tab, ...(opts?.openSort ? { openSort: true } : {}) });
  const cycleTab: TabProps['cycleTab'] = (d) => goTab(TABS[(TABS.indexOf(route.tab) + d + TABS.length) % TABS.length]!);
  const props = { cycleTab, goTab };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: C.bgBase }}>
      {route.tab === 'home' ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            height: 420,
            background: 'radial-gradient(ellipse 55% 100% at 28% 0%, rgba(88,199,230,0.09), rgba(88,199,230,0) 70%)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <LibraryHeader tab={route.tab} />
      {route.tab === 'home' ? <HomeTab {...props} /> : null}
      {route.tab === 'library' ? <LibraryTab key={route.openSort ? 'sort' : 'grid'} {...props} openSort={!!route.openSort} /> : null}
      {route.tab === 'collections' ? <CollectionsTab {...props} /> : null}
      {route.tab === 'trophies' ? (
        <PlaceholderTab {...props} title="TROPHIES" body="Trophies unlock once the game layer starts counting pages you've read. The full trophy case arrives in a later build." />
      ) : null}
    </div>
  );
}
