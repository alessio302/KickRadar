import { useMemo, useRef, useState } from 'react';
import ClubJersey from './ClubJersey.jsx';
import MatchScore from './MatchScore.jsx';
import PlayerProfileOverlay from './PlayerProfileOverlay.jsx';
import { LineupList, Whistle, PitchIcon, HighlightsTab } from './FixtureDetailOverlay.jsx';
import { useEuropaLineups } from '../hooks/useEuropaLineups.js';
import { fetchPlayerProfile } from '../lib/playerProfile.js';
import { DATE_LOCALES } from '../i18n/languages.js';

const DISMISS_THRESHOLD_PX = 100;

function formatKickoff(iso, locale, kickoffConfirmed, tbdLabel) {
  if (kickoffConfirmed === false) {
    return `${new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' })} · ${tbdLabel}`;
  }
  return new Date(iso).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Counterpart to FixtureDetailOverlay.jsx's own MatchInfoFooter, sourced
// from the fixture row directly instead of homeClub.venue -- there's no
// clubs table row here to fall back to (see syncEuropeanLineups.js's own
// top comment), but syncEuropeanFixtures.js writes both fields straight
// from the fixture itself: referee from football-data.org's UCL match
// object (referees[]) or GOAL API's EL/UECL matchReferee, venue from
// GOAL API's matchStadium only (confirmed live football-data.org's UCL
// match object carries no venue at all, so it stays null for UCL rows).
function MatchInfoFooter({ theme, fixture }) {
  if (!fixture.referee && !fixture.venue) return null;

  return (
    <div style={{ margin: '0 16px 16px', paddingTop: '14px', borderTop: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {fixture.referee && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textMuted }}>
          <Whistle size={15} style={{ flexShrink: 0 }} />
          <span>{fixture.referee}</span>
        </div>
      )}
      {fixture.venue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textMuted }}>
          <PitchIcon size={15} style={{ flexShrink: 0 }} />
          <span>{fixture.venue}</span>
        </div>
      )}
    </div>
  );
}

