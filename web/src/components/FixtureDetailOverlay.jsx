import { useRef, useState } from 'react';
import { Users, CalendarClock, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import ClubJersey from './ClubJersey.jsx';
import MatchScore from './MatchScore.jsx';
import { useLineups } from '../hooks/useLineups.js';
import { useMatchEvents } from '../hooks/useMatchEvents.js';
import { DATE_LOCALES } from '../i18n/languages.js';

// Drag distance past which releasing counts as "dismiss" rather than
// "snap back" -- matches the rough feel of native bottom sheets (iOS
// Maps, most drawer libraries) without pulling in a gesture library for
// one interaction.
const DISMISS_THRESHOLD_PX = 100;

function formatKickoff(iso, locale) {
  return new Date(iso).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Confirmed live against a real populated Highlightly response (Kazakhstan
// Premier League, FK Tobol Kostanay vs Kaisar, 2026-08-25): initialLineup
// is an array of arrays -- one per formation row (GK, then each tactical
// line) -- not a flat list, and each player is { name, number, position,
// id }. substitutes is a flat array of the same player shape. Keys here
// are the Highlightly API's own English enum values and must stay as-is;
// t.lineup.positions (see i18n/translations.js) supplies the translated
// value per language for the same keys.
function playerLabel(p, t) {
  const pos = t.lineup.positions[p.position] || p.position;
  return (
    <>
      <span style={{ color: 'inherit', opacity: 0.6, marginRight: '8px' }}>{p.number ?? '–'}</span>
      {p.name}
      {pos && <span style={{ opacity: 0.6 }}> · {pos}</span>}
    </>
  );
}

// initialLineup's own row grouping (GK, then each tactical line, forwards
// last) already *is* a formation layout -- one horizontal rank per row,
// top to bottom -- so no separate formation-string parsing is needed to
// place players.
//
// A real pitch is 105 x 68m; a half (halfway line to goal line) is
// 52.5 x 68m -- wider than tall, which is why this stays compact instead
// of stacking ranks at a generous fixed height. But a literal
// `aspectRatio` CSS property combined with `overflow: hidden` clips
// silently once content needs more room than the ratio provides --
// confirmed live: a 5-rank formation (4-2-3-1's GK/DF/DM/AM/FW split)
// lost its entire forward line, cropped out with no visual warning.
// minHeight scaled to the actual rank count guarantees every rank fits
// while staying close to the real proportions for the common 4-rank case.
function PitchFormation({ formation, rows }) {
  return (
    <div
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden',
        // Only the top corners are rounded -- the bottom edge is the
        // halfway line (see the div below), where the pitch is meant to
        // look cut off, not rounded like a card. Rounding all four
        // corners while that line's straight, full-width border sat
        // flush with the bottom edge created a stray light seam right at
        // the bottom-left/right corners where the two didn't quite agree
        // on the pitch's actual shape -- confirmed live, it read as a
        // stray white stripe under the pitch.
        borderTopLeftRadius: '14px',
        borderTopRightRadius: '14px',
        background: 'linear-gradient(180deg, #1e6b3a, #164d2a)',
        padding: '30px 6px 10px',
        minHeight: `${Math.max(4, rows.length) * 44 + 40}px`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {formation && (
        <span
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#fff',
            background: 'rgba(0,0,0,0.35)',
            padding: '3px 8px',
            borderRadius: '999px',
          }}
        >
          {formation}
        </span>
      )}

      {/* Own penalty area, open at the field boundary (top edge) -- real
          proportions are ~40.3m wide x 16.5m deep out of a 68 x 52.5m half. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '58%',
          height: '27%',
          border: '1.5px solid rgba(255,255,255,0.32)',
          borderTop: 'none',
          borderBottomLeftRadius: '4px',
          borderBottomRightRadius: '4px',
        }}
      />
      {/* Halfway line + center-circle arc, both clipped by the container
          edge -- this is a half-pitch view, the other half is off-screen. */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderBottom: '1.5px solid rgba(255,255,255,0.32)' }} />
      <div
        style={{
          position: 'absolute',
          bottom: '-46px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '92px',
          height: '92px',
          borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.32)',
        }}
      />

      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {rows.map((rank, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-evenly' }}>
            {rank.map((p) => (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '54px' }}>
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.94)',
                    color: '#15181D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {p.number ?? '–'}
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    color: '#fff',
                    textAlign: 'center',
                    marginTop: '2px',
                    lineHeight: 1.1,
                    textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                  }}
                >
                  {p.name}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineupList({ theme, t, row }) {
  if (!row) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <Users size={22} style={{ color: theme.textMuted, marginBottom: '8px' }} />
        <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
          {t.lineup.notYetKnown}
        </p>
      </div>
    );
  }

  const players = row.players || {};
  const rows = players.initialLineup || [];
  const subs = players.substitutes || [];

  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <p style={{ fontSize: '12px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '8px 0 10px' }}>
        {row.confirmed ? t.lineup.official : t.lineup.predicted}
      </p>

      {rows.length === 0 ? (
        <p style={{ fontSize: '13px', color: theme.textMuted, margin: '0 0 16px' }}>{t.lineup.noPlayers}</p>
      ) : (
        <div style={{ marginBottom: subs.length ? '16px' : 0 }}>
          <PitchFormation formation={row.formation} rows={rows} />
        </div>
      )}

      {subs.length > 0 && (
        <>
          <p style={{ fontSize: '11px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
            {t.lineup.substitutes}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {subs.map((p) => (
              <div key={p.id} style={{ fontSize: '13px', color: theme.textMuted }}>{playerLabel(p, t)}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Neither a whistle nor a top-down pitch exists in lucide-react (checked
// the installed icon set directly) -- hand-drawn to match lucide's own
// convention (24x24 viewBox, stroke-only, round caps/joins) so they sit
// next to the rest of the app's icons without looking out of place.
// Traced from a real pea-whistle photo reference per feedback (pointed
// mouthpiece wedge, round chamber with its sound hole, small lanyard
// ring on top), flattened to outline-only (no fill/bevel facets), then
// levelled from that reference's diagonal angle to horizontal so it
// reads left-to-right in a text row like PitchIcon does.
function Whistle({ size = 16, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M1 12 11.5 10.3 11.5 13.7Z" />
      <circle cx="16" cy="12" r="5.3" />
      <circle cx="16" cy="12" r="2.6" />
      <circle cx="16" cy="4.2" r="1.7" />
    </svg>
  );
}

// Boundary, halfway line, centre circle -- the penalty boxes were dropped
// (confirmed live: at icon size their open ends, flush with the rounded
// outer corners, just read as four stray disconnected lines).
function PitchIcon({ size = 16, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="1" y="5" width="22" height="14" rx="2" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Referee is fixture-level; venue is really club-level (football-data.org's
// free tier has no per-match venue, only a team's static home stadium --
// see diagnoseVenueReferee.js), so this always shows the home club's
// stadium regardless of which side's lineup is toggled above it. Sits
// below the lineup/bench, independent of whether a lineup exists yet.
function MatchInfoFooter({ theme, t, fixture, homeClub }) {
  if (!fixture.referee && !homeClub?.venue) return null;

  return (
    <div style={{ margin: '0 16px 16px', paddingTop: '14px', borderTop: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {fixture.referee && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textMuted }}>
          <Whistle size={15} style={{ flexShrink: 0 }} />
          <span>{t.matchInfo.refereeLabel(fixture.referee)}</span>
        </div>
      )}
      {homeClub?.venue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textMuted }}>
          <PitchIcon size={15} style={{ flexShrink: 0 }} />
          <span>{homeClub.venue}</span>
        </div>
      )}
    </div>
  );
}

// Football-specific emoji rather than a generic lucide shape -- matches
// the FlashScore-style reference this feature was designed against, and
// reads instantly as "goal"/"card"/"sub" without needing a legend.
const EVENT_ICON = {
  Goal: '⚽',
  'Own Goal': '⚽',
  Penalty: '⚽',
  'Yellow Card': '🟨',
  'Red Card': '🟥',
  Substitution: '🔄',
};

const EVENT_LABEL_KEY = {
  Goal: 'goal',
  'Own Goal': 'ownGoal',
  Penalty: 'penalty',
  'Yellow Card': 'yellowCard',
  'Red Card': 'redCard',
  Substitution: 'substitution',
};

// "45+2" sorts after "9" as plain text but must sort *before* "90" --
// parsing the added-time suffix into a fractional part keeps stoppage-time
// events in their real chronological position without needing a second
// sort key.
function parseMinute(minute) {
  const match = /^(\d+)(?:\+(\d+))?/.exec(minute || '');
  if (!match) return 0;
  const base = Number(match[1]);
  const added = match[2] ? Number(match[2]) / 100 : 0;
  return base + added;
}

const SUBSTITUTION_IN_COLOR = '#22c55e';
const SUBSTITUTION_OUT_COLOR = '#ef4444';

// Substitution gets its own compact layout -- confirmed live: the
// sentence form ("X esce, Y entra") routinely wrapped to two lines and
// crowded the timeline. A green up-arrow next to the player coming on and
// a red down-arrow next to the one going off (matching a standard
// match-centre reference the user pointed to) reads just as clearly with
// no sentence needed at all.
function SubstitutionContent({ theme, event, align }) {
  const justify = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  const rowStyle = { display: 'flex', alignItems: 'center', gap: '5px', justifyContent: justify };
  // Icon always leads the name (both rows), regardless of side -- reading
  // "arrow then name" stays consistent whether the block sits on the left
  // or right of the centre line, rather than mirroring icon position too.
  return (
    <div>
      <div style={rowStyle}>
        <ArrowUpCircle size={14} color={SUBSTITUTION_IN_COLOR} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '13px', fontWeight: 700 }}>{event.player}</span>
      </div>
      {event.substituted && (
        <div style={{ ...rowStyle, marginTop: '2px' }}>
          <ArrowDownCircle size={14} color={SUBSTITUTION_OUT_COLOR} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: theme.textMuted }}>{event.substituted}</span>
        </div>
      )}
    </div>
  );
}

// One column's worth of an event's text content -- reused for both the
// home (left, right-aligned text) and away (right, left-aligned text)
// side so the two mirror each other around the centre line.
function MatchEventContent({ theme, t, event, align }) {
  if (event.type === 'Substitution') {
    return <SubstitutionContent theme={theme} event={event} align={align} />;
  }

  const labelKey = EVENT_LABEL_KEY[event.type];
  const label = labelKey ? t.matchInfo[labelKey] : event.type;
  const icon = EVENT_ICON[event.type] || '•';

  return (
    <div style={{ textAlign: align }}>
      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
        {align !== 'right' && <span style={{ fontSize: '15px', lineHeight: 1 }}>{icon}</span>}
        <span>{event.player || label}</span>
        {align === 'right' && <span style={{ fontSize: '15px', lineHeight: 1 }}>{icon}</span>}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: '11px', color: theme.textMuted }}>{label}</p>
      {event.assist && <p style={{ margin: '2px 0 0', fontSize: '11px', color: theme.textMuted }}>{t.matchInfo.assistLabel(event.assist)}</p>}
    </div>
  );
}

// Home events on the left, away events on the right, hung off a shared
// vertical line down the middle -- one dot per event, the minute sitting
// right on the line the way a match-centre timeline reads (confirmed
// against the FlashScore-style reference this feature was designed
// against). An event whose team never resolved to a curated club (rare --
// see syncLineups.js's club_id comment) has nowhere reliable to sit, so it
// spans the full row instead of guessing a side.
function MatchEventTimelineRow({ theme, t, event, side }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: '48px' }}>
      <div style={{ flex: 1, paddingRight: '14px' }}>{side === 'home' && <MatchEventContent theme={theme} t={t} event={event} align="right" />}</div>

      <div style={{ flexShrink: 0, width: '38px', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: theme.textMuted, marginBottom: '3px', whiteSpace: 'nowrap' }}>{event.minute}'</span>
        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: theme.accent, border: `2px solid ${theme.bg}`, boxShadow: `0 0 0 1px ${theme.border}` }} />
      </div>

      <div style={{ flex: 1, paddingLeft: '14px' }}>{side === 'away' && <MatchEventContent theme={theme} t={t} event={event} align="left" />}</div>
    </div>
  );
}

