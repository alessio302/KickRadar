import { useRef, useState } from 'react';
import { Star, Plus } from 'lucide-react';
import ClubBadge from './ClubBadge.jsx';

// Confirmed via feedback: the little corner "x" (15px, overlapping the
// badge) was too fiddly a target on a touchscreen -- well under Apple's
// 44pt minimum tap-target guideline, and visually cluttered every chip
// even when not being used. Long-press instead: the whole chip (much
// bigger) is the target, nothing is drawn until you actually press, and
// the same removal is still available as an explicit, clearly-labeled
// button in Settings' quick-filter list for anyone who doesn't find the
// gesture. Not a full a11y substitute for that button -- long-press has
// no reliable screen-reader equivalent -- which is exactly why that
// Settings list stays as the accessible path.
const LONG_PRESS_MS = 500;

function QuickFilterChip({ theme, club, isActive, onSelect, onRemove }) {
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef(null);
  const firedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const endPress = () => {
    clearTimer();
    setPressing(false);
  };

  const handlePointerDown = () => {
    firedRef.current = false;
    setPressing(true);
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      setPressing(false);
      if (navigator.vibrate) navigator.vibrate(10);
      onRemove();
    }, LONG_PRESS_MS);
  };

  const handlePointerUp = () => {
    const wasLongPress = firedRef.current;
    endPress();
    if (!wasLongPress) onSelect();
  };

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      style={{
        display: 'flex',
        alignItems: 'center',
        flex: '0 0 auto',
        padding: '3px',
        borderRadius: '999px',
        border: `2px solid ${isActive ? theme.accent : theme.border}`,
        background: 'transparent',
        cursor: 'pointer',
        transform: pressing ? 'scale(0.85)' : 'scale(1)',
        opacity: pressing ? 0.55 : 1,
        transition: pressing ? `transform ${LONG_PRESS_MS}ms ease, opacity ${LONG_PRESS_MS}ms ease` : 'transform 0.15s ease, opacity 0.15s ease',
      }}
    >
      <ClubBadge club={club} size={22} />
    </button>
  );
}

export default function QuickFilters({
  theme,
  t,
  clubs,
  favoriteClub,
  quickFilters,
  activeFilterId,
  onSelectFilter,
  onAddQuickFilter,
  onRemoveQuickFilter,
}) {
  const [showAdd, setShowAdd] = useState(false);

  const availableToAdd = clubs.filter(
    (c) => c.id !== favoriteClub?.id && !quickFilters.some((q) => q.id === c.id)
  );

  return (
    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '12px', alignItems: 'center' }}>
      {favoriteClub && (
        <button
          onClick={() => onSelectFilter(favoriteClub)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flex: '0 0 auto',
            padding: '4px 10px 4px 4px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: activeFilterId === favoriteClub.id ? 700 : 600,
            border: `2px solid ${activeFilterId === favoriteClub.id ? theme.accent : theme.border}`,
            cursor: 'pointer',
            background: 'transparent',
            color: activeFilterId === favoriteClub.id ? theme.accent : theme.text,
          }}
        >
          <ClubBadge club={favoriteClub} size={20} />
          <Star size={11} fill="currentColor" />
        </button>
      )}

      {quickFilters.map((club) => (
        <QuickFilterChip
          key={club.id}
          theme={theme}
          club={club}
          isActive={activeFilterId === club.id}
          onSelect={() => onSelectFilter(club)}
          onRemove={() => onRemoveQuickFilter(club.id)}
        />
      ))}

      {!showAdd ? (
        availableToAdd.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            aria-label={t.quickFilters.addAria}
            style={{
              flex: '0 0 auto',
              width: '28px',
              height: '28px',
              borderRadius: '999px',
              border: `1px dashed ${theme.border}`,
              background: 'transparent',
              color: theme.textMuted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={14} />
          </button>
        )
      ) : (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => {
            const club = availableToAdd.find((c) => String(c.id) === e.target.value);
            if (club) onAddQuickFilter(club);
            setShowAdd(false);
          }}
          onBlur={() => setShowAdd(false)}
          style={{
            fontSize: '12px',
            padding: '5px 6px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            background: theme.surface,
            color: theme.text,
            flex: '0 0 auto',
          }}
        >
          <option value="" disabled>
            {t.common.chooseClub}
          </option>
          {availableToAdd.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
