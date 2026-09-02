import { useMemo, useRef, useState } from 'react';
import { Users, CalendarClock, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import ClubJersey from './ClubJersey.jsx';
import MatchScore from './MatchScore.jsx';
import PlayerProfileOverlay from './PlayerProfileOverlay.jsx';
import ClubDetailOverlay from './ClubDetailOverlay.jsx';
import { StandingsTable } from './StandingsTab.jsx';
import { fetchPlayerProfile } from '../lib/playerProfile.js';
import { useLineups } from '../hooks/useLineups.js';
import { useMatchEvents } from '../hooks/useMatchEvents.js';
import { useTeamForm } from '../hooks/useTeamForm.js';
import { useHeadToHead } from '../hooks/useHeadToHead.js';
import { useStandings } from '../hooks/useStandings.js';
import { DATE_LOCALES } from '../i18n/languages.js';

// Drag distance past which releasing counts as "dismiss" rather than
// "snap back" -- matches the rough feel of native bottom sheets (iOS
// Maps, most drawer libraries) without pulling in a gesture library for
// one interaction.
const DISMISS_THRESHOLD_PX = 100;

function formatKickoff(iso, locale) {
  return new Date(iso).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// initialLineup is an array of arrays -- one per tactical line, GK first
// and forwards last -- not a flat list, and each player is { name,
// number, position, id }. substitutes is a flat array of the same player
// shape. This grouping is built server-side in syncLineups.js's
// groupByFormationRows() (GOAL API's own lineup data is a flat list, one
// sequential lineupPosition per player, not pre-grouped by tactical
// line), so this frontend contract stays fixed regardless of which
// upstream provider is behind it -- it just renders whatever rows it's
// given. position uses the English enum keys
// Goalkeeper/Defender/Midfielder/Forward -- t.lineup.positions (see
// i18n/translations.js) supplies the translated value per language.
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
//
// PITCH_SAFE_ROWS fixes the floor instead of scaling minHeight to this
// lineup's own rank count -- confirmed live, two lineups shown right after
// each other (a 4-rank and a 5-rank one) rendered at visibly different
// pitch heights, which read as a layout bug even though nothing was
// actually cropped. 5 covers every shape actually seen: syncLineups.js's
// groupByFormationRows() produces GK + one row per formation-string
// segment, and every formation stored so far tops out at 4 segments
// (e.g. "4-2-3-1", "3-1-4-2") -- 5 rows total. Math.max keeps the
// original safety net for anything unexpectedly taller (a 5-segment
// formation GOAL API hasn't returned yet, or the broad-category
// fallback) instead of silently cropping it.
const PITCH_SAFE_ROWS = 5;
// Up from 44 -- more vertical breathing room between ranks, per feedback.
const PITCH_ROW_HEIGHT = 58;

function PitchFormation({ formation, rows, onSelectPlayer }) {
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
        minHeight: `${Math.max(PITCH_SAFE_ROWS, rows.length) * PITCH_ROW_HEIGHT + 40}px`,
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
              <button
                key={p.id}
                onClick={() => onSelectPlayer?.(p)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '54px',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {p.photo ? (
                  // Real player photo (GOAL API's own CDN, already embedded
                  // in every lineup entry -- see syncLineups.js's
                  // normalizePlayer -- no extra fetch needed). Falls back to
                  // the jersey-number circle below for whatever fraction of
                  // players GOAL API has no photo for, rather than showing
                  // a broken image icon.
                  <img
                    src={p.photo}
                    alt=""
                    width={30}
                    height={30}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextSibling.style.display = 'flex';
                    }}
                    style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.85)' }}
                  />
                ) : null}
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.94)',
                    color: '#15181D',
                    display: p.photo ? 'none' : 'flex',
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
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineupList({ theme, t, row, onSelectPlayer }) {
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
          <PitchFormation formation={row.formation} rows={rows} onSelectPlayer={onSelectPlayer} />
        </div>
      )}

      {subs.length > 0 && (
        <>
          <p style={{ fontSize: '11px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
            {t.lineup.substitutes}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {subs.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelectPlayer?.(p)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: '13px', color: theme.textMuted, cursor: 'pointer' }}
              >
                {playerLabel(p, t)}
              </button>
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
// Traced from a real pea-whistle photo (pointed mouthpiece wedge, round
// chamber with its sound hole, lanyard ring on a short neck) -- per
// feedback this shape actually reads as a whistle, unlike the rounded
// no-ring simplification tried in between. Kept as-is and just rotated
// so the mouthpiece points left instead of the reference photo's
// original diagonal angle.
function Whistle({ size = 16, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <g transform="rotate(32 16.3 11.3)">
        <path d="M1.5 20.5 12.5 7.5 14.3 10.2 5 22Z" />
        <circle cx="16.3" cy="11.3" r="5.4" />
        <circle cx="16.3" cy="12.2" r="2.5" />
        <circle cx="15" cy="3.8" r="1.9" />
        <path d="M15 5.5v1.4" />
      </g>
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
          <span>{fixture.referee}</span>
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
// reads instantly as "goal"/"card"/"sub" without needing a legend. Cards
// are drawn separately below (CardIcon) instead of via emoji -- lucide has
// no football-card icon, and 🟨/🟥 render as plain squares, not a card's
// actual narrow-rectangle shape.
const EVENT_ICON = {
  Goal: '⚽',
  'Own Goal': '⚽',
  Penalty: '⚽',
  Substitution: '🔄',
};

const CARD_COLOR = {
  'Yellow Card': '#facc15',
  'Red Card': '#ef4444',
};

function CardIcon({ color }) {
  return <span style={{ display: 'inline-block', width: '10px', height: '14px', borderRadius: '2px', background: color, flexShrink: 0 }} />;
}

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
//
// Icon placement mirrors side (same idea as MatchEventContent's goal/card
// icon below) rather than always leading the name -- confirmed live that
// "icon always first" left the arrows drifting left/right per row on the
// right-aligned (home) side, since a right-aligned block's leading edge
// floats with however wide that row's player name happens to be, so the
// fixed-width arrow never lands at the same x twice. Placing the icon as
// the *inner* element (closest to the centre line) on both sides instead
// anchors it to a fixed edge regardless of name length, so arrows actually
// line up in one vertical column on each side.
function SubstitutionContent({ theme, event, align }) {
  const justify = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  const rowStyle = { display: 'flex', alignItems: 'center', gap: '5px', justifyContent: justify };
  const iconFirst = align !== 'right';
  return (
    <div>
      <div style={rowStyle}>
        {iconFirst && <ArrowUpCircle size={14} color={SUBSTITUTION_IN_COLOR} style={{ flexShrink: 0 }} />}
        <span style={{ fontSize: '13px', fontWeight: 700 }}>{event.player}</span>
        {!iconFirst && <ArrowUpCircle size={14} color={SUBSTITUTION_IN_COLOR} style={{ flexShrink: 0 }} />}
      </div>
      {event.substituted && (
        <div style={{ ...rowStyle, marginTop: '2px' }}>
          {iconFirst && <ArrowDownCircle size={14} color={SUBSTITUTION_OUT_COLOR} style={{ flexShrink: 0 }} />}
          <span style={{ fontSize: '12px', color: theme.textMuted }}>{event.substituted}</span>
          {!iconFirst && <ArrowDownCircle size={14} color={SUBSTITUTION_OUT_COLOR} style={{ flexShrink: 0 }} />}
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
  // Only used as a fallback when an event has no player name (rare) --
  // the icon itself (⚽/card/🔄) already says what happened, so it's no
  // longer also spelled out as a second line under the name.
  const label = labelKey ? t.matchInfo[labelKey] : event.type;
  const cardColor = CARD_COLOR[event.type];
  const iconEl = cardColor ? <CardIcon color={cardColor} /> : <span style={{ fontSize: '12px', lineHeight: 1 }}>{EVENT_ICON[event.type] || '•'}</span>;

  return (
    <div style={{ textAlign: align }}>
      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
        {align !== 'right' && iconEl}
        <span>{event.player || label}</span>
        {align === 'right' && iconEl}
      </p>
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

  // 'live' shown here too, not just 'finished' -- src/lineups/syncLiveEvents.js
  // now streams goals/cards/subs in over Realtime while a match is still
  // being played (see useMatchEvents.js), so there's real content to show.
  if (fixture.status !== 'finished' && fixture.status !== 'live') {
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

const SECTION_LABEL_STYLE = (theme) => ({
  fontSize: '11px',
  fontWeight: 700,
  color: theme.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  margin: '0 0 10px',
});
const HINT_STYLE = (theme) => ({ fontSize: '13px', color: theme.textMuted, margin: '0 0 4px', padding: '4px 0' });

// W green / L red / D grey, exactly the FlashScore-style convention this
// was modeled on -- letters stay the fixed English W/D/L abbreviations
// regardless of app language (per feedback), only the section labels
// around them are translated.
const FORM_COLOR = { W: '#22c55e', L: '#ef4444', D: '#8a8f98' };

function FormCircle({ result }) {
  return (
    <div
      style={{
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: FORM_COLOR[result],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>{result}</span>
    </div>
  );
}

// Oldest-to-newest left-to-right (useTeamForm.js already returns them in
// that order) -- the most recent result reads as the rightmost circle.
function FormRow({ theme, club, form }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
      <span style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
        {club?.short_name || club?.name}
      </span>
      <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
        {form.map((f) => (
          <FormCircle key={f.fixtureId} result={f.result} />
        ))}
      </div>
    </div>
  );
}

// meeting.home_club_id/away_club_id can be either of the two overlay clubs
// depending on which one hosted that particular past meeting -- resolved
// against the overlay's own homeClub/awayClub rather than assumed fixed.
function HeadToHeadRow({ theme, meeting, homeClub, awayClub, locale }) {
  const meetingIsHomeClubHost = meeting.home_club_id === homeClub?.id;
  const hostClub = meetingIsHomeClubHost ? homeClub : awayClub;
  const guestClub = meetingIsHomeClubHost ? awayClub : homeClub;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px', padding: '6px 0' }}>
      <span style={{ color: theme.textMuted, flexShrink: 0 }}>
        {new Date(meeting.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })}
      </span>
      {/* Left-aligned right after the date with a fixed gap, not pushed to
          the row's right edge -- confirmed live that right-alignment plus
          a fixed per-name column width left long club names (e.g. "Stade
          Rennais", short_name is whatever football-data.org happens to
          return -- some are already short like "PSG", others aren't) with
          nowhere to grow and always ellipsis-truncated, regardless of how
          much space the row actually had. Widened 72px -> 96px on top of
          that for real headroom; still fixed-width (not flex/intrinsic) so
          the colon stays column-aligned across rows, and still has
          ellipsis as a fallback for the genuine long-tail case (e.g.
          "Borussia Mönchengladbach"). */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ width: '96px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {hostClub?.short_name || hostClub?.name}
        </span>
        <span style={{ width: '40px', flexShrink: 0, textAlign: 'center', fontWeight: 700 }}>
          {meeting.home_score} : {meeting.away_score}
        </span>
        <span style={{ width: '96px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {guestClub?.short_name || guestClub?.name}
        </span>
      </div>
    </div>
  );
}

function StandingRow({ theme, t, club, entry }) {
  if (!entry) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', padding: '5px 0' }}>
      <span style={{ fontWeight: 600 }}>{club?.short_name || club?.name}</span>
      <span style={{ color: theme.textMuted }}>{t.stats.positionLabel(entry.position)}</span>
    </div>
  );
}

// fixture.highlight_video_url is a YouTube embed URL
// (https://www.youtube.com/embed/<id>) -- see src/lineups/syncHighlights.js.
// GOAL API's own Videos resource was tried first (a direct .mp4, playable
// in a plain <video> tag) but confirmed live to only hold historical
// (~2025) clips in this environment, nothing for the current 2026/27
// season being tracked; the leagues' own official YouTube highlight
// playlists turned out to have same-day current-season clips instead, at
// the cost of needing an <iframe> embed (YouTube's own playback requires
// it -- no direct file URL to hand to <video>). Only reachable via a tab
// that's itself only shown for a finished fixture (see the tab list
// below), so "not finished yet" was never a state this needs to handle --
// only "finished, but no clip found (yet or ever)" is.
function HighlightsTab({ theme, t, fixture }) {
  if (!fixture.highlight_video_url) {
    return <p style={{ ...HINT_STYLE(theme), textAlign: 'center', padding: '32px 16px' }}>{t.matchInfo.noHighlights}</p>;
  }
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: '10px', overflow: 'hidden', background: '#000' }}>
        <iframe
          key={fixture.highlight_video_url}
          src={fixture.highlight_video_url}
          title={t.matchInfo.tabHighlights}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
}

function MatchStatsTab({ theme, t, language, league, homeClub, awayClub }) {
  const locale = DATE_LOCALES[language];
  const { form: homeForm, loading: homeFormLoading } = useTeamForm(homeClub?.id);
  const { form: awayForm, loading: awayFormLoading } = useTeamForm(awayClub?.id);
  const { meetings, loading: h2hLoading } = useHeadToHead(homeClub?.id, awayClub?.id);
  const { table: standingsTable, loading: standingsLoading } = useStandings(league);
  const standingsByClubId = useMemo(() => new Map(standingsTable.map((row) => [row.club_id, row])), [standingsTable]);

  const formLoading = homeFormLoading || awayFormLoading;
  const noForm = !formLoading && homeForm.length === 0 && awayForm.length === 0;

  return (
    <div style={{ padding: '4px 16px 20px' }}>
      <p style={SECTION_LABEL_STYLE(theme)}>{t.stats.form}</p>
      {formLoading ? (
        <p style={HINT_STYLE(theme)}>{t.common.loading}</p>
      ) : noForm ? (
        <p style={HINT_STYLE(theme)}>{t.stats.noForm}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '22px' }}>
          <FormRow theme={theme} club={homeClub} form={homeForm} />
          <FormRow theme={theme} club={awayClub} form={awayForm} />
        </div>
      )}

      <p style={SECTION_LABEL_STYLE(theme)}>{t.stats.headToHead}</p>
      {h2hLoading ? (
        <p style={HINT_STYLE(theme)}>{t.common.loading}</p>
      ) : meetings.length === 0 ? (
        <p style={HINT_STYLE(theme)}>{t.stats.noHeadToHead}</p>
      ) : (
        <div style={{ marginBottom: '22px' }}>
          {meetings.map((m) => (
            <HeadToHeadRow key={m.id} theme={theme} meeting={m} homeClub={homeClub} awayClub={awayClub} locale={locale} />
          ))}
        </div>
      )}

      <p style={SECTION_LABEL_STYLE(theme)}>{t.stats.standing}</p>
      {standingsLoading ? (
        <p style={HINT_STYLE(theme)}>{t.common.loading}</p>
      ) : standingsByClubId.size === 0 ? (
        <p style={HINT_STYLE(theme)}>{t.standings.empty}</p>
      ) : (
        <div>
          <StandingRow theme={theme} t={t} club={homeClub} entry={standingsByClubId.get(homeClub?.id)} />
          <StandingRow theme={theme} t={t} club={awayClub} entry={standingsByClubId.get(awayClub?.id)} />
        </div>
      )}
    </div>
  );
}

export default function FixtureDetailOverlay({ theme, t, language, league, fixture, homeClub, awayClub, initialView, onClose }) {
  // initialView carries a highlights push notification's deep link (see
  // FixturesTab.jsx's own comment on why it arrives via onSelectFixture's
  // second argument rather than a prop read at render time) -- 'lineups'
  // whenever the overlay was opened by a normal row tap instead.
  const [view, setView] = useState(initialView || 'lineups'); // 'lineups' | 'info' | 'stats' | 'highlights'
  const [side, setSide] = useState('home');
  const { byClubId } = useLineups(fixture.id);
  const locale = DATE_LOCALES[language];

  const activeClub = side === 'home' ? homeClub : awayClub;
  const activeRow = activeClub ? byClubId.get(activeClub.id) : null;

  // Tapping a lineup/substitute entry opens PlayerProfileOverlay, same as
  // TransfersTab.jsx's onOpenProfile and ClubDetailOverlay.jsx's squad tap
  // -- shown immediately from the lineup entry's own fields (name/photo/
  // position, always present) so the sheet never opens on nothing, then
  // upgraded to the same live get-player-profile call every other
  // player-profile entry point uses (see lib/playerProfile.js), so the
  // same player shows identical stats regardless of which of the three
  // opened the overlay.
  const [profilePlayer, setProfilePlayer] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedClub, setSelectedClub] = useState(null);
  const handleSelectPlayer = async (p) => {
    if (!p) return;
    setProfilePlayer({ name: p.name, photo_url: p.photo, position: p.position });
    setProfileLoading(true);
    const live = await fetchPlayerProfile(p.id);
    if (live) setProfilePlayer(live);
    setProfileLoading(false);
  };

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
          // Fixed, not maxHeight -- with only a cap, the flex column below
          // shrank to fit whatever the active tab's content needed (a short
          // stats list vs. a long lineup), so the whole sheet visibly
          // resized every time the user switched tabs. A fixed height plus
          // the content area's own overflowY:auto (below) keeps the sheet's
          // footprint constant and lets each tab scroll internally instead.
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
            {[
              ['lineups', t.matchInfo.tabLineups],
              ['info', t.matchInfo.tabInfo],
              ['stats', t.matchInfo.tabStats],
              ['table', t.matchInfo.tabTable],
              // Only offered once the match is actually over -- an upcoming
              // or live fixture can never have a highlight clip yet, same
              // reasoning FixtureRow.jsx already applies to the favorite
              // star for the opposite case (a finished match can't go live
              // again).
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
                  {club?.short_name || club?.name || '–'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {view === 'lineups' && (
            <>
              <LineupList theme={theme} t={t} row={activeRow} onSelectPlayer={handleSelectPlayer} />
              <MatchInfoFooter theme={theme} t={t} fixture={fixture} homeClub={homeClub} />
            </>
          )}
          {view === 'info' && (
            <MatchInfoTimeline theme={theme} t={t} fixture={fixture} homeClub={homeClub} awayClub={awayClub} />
          )}
          {view === 'stats' && (
            <MatchStatsTab theme={theme} t={t} language={language} league={league} homeClub={homeClub} awayClub={awayClub} />
          )}
          {view === 'table' && <StandingsTable theme={theme} t={t} league={league} onSelectClub={setSelectedClub} />}
          {view === 'highlights' && <HighlightsTab theme={theme} t={t} fixture={fixture} />}
        </div>
      </div>
    </div>
    {profilePlayer && (
      <PlayerProfileOverlay theme={theme} t={t} player={profilePlayer} locale={locale} loading={profileLoading} onClose={() => setProfilePlayer(null)} />
    )}
    {selectedClub && (
      <ClubDetailOverlay theme={theme} t={t} language={language} league={league} club={selectedClub} onClose={() => setSelectedClub(null)} />
    )}
    </>
  );
}