// Slim counterpart to FixtureDetailOverlay.jsx for UCL/UEL/UECL fixtures --
// only Aufstellungen + Highlights, since Spielinfo/Statistik/Tabelle all
// key off a clubs table row or one of our 5 tracked domestic league
// standings, neither of which exists for European fixtures (see
// src/lineups/syncEuropeanLineups.js's own top comment). Reuses
// FixtureDetailOverlay's LineupList and HighlightsTab as-is -- LineupList
// only needs a `row` shaped { confirmed, formation, players }, nothing
// club_id-specific, and HighlightsTab only ever reads
// fixture.highlight_video_url -- and the same drag-to-dismiss bottom-sheet
// shell. highlight_video_url is populated by
// src/lineups/syncEuropeanHighlights.js, the European counterpart of
// syncHighlights.js (see that file's own top comment for the YouTube
// source and matching rationale).
export default function EuropaFixtureDetailOverlay({ theme, t, language, fixture, onClose }) {
  // 'lineups' | 'highlights' -- mirrors FixtureDetailOverlay.jsx's own
  // `view` state, just without the 'info'/'stats'/'table' tabs this slim
  // overlay has no data source for.
  const [view, setView] = useState('lineups');
  const [side, setSide] = useState('home');
  const { byTeamName } = useEuropaLineups(fixture.id);
  const locale = DATE_LOCALES[language];

  const activeRow = side === 'home' ? byTeamName.get(fixture.home_team_name) : byTeamName.get(fixture.away_team_name);

  // ClubJersey only ever reads club.crest_url/club.name -- wrapping the
  // fixture's own team_name/team_badge fields in that shape reuses it
  // as-is instead of a parallel badge component.
  const homeClub = useMemo(() => ({ name: fixture.home_team_name, crest_url: fixture.home_team_badge }), [fixture]);
  const awayClub = useMemo(() => ({ name: fixture.away_team_name, crest_url: fixture.away_team_badge }), [fixture]);

  // Same profile-overlay wiring as FixtureDetailOverlay.jsx's own
  // handleSelectPlayer -- fetchPlayerProfile(p.id) falls through to the
  // get-player-profile Edge Function for anyone not yet in our `players`
  // table (a European player included, per that function's own comment),
  // so this needs no European-specific player lookup at all.
  const [profilePlayer, setProfilePlayer] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const handleSelectPlayer = async (p) => {
    if (!p) return;
    setProfilePlayer({ name: p.name, photo_url: p.photo, position: p.position });
    setProfileLoading(true);
    const live = await fetchPlayerProfile(p.id);
    if (live) setProfilePlayer(live);
    setProfileLoading(false);
  };

  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(null);

  const handlePointerDown = (e) => {
    dragStartY.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (dragStartY.current == null) return;
    const delta = e.clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const handlePointerUp = () => {
    if (dragY > DISMISS_THRESHOLD_PX) {
      onClose();
    } else {
      setDragY(0);
    }
    setDragging(false);
    dragStartY.current = null;
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: `rgba(0,0,0,${0.5 * Math.max(0, 1 - dragY / 400)})`,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          zIndex: 50,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: theme.bg,
            width: '100%',
            maxWidth: '420px',
            height: '82vh',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: 'env(safe-area-inset-bottom)',
            transform: `translateY(${dragY}px)`,
            transition: dragging ? 'none' : 'transform 0.2s ease',
          }}
        >
          <div style={{ flexShrink: 0, padding: '10px 16px 10px', borderBottom: `1px solid ${theme.border}` }}>
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ cursor: 'grab', touchAction: 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                <div style={{ width: '36px', height: '4px', borderRadius: '999px', background: theme.border }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '4px' }}>
                <ClubJersey club={homeClub} size={22} theme={theme} />
                <MatchScore fixture={fixture} t={t} theme={theme} style={{ fontSize: '14px', fontWeight: 700 }} />
                <ClubJersey club={awayClub} size={22} theme={theme} />
              </div>
              <p style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center', margin: '0 0 12px' }}>
                {formatKickoff(fixture.kickoff_at, locale, fixture.kickoff_confirmed, t.fixtures.kickoffTbd)}
              </p>
            </div>

            {/* Same tab-switcher styling as FixtureDetailOverlay.jsx's own
                (identical padding/border/color values) -- only offered
                once the match is over, same reasoning as that file's own
                highlights tab: an upcoming or live European fixture can
                never have a highlight clip yet. */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', borderBottom: `1px solid ${theme.border}` }}>
              {[
                ['lineups', t.matchInfo.tabLineups],
                ...(fixture.status === 'finished' ? [['highlights', t.matchInfo.tabHighlights]] : []),
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  style={{
                    padding: '6px 2px 10px',
                    fontSize: '13px',
                    fontWeight: view === key ? 700 : 600,
                    border: 'none',
                    borderBottom: view === key ? `2px solid ${theme.accent}` : '2px solid transparent',
                    background: 'transparent',
                    color: view === key ? theme.text : theme.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Which side's lineup is shown -- meaningless outside the
                Aufstellungen tab, so hidden for Highlights same as
                FixtureDetailOverlay.jsx's own side toggle. */}
            {view === 'lineups' && (
              <div style={{ display: 'flex', background: theme.surface, borderRadius: '10px', padding: '3px', border: `1px solid ${theme.border}` }}>
                {[['home', homeClub], ['away', awayClub]].map(([key, club]) => (
                  <button
                    key={key}
                    onClick={() => setSide(key)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '8px',
                      fontSize: '13px',
                      fontWeight: side === key ? 700 : 600,
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      background: side === key ? theme.surfaceRaised : 'transparent',
                      color: side === key ? theme.text : theme.textMuted,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {club?.name || '–'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {view === 'lineups' && (
              <>
                <LineupList theme={theme} t={t} row={activeRow} onSelectPlayer={handleSelectPlayer} />
                <MatchInfoFooter theme={theme} fixture={fixture} />
              </>
            )}
            {view === 'highlights' && <HighlightsTab theme={theme} t={t} fixture={fixture} />}
          </div>
        </div>
      </div>
      {profilePlayer && (
        <PlayerProfileOverlay
          theme={theme}
          t={t}
          player={profilePlayer}
          locale={locale}
          loading={profileLoading}
          onClose={() => setProfilePlayer(null)}
        />
      )}
    </>
  );
}
