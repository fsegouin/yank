import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useUiStore } from '../../state/ui.js';
import { useChats } from '../../lib/queries.js';
import { RailButton } from './RailButton.js';
import {
  SearchIcon,
  BookmarkIcon,
  DirectoryIcon,
  ActivityIcon,
  SettingsIcon,
} from '../icons/index.js';
import { avatarGradient } from '../../utils/avatarGradient.js';
import styles from './Rail.module.css';

const RAIL_VIEWS = ['search', 'saved', 'directory', 'diagnostics', 'settings'] as const;
type RailView = (typeof RAIL_VIEWS)[number];

export function Rail() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const workspace = useUiStore((s) => s.workspace);
  const setWorkspace = useUiStore((s) => s.setWorkspace);
  const { data: chats = [] } = useChats();
  const triageCount = chats.filter((c) => c.workspace === 'triage').length;

  const railView: 'work' | 'personal' | 'triage' | RailView =
    path === '/triage'
      ? 'triage'
      : path === '/search'
        ? 'search'
        : path === '/saved'
          ? 'saved'
          : path === '/directory'
            ? 'directory'
            : path === '/diagnostics'
              ? 'diagnostics'
              : path === '/settings'
                ? 'settings'
                : workspace;

  return (
    <aside className={styles.rail}>
      <div className={styles.logo} title="Yank">
        yk
      </div>

      <RailButton
        workspace="work"
        mono="W"
        active={railView === 'work'}
        title="Work · ⌘1"
        onClick={() => {
          setWorkspace('work');
          void navigate({ to: '/' });
        }}
      />
      <RailButton
        workspace="personal"
        mono="P"
        active={railView === 'personal'}
        title="Personal · ⌘2"
        onClick={() => {
          setWorkspace('personal');
          void navigate({ to: '/' });
        }}
      />
      <RailButton
        workspace="triage"
        mono="T"
        count={triageCount}
        active={railView === 'triage'}
        title="Triage · ⌘3"
        onClick={() => {
          setWorkspace('triage');
          void navigate({ to: '/triage' });
        }}
      />

      <div className={styles.divider} />

      <RailButton
        glyph={<SearchIcon size={18} />}
        active={railView === 'search'}
        title="Search · ⌘⇧F"
        onClick={() => void navigate({ to: '/search' })}
      />
      <RailButton
        glyph={<BookmarkIcon size={18} />}
        active={railView === 'saved'}
        title="Saved messages"
        onClick={() => void navigate({ to: '/saved' })}
      />
      <RailButton
        glyph={<DirectoryIcon size={18} />}
        active={railView === 'directory'}
        title="Directory (phase 2)"
        onClick={() => void navigate({ to: '/directory' })}
      />

      <div className={styles.spacer} />

      <RailButton
        glyph={<ActivityIcon size={18} />}
        active={railView === 'diagnostics'}
        title="Diagnostics"
        onClick={() => void navigate({ to: '/diagnostics' })}
      />
      <RailButton
        glyph={<SettingsIcon size={18} />}
        active={railView === 'settings'}
        title="Settings"
        onClick={() => void navigate({ to: '/settings' })}
      />

      <div className={`${styles.avatar} ${avatarGradient('You')}`} title="You">
        TM<span className={styles.online} />
      </div>
    </aside>
  );
}
