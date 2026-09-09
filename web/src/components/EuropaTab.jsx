import { useMemo } from 'react';
import { useEuropaFixtures } from '../hooks/useEuropaFixtures.js';
import { UEFA_COMPETITIONS } from '../lib/leagues.js';
import { DATE_LOCALES } from '../i18n/languages.js';

function formatDate(iso, locale) {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });
}
function formatTime(iso, locale) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function EuropaFixtureRow({ fixture, theme, t, locale }) {
  const isLive = fixture.status === 'live';
  const isFinished = fixture.status === 'finished';

  let timeLabel;
  if (isFinished) {
    timeLabel = `${fixture.home_score ?? '–'} : ${fixture.away_score ?? '–'}`;
  } else if (isLive && fixture.live_minute) {
    timeLabel = fixture.live_minute === 'HT' ? 'HT' : `${fixture.live_minute}'`;
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
        gap: '10px',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          fontWeight: 700,
          color: isLive ? theme.danger : isFinished ? theme.textMuted : theme.accent,
          width: '52px',
          flex: '0 0 auto',
          whiteSpace: 'nowrap',
        }}
      >
        {timeLabel}
      </span>
      <span
        style={{
          fontSize: '13px',
          fontWeight: 600,
          flex: 1,
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {fixture.home_team_name || '—'}
      </span>
      <span style={{ fontSize: '11px', color: theme.textMuted, flex: '0 0 auto' }}>
        {t.common.vs}
      </span>
      <span
        style={{
          fontSize: '13px',
          fontWeight: 600,
          flex: 1,
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {fixture.away_team_name || '—'}
      </span>
    </div>
  );
}

export default function EuropaTab({ theme, t, language }) {
  const { data, loading } = useEuropaFixtures();
  const locale = DATE_LOCALES[language];

  // Group each competition's fixtures by date label (same pattern as
  // FixturesTab.jsx's FixturesList).
  const grouped = useMemo(() => {
    const result = {};
    for (const comp of UEFA_COMPETITIONS) {
      const fixtures = data[comp.slug] ?? [];
      const byDate = {};
      for (const f of fixtures) {
        const key = formatDate(f.kickoff_at, locale);
        (byDate[key] = byDate[key] || []).push(f);
      }
      result[comp.slug] = byDate;
    }
    return result;
  }, [data, locale]);

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
      {loading && (
        <p style={{ fontSize: '13px', color: theme.textMuted, textAlign: 'center', padding: '24px 0' }}>
          {t.common.loading}
        </p>
      )}

      {!loading &&
        UEFA_COMPETITIONS.map((comp) => {
          const byDate = grouped[comp.slug] ?? {};
          const dateEntries = Object.entries(byDate);
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
