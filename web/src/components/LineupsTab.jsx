import { Users, Bell } from 'lucide-react';
import { leagueBySlug } from '../lib/leagues.js';

// Placeholder -- the lineups tab's content is explicitly unspecified in the
// project briefing (sourcing, format, etc. still need to be defined). The
// backend has a `lineups` table ready (fixture + club + confirmed flag) but
// nothing populates it yet, see backend README "Not yet built".
export default function LineupsTab({ theme, league }) {
  const currentLeague = leagueBySlug(league);
  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '60px 24px', textAlign: 'center', boxSizing: 'border-box' }}>
      <Users size={28} style={{ color: theme.textMuted, marginBottom: '10px' }} />
      <p style={{ fontSize: '14px', color: theme.textMuted, margin: 0 }}>
        Voraussichtliche Aufstellungen für {currentLeague?.label} folgen hier, sobald angebunden.
      </p>
      <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
        <Bell size={12} /> Push bei bestätigter Aufstellung
      </p>
    </div>
  );
}
