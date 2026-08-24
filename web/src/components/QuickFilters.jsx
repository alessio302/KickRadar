import { useState } from 'react';
import { Star, Plus, X } from 'lucide-react';
import ClubBadge from './ClubBadge.jsx';

export default function QuickFilters({
  theme,
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

      {quickFilters.map((club) => {
        const isActive = activeFilterId === club.id;
        return (
          <div key={club.id} style={{ position: 'relative', flex: '0 0 auto' }}>
            <button
              onClick={() => onSelectFilter(club)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '3px',
                borderRadius: '999px',
                border: `2px solid ${isActive ? theme.accent : theme.border}`,
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <ClubBadge club={club} size={22} />
            </button>
            <button
              onClick={() => onRemoveQuickFilter(club.id)}
              aria-label={`${club.name} aus Quick-Filtern entfernen`}
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                width: '15px',
                height: '15px',
                borderRadius: '50%',
                background: theme.surfaceRaised,
                border: `1px solid ${theme.border}`,
                color: theme.textMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <X size={9} />
            </button>
          </div>
        );
      })}

      {!showAdd ? (
        availableToAdd.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            aria-label="Quick-Filter hinzufügen"
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
            Verein wählen…
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
