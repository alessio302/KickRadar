import { useState } from 'react';
import { Bell, Check, ChevronDown, X } from 'lucide-react';
import ClubJersey from './ClubJersey.jsx';
import { useAllClubs } from '../hooks/useAllClubs.js';
import { usePushSubscription, NOTIFICATIONS_DENIED } from '../hooks/usePushSubscription.js';
import { LANGUAGES } from '../i18n/languages.js';

const SECTION_LABEL_STYLE = { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' };

export default function SettingsTab({
  theme,
  t,
  language,
  onSetLanguage,
  darkModeSetting,
  onSetDarkModeSetting,
  favoriteClub,
  onSetFavoriteClub,
  quickFilters,
  onRemoveQuickFilter,
}) {
  const { byLeague } = useAllClubs();
  const [languageOpen, setLanguageOpen] = useState(false);
  const {
    supported: pushSupported,
    subscribed: pushSubscribed,
    notifyTransfers,
    notifyLineups,
    loading: pushLoading,
    error: pushError,
    setNotifyTransfers,
    setNotifyLineups,
  } = usePushSubscription(language);

  const themeOptions = [
    ['system', t.settings.appearanceSystem],
    ['light', t.settings.appearanceLight],
    ['dark', t.settings.appearanceDark],
  ];
  const activeLanguage = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px', boxSizing: 'border-box' }}>
      <p style={{ ...SECTION_LABEL_STYLE, color: theme.textMuted }}>{t.settings.appearance}</p>
      <div style={{ display: 'flex', background: theme.surface, borderRadius: '10px', padding: '3px', marginBottom: '20px', border: `1px solid ${theme.border}` }}>
        {themeOptions.map(([val, label]) => (
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

      <p style={{ ...SECTION_LABEL_STYLE, color: theme.textMuted }}>{t.settings.language}</p>
      <div style={{ borderRadius: '10px', border: `1px solid ${theme.border}`, marginBottom: '20px', overflow: 'hidden' }}>
        <button
          onClick={() => setLanguageOpen((v) => !v)}
          aria-expanded={languageOpen}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '11px 14px',
            border: 'none',
            background: theme.surface,
            color: theme.text,
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {activeLanguage.label}
          <ChevronDown size={16} style={{ color: theme.textMuted, transform: languageOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {languageOpen && (
          <div style={{ borderTop: `1px solid ${theme.border}` }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  onSetLanguage(l.code);
                  setLanguageOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 14px',
                  border: 'none',
                  borderTop: `1px solid ${theme.border}`,
                  background: l.code === language ? `${theme.accent}1a` : theme.surfaceRaised,
                  color: l.code === language ? theme.accent : theme.text,
                  fontSize: '14px',
                  fontWeight: l.code === language ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {l.label}
                {l.code === language && <Check size={15} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <p style={{ ...SECTION_LABEL_STYLE, color: theme.textMuted }}>{t.settings.favoriteClub}</p>
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
          {t.common.chooseClub}
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

      <p style={{ ...SECTION_LABEL_STYLE, color: theme.textMuted }}>{t.settings.quickFilters}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
        {quickFilters.length === 0 && (
          <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>{t.settings.noQuickFilters}</p>
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
              <ClubJersey club={c} size={20} theme={theme} />
              <span style={{ fontSize: '14px' }}>{c.name}</span>
            </div>
            <button onClick={() => onRemoveQuickFilter(c.id)} aria-label={t.settings.removeClub(c.name)} style={{ border: 'none', background: 'transparent', color: theme.textMuted, cursor: 'pointer' }}>
              <X size={15} />
            </button>
          </div>
        ))}
      </div>

      <p style={{ ...SECTION_LABEL_STYLE, color: theme.textMuted }}>{t.settings.notifications}</p>
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
          <Bell size={14} /> {t.settings.pushTransfers}
        </span>
        {!pushSupported ? (
          <span style={{ fontSize: '11px', color: theme.textMuted }}>{t.common.notSupported}</span>
        ) : (
          <button
            onClick={() => setNotifyTransfers(!(pushSubscribed && notifyTransfers))}
            disabled={pushLoading}
            aria-label={t.settings.pushTransfersToggle}
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '999px',
              border: 'none',
              cursor: pushLoading ? 'default' : 'pointer',
              background: pushSubscribed && notifyTransfers ? theme.accent : theme.border,
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
                left: pushSubscribed && notifyTransfers ? '21px' : '3px',
                transition: 'left 0.15s',
              }}
            />
          </button>
        )}
      </div>
      {pushError && (
        <p style={{ fontSize: '12px', color: theme.accent, margin: '0 0 8px' }}>
          {pushError === NOTIFICATIONS_DENIED ? t.errors.notificationsDenied : pushError}
        </p>
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
          opacity: pushSupported ? 1 : 0.6,
        }}
      >
        <span style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bell size={14} /> {t.settings.pushLineups}
        </span>
        {!pushSupported ? (
          <span style={{ fontSize: '11px', color: theme.textMuted }}>{t.common.notSupported}</span>
        ) : (
          <button
            onClick={() => setNotifyLineups(!(pushSubscribed && notifyLineups))}
            disabled={pushLoading}
            aria-label={t.settings.pushLineupsToggle}
            style={{
              width: '40px',
              height: '22px',
              borderRadius: '999px',
              border: 'none',
              cursor: pushLoading ? 'default' : 'pointer',
              background: pushSubscribed && notifyLineups ? theme.accent : theme.border,
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
                left: pushSubscribed && notifyLineups ? '21px' : '3px',
                transition: 'left 0.15s',
              }}
            />
          </button>
        )}
      </div>

      <p style={{ ...SECTION_LABEL_STYLE, color: theme.textMuted }}>{t.settings.legal}</p>
      <div style={{ display: 'flex', gap: '16px' }}>
        <a href="/impressum.html" style={{ fontSize: '13px', color: theme.textMuted }}>{t.settings.imprint}</a>
        <a href="/datenschutz.html" style={{ fontSize: '13px', color: theme.textMuted }}>{t.settings.privacyPolicy}</a>
      </div>
    </div>
  );
}