function MatchInfoTimeline({ theme, t, fixture, homeClub, awayClub }) {
  const { events, loading } = useMatchEvents(fixture.id);

  if (fixture.status !== 'finished') {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <CalendarClock size={22} style={{ color: theme.textMuted, marginBottom: '8px' }} />
        <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>{t.matchInfo.notFinished}</p>
      </div>
    );
  }

  if (loading) {
    return <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.common.loading}</p>;
  }

  if (events.length === 0) {
    return <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>{t.matchInfo.noEvents}</p>;
  }

  // Newest event at the top -- ties (rare: e.g. a booking logged at the
  // same minute as a goal) keep whatever order the API returned them in,
  // since Array.prototype.sort is stable.
  const sorted = [...events].sort((a, b) => parseMinute(b.minute) - parseMinute(a.minute));

  return (
    <div style={{ position: 'relative', padding: '4px 16px 16px' }}>
      {/* The line itself: one continuous rule behind every row's dot,
          rather than each row drawing its own segment -- avoids visible
          seams between rows and keeps the dots' spacing exactly even. */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '2px', background: theme.border, transform: 'translateX(-50%)' }} />
      {sorted.map((event, i) => {
        const side = event.club_id === homeClub?.id ? 'home' : event.club_id === awayClub?.id ? 'away' : null;
        if (!side) {
          return (
            <div key={i} style={{ padding: '10px 0', textAlign: 'center' }}>
              <MatchEventContent theme={theme} t={t} event={event} align="center" />
            </div>
          );
        }
        return <MatchEventTimelineRow key={i} theme={theme} t={t} event={event} side={side} />;
      })}
    </div>
  );
}

