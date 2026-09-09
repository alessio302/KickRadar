import { useState, useMemo } from 'react';
import { useEuropaFixtures } from '../hooks/useEuropaFixtures.js';
import { UEFA_COMPETITIONS } from '../lib/leagues.js';
import { DATE_LOCALES } from '../i18n/languages.js';
import MatchScore from './MatchScore.jsx';

function formatDate(iso, locale) {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
}
function formatTime(iso, locale) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function TeamBadge({ url, name, size = 20, theme }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        title={name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', flex: '0 0 auto' }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background: theme.surfaceRaised,
        border: `1px solid ${theme.border}`,
        boxSizing: 'border-box',
        flex: '0 0 auto',
      }}
    />
  );
}

function EuropaFixtureRow({ fixture, theme, t, locale }) {
  const isLive = fixture.status === 'live';
  const isFinished = fixture.status === 'finished';

  let timeLabel;
  if (isLive && fixture.live_minute) {
    timeLabel = fixture.live_minute === 'HT' ? 'HT' : `${fixture.live_minute}'`;
  } else if (isFinished) {
    timeLabel = t.fixtures.finished;
  } else if (fixture.kickoff_confirmed === false) {
    timeLabel = t.fixtures.kickoffTbd;
  } else {
    timeLabel = formatTime(fixture.kickoff_at, locale);
  }

  return (
    <div
      style={{
        background: theme.surfaceRaised,
        padding: '10px 14px',
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {/* Status / kickoff time */}
      <span
        style={{
          fontSize: '13px',
          fontWeight: 700,
          color: isLive ? theme.danger : theme.accent,
          width: '66px',
          flex: '0 0 auto',
          whiteSpace: 'nowrap',
        }}
      >
        {timeLabel}
      </span>

      {/* Home badge + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fixture.home_team_name || '—'}
        </span>
        <TeamBadge url={fixture.home_team_badge} name={fixture.home_team_name} theme={theme} />
      </div>

      {/* Score / vs */}
      <MatchScore
        fixture={fixture}
        t={t}
        theme={theme}
        style={{ fontSize: '11px', color: theme.textMuted, flex: '0 0 auto' }}
      />

      {/* Away badge + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
        <TeamBadge url={fixture.away_team_badge} name={fixture.away_team_name} theme={theme} />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fixture.away_team_name || '—'}
        </span>
      </div>
    </div>
  );
}

export default function EuropaTab({ theme, t, language }) {
  const { data, loading } = useEuropaFixtures();
  const locale = DATE_LOCALES[language];
  const [liveOnly, setLiveOnly] = useState(false);

  const grouped = useMemo(() => {
    const result = {};
    for (const comp of UEFA_COMPETITIONS) {
      let fixtures = data[comp.slug] ?? [];
      if (liveOnly) fixtures = fixtures.filter((f) => f.status === 'live');
      const byDate = {};
      for (const f of fixtures) {
        const key = formatDate(f.kickoff_at, locale);
        (byDate[key] = byDate[key] || []).push(f);
      }
      result[comp.slug] = byDate;
    }
    return result;
  }, [data, locale, liveOnly]);

  const hasLive = useMemo(
    () => UEFA_COMPETITIONS.some((c) => (data[c.slug] ?? []).some((f) => f.status === 'live')),
    [data]
  );

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'none',
        padding: '12px 16px 14px',
      }}
    >
      {/* Live filter */}
      {!loading && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => setLiveOnly((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 12px',
              borderRadius: '20px',
              border: `1px solid ${liveOnly ? theme.danger : theme.border}`,
              background: liveOnly ? theme.danger : 'transparent',
              color: liveOnly ? '#fff' : hasLive ? theme.danger : theme.textMuted,
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            {hasLive && !liveOnly && (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: theme.danger,
                  flexShrink: 0,
                }}
              />
            )}
            {t.fixtures.live}
          </button>
        </div>
      )}

      {loading && (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
          {t.common.loading}
        </p>
      )}

      {!loading &&
        UEFA_COMPETITIONS.map((comp) => {
          const byDate = grouped[comp.slug] ?? {};
          const dateEntries = Object.entries(byDate);
          if (liveOnly && dateEntries.length === 0) return null;
          return (
            <div key={comp.slug} style={{ marginBottom: '28px' }}>
              {/* Competition header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '12px',
                  paddingBottom: '8px',
                  borderBottom: `2px solid ${comp.color}`,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: comp.color,
                    fontSize: '10px',
                    fontWeight: 800,
                    color: '#fff',
                    flexShrink: 0,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {comp.shortName}
                </span>
                <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{comp.label}</h2>
              </div>

              {/* Fixture rows grouped by date */}
              {dateEntries.length === 0 ? (
                <p style={{ fontSize: '13px', color: theme.textMuted, paddingLeft: '4px' }}>
                  {t.fixtures.empty}
                </p>
              ) : (
                dateEntries.map(([date, fixtures]) => (
                  <div key={date} style={{ marginBottom: '12px' }}>
                    <p
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        margin: '0 0 6px',
                      }}
                    >
                      {date}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {fixtures.map((f) => (
                        <EuropaFixtureRow key={f.id} fixture={f} theme={theme} t={t} locale={locale} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
    </div>
  );
}
