import { Bell, X } from 'lucide-react';
import ClubBadge from './ClubBadge.jsx';
import { useAllClubs } from '../hooks/useAllClubs.js';
import { usePushSubscription } from '../hooks/usePushSubscription.js';

const THEME_OPTIONS = [
  ['system', 'System'],
  ['light', 'Hell'],
  ['dark', 'Dunkel'],
];

export default function SettingsTab({
  theme,
  darkModeSetting,
  onSetDarkModeSetting,
  favoriteClub,
  onSetFavoriteClub,
  quickFilters,
  onRemoveQuickFilter,
}) {
  const { byLeague } = useAllClubs();
  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushLoading, error: pushError, subscribe, unsubscribe } = usePushSubscription();

  return (
    <div style={{ padding: '16px' }}>
      <p style={{ fontSize: '12px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
        Darstellung
      </p>
      <div style={{ display: 'flex', background: theme.surface, borderRadius: '10px', padding: '3px', marginBottom: '20px', border: `1px solid ${theme.border}` }}>
        {THEME_OPTIONS.map(([val, label]) => (
          <button
            key={val}
            onClick={() => onSetDarkModeSetting(val)}
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '12px',
              fontWeight: darkModeSetting === val ? 700 : 600,
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: darkModeSetting === val ? theme.accent : theme.textMuted,
              borderBottom: `2px solid ${darkModeSetting === val ? theme.accent : 'transparent'}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: '12px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
        Lieblingsverein
      </p>
      <select
        value={favoriteClub?.id ?? ''}
        onChange={(e) => {
          for (const group of Object.values(byLeague)) {
            const club = group.clubs.find((c) => String(c.id) === e.target.value);
            if (club) return onSetFavoriteClub(club);
          }
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontSize: '14px',
          padding: '9px 12px',
          borderRadius: '10px',
          border: `1px solid ${theme.border}`,
          background: theme.surface,
          color: theme.text,
          marginBottom: '20px',
        }}
      >
        <option value="" disabled>
          Verein wählen…
        </option>
        {Object.entries(byLeague).map(([slug, group]) => (
          <optgroup key={slug} label={group.label}>
            {group.clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <p style={{ fontSize: '12px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
        Quick-Filter
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
        {quickFilters.length === 0 && (
          <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>Noch keine Quick-Filter angelegt. Füge sie im Transfers-Tab hinzu.</p>
        )}
        {quickFilters.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              justifyContent: 'space-between',
              background: theme.surface,
              borderRadius: '10px',
              padding: '9px 12px',
              border: `1px solid ${theme.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClubBadge club={c} size={20} />
              <span style={{ fontSize: '14px' }}>{c.name}</span>
            </div>
            <button onClick={() => onRemoveQuickFilter(c.id)} aria-label={`${c.name} entfernen`} style={{ border: 'none', background: 'transparent', color: theme.textMuted, cursor: 'pointer' }}>
              <X size={15} />
            </button>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '12px', fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
        Benachrichtigungen
      </p>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: theme.surface,
          borderRadius: '10px',
          padding: '12px',
          border: `1px solid ${theme.border}`,
          marginBottom: '8px',
          opacity: pushSupported ? 1 : 0.6,
        }}
      >
        <span style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bell size={14} /> Push bei neuen Transfers
        </span>
        {!pushSupported ? (
          <span style={{ fontSize: '11px', color: theme.textMuted }}>nicht unterstützt</span>
        ) : (
          <button
            onClick={() => (pushSubscribed ? unsubscribe() : subscribe())}
            disabled={pushLoading}
            aria-label="Push bei neuen Transfers umschalten"
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '999px',
              border: 'none',
              cursor: pushLoading ? 'default' : 'pointer',
              background: pushSubscribed ? theme.accent : theme.border,
              position: 'relative',
            }}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: theme.surface,
                position: 'absolute',
                top: '3px',
                left: pushSubscribed ? '21px' : '3px',
                transition: 'left 0.15s',
              }}
            />
          </button>
        )}
      </div>
      {pushError && (
        <p style={{ fontSize: '12px', color: theme.accent, margin: '0 0 8px' }}>{pushError}</p>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: theme.surface,
          borderRadius: '10px',
          padding: '12px',
          border: `1px solid ${theme.border}`,
          opacity: 0.6,
        }}
      >
        <span style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bell size={14} /> Push bei bestätigter Aufstellung
        </span>
        <span style={{ fontSize: '11px', color: theme.textMuted }}>bald verfügbar</span>
      </div>
    </div>
  );
}