export default function FixtureDetailOverlay({ theme, t, language, fixture, homeClub, awayClub, onClose }) {
  const [view, setView] = useState('lineups'); // 'lineups' | 'info'
  const [side, setSide] = useState('home');
  const { byClubId } = useLineups(fixture.id);
  const locale = DATE_LOCALES[language];

  const activeClub = side === 'home' ? homeClub : awayClub;
  const activeRow = activeClub ? byClubId.get(activeClub.id) : null;

  // Pointer capture (not window listeners) so move/up events keep routing
  // to the handle even once the finger/cursor drifts off it -- avoids an
  // effect just to attach/detach window-level handlers for one gesture.
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
          maxHeight: '82vh',
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
          {/* Only the handle + match info is a drag target -- the toggle
              buttons below need normal click/tap handling, and a pointerdown
              there capturing into this handler would fight that. */}
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
            <p style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center', margin: '0 0 12px' }}>{formatKickoff(fixture.kickoff_at, locale)}</p>
          </div>

          {/* Which tab is open at all -- Aufstellungen/Spielinfo -- versus
              which side's lineup is shown within the Aufstellungen tab are
              two independent choices, so this is a second, outer toggle
              row rather than folding "Spielinfo" in as a third side
              option. */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', borderBottom: `1px solid ${theme.border}` }}>
            {[['lineups', t.matchInfo.tabLineups], ['info', t.matchInfo.tabInfo]].map(([key, label]) => (
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

          {view === 'lineups' && (
            <div style={{ display: 'flex', background: theme.surface, borderRadius: '10px', padding: '3px', border: `1px solid ${theme.border}` }}>
              {[['home', homeClub], ['away', awayClub]].map(([key, club]) => (
                <button
                  key={key}
                  onClick={() => setSide(key)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '13px',
                    fontWeight: side === key ? 700 : 600,
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    background: side === key ? theme.surfaceRaised : 'transparent',
                    color: side === key ? theme.text : theme.textMuted,
                  }}
                >
                  {club?.name ?? '–'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {view === 'lineups' ? (
            <>
              <LineupList theme={theme} t={t} row={activeRow} />
              <MatchInfoFooter theme={theme} t={t} fixture={fixture} homeClub={homeClub} />
            </>
          ) : (
            <MatchInfoTimeline theme={theme} t={t} fixture={fixture} homeClub={homeClub} awayClub={awayClub} />
          )}
        </div>
      </div>
    </div>
  );
}
