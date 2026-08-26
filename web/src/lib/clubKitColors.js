// Real home-kit colors AND pattern for every club currently synced into the
// `clubs` table -- not just "2 colors" but how those colors actually appear
// on the shirt (Real Madrid is plain white, Inter is black+blue VERTICAL
// STRIPES, Monaco has a diagonal sash, PSG has a central vertical band,
// Lens/Lorient are horizontal hoops). A flat primary/secondary pair alone
// can't distinguish "Juventus" (stripes) from "Roma" (solid maroon) even
// though both are just "2 colors" -- confirmed via research this pass that
// several clubs previously modeled here as solid are actually striped
// (Deportivo La Coruña, Real Betis) and a few had primary/secondary swapped
// relative to the real dominant shirt color (e.g. Monza/Parma/RB Leipzig/
// Hamburger SV/VfB Stuttgart are white-bodied with a colored trim, not the
// other way round). `pattern` is one of:
//   'solid'   -- single dominant body color (secondary used as trim/border only)
//   'stripes' -- alternating vertical stripes, primary first and last
//   'hoops'   -- alternating horizontal stripes, primary first and last
//   'sash'    -- diagonal band of secondary across a primary body
//   'band'    -- single vertical secondary stripe down the center of a primary body
//   'quarters'-- diagonally-alternating quadrants (top-left/bottom-right
//               primary, the other two secondary), e.g. Cagliari
//   'chestband' -- horizontal secondary band across the chest, e.g. VfB
//               Stuttgart's century-old red "Brustring" on white -- a
//               genuine multi-decade identity element, not a one-season
//               kit gimmick, even though it isn't a stripe or sash shape
//   'cross'   -- a plus-shaped cross through the center, e.g. Parma's
//               "Maglia Crociata" (the club's shirt nickname since 1913)
// Keyed by the exact `clubs.name` string as synced from football-data.org
// (see src/football-api/syncClubs.js), which is why this lives as data
// rather than a lookup on club id -- id is a Supabase-assigned serial, not
// something to hand-map, but name is the same stable string every sync.
// Any club not in this map (a newly promoted side football-data.org adds
// before this list is updated, say) falls back to the old deterministic
// hashed color in clubColor.js -- graceful, not a build/runtime error.
export const CLUB_KIT_COLORS = {
  // Serie A
  'AC Milan': { primary: '#FB090B', secondary: '#000000', pattern: 'stripes' },
  'AC Monza': { primary: '#C8102E', secondary: '#FFFFFF', pattern: 'solid' },
  'ACF Fiorentina': { primary: '#5B2A86', secondary: '#FFFFFF', pattern: 'solid' },
  'AS Roma': { primary: '#8E1F2F', secondary: '#F0BC42', pattern: 'solid' },
  'Atalanta BC': { primary: '#000000', secondary: '#1E4FA3', pattern: 'stripes' },
  'Bologna FC 1909': { primary: '#8E1B2A', secondary: '#1B3E8E', pattern: 'stripes' },
  'Cagliari Calcio': { primary: '#B71234', secondary: '#00205B', pattern: 'quarters' },
  'Como 1907': { primary: '#1B6FC9', secondary: '#FFFFFF', pattern: 'solid' },
  'FC Internazionale Milano': { primary: '#010E80', secondary: '#000000', pattern: 'stripes' },
  'Frosinone Calcio': { primary: '#FFD200', secondary: '#1B3E8E', pattern: 'solid' },
  'Genoa CFC': { primary: '#B0182E', secondary: '#002A5C', pattern: 'stripes' },
  'Juventus FC': { primary: '#000000', secondary: '#FFFFFF', pattern: 'stripes' },
  'Parma Calcio 1913': { primary: '#FFFFFF', secondary: '#000000', pattern: 'cross' },
  'SS Lazio': { primary: '#87D8F7', secondary: '#FFFFFF', pattern: 'solid' },
  'SSC Napoli': { primary: '#12A0D7', secondary: '#FFFFFF', pattern: 'solid' },
  'Torino FC': { primary: '#7B1E3A', secondary: '#FFFFFF', pattern: 'solid' },
  'Udinese Calcio': { primary: '#000000', secondary: '#FFFFFF', pattern: 'stripes' },
  'US Lecce': { primary: '#FFD200', secondary: '#C8102E', pattern: 'stripes' },
  'US Sassuolo Calcio': { primary: '#00A651', secondary: '#000000', pattern: 'stripes' },
  'Venezia FC': { primary: '#000000', secondary: '#FF6600', pattern: 'stripes' },

  // Bundesliga
  '1. FC Köln': { primary: '#FFFFFF', secondary: '#ED1C24', pattern: 'solid' },
  '1. FC Union Berlin': { primary: '#EB1923', secondary: '#FFFFFF', pattern: 'solid' },
  '1. FSV Mainz 05': { primary: '#C3141E', secondary: '#FFFFFF', pattern: 'solid' },
  'Bayer 04 Leverkusen': { primary: '#E32219', secondary: '#000000', pattern: 'solid' },
  'Borussia Dortmund': { primary: '#FDE100', secondary: '#000000', pattern: 'solid' },
  'Borussia Mönchengladbach': { primary: '#FFFFFF', secondary: '#000000', pattern: 'solid' },
  'Eintracht Frankfurt': { primary: '#000000', secondary: '#E1000F', pattern: 'stripes' },
  'FC Augsburg': { primary: '#FFFFFF', secondary: '#E1000F', pattern: 'sash' },
  'FC Bayern München': { primary: '#DC052D', secondary: '#FFFFFF', pattern: 'solid' },
  'FC Schalke 04': { primary: '#004D9D', secondary: '#FFFFFF', pattern: 'solid' },
  'Hamburger SV': { primary: '#FFFFFF', secondary: '#00458C', pattern: 'solid' },
  'RB Leipzig': { primary: '#FFFFFF', secondary: '#DD0741', pattern: 'stripes' },
  'SC Freiburg': { primary: '#EB0016', secondary: '#FFFFFF', pattern: 'stripes' },
  'SC Paderborn 07': { primary: '#001D70', secondary: '#000000', pattern: 'solid' },
  'SV 07 Elversberg': { primary: '#FFFFFF', secondary: '#000000', pattern: 'stripes' },
  'SV Werder Bremen': { primary: '#009036', secondary: '#FFFFFF', pattern: 'stripes' },
  'TSG 1899 Hoffenheim': { primary: '#1961B5', secondary: '#FFFFFF', pattern: 'solid' },
  'VfB Stuttgart': { primary: '#FFFFFF', secondary: '#E32219', pattern: 'chestband' },

  // Premier League
  'AFC Bournemouth': { primary: '#DA020E', secondary: '#000000', pattern: 'stripes' },
  'Arsenal FC': { primary: '#EF0107', secondary: '#FFFFFF', pattern: 'solid' },
  'Aston Villa FC': { primary: '#670E36', secondary: '#95BFE5', pattern: 'solid' },
  'Brentford FC': { primary: '#E30613', secondary: '#FFFFFF', pattern: 'stripes' },
  'Brighton & Hove Albion FC': { primary: '#0057B8', secondary: '#FFFFFF', pattern: 'stripes' },
  'Chelsea FC': { primary: '#034694', secondary: '#FFFFFF', pattern: 'solid' },
  'Coventry City FC': { primary: '#78D0F1', secondary: '#FFFFFF', pattern: 'solid' },
  'Crystal Palace FC': { primary: '#1B458F', secondary: '#C4122E', pattern: 'stripes' },
  'Everton FC': { primary: '#003399', secondary: '#FFFFFF', pattern: 'solid' },
  'Fulham FC': { primary: '#FFFFFF', secondary: '#000000', pattern: 'solid' },
  'Hull City AFC': { primary: '#F18A00', secondary: '#000000', pattern: 'stripes' },
  'Ipswich Town FC': { primary: '#0044A9', secondary: '#FFFFFF', pattern: 'solid' },
  'Leeds United FC': { primary: '#FFFFFF', secondary: '#1D428A', pattern: 'solid' },
  'Liverpool FC': { primary: '#C8102E', secondary: '#FFFFFF', pattern: 'solid' },
  'Manchester City FC': { primary: '#6CABDD', secondary: '#1C2C5B', pattern: 'solid' },
  'Manchester United FC': { primary: '#DA291C', secondary: '#000000', pattern: 'solid' },
  'Newcastle United FC': { primary: '#241F20', secondary: '#FFFFFF', pattern: 'stripes' },
  'Nottingham Forest FC': { primary: '#DD0000', secondary: '#FFFFFF', pattern: 'solid' },
  'Sunderland AFC': { primary: '#EB172B', secondary: '#FFFFFF', pattern: 'stripes' },
  'Tottenham Hotspur FC': { primary: '#FFFFFF', secondary: '#132257', pattern: 'solid' },

  // Ligue 1
  'AJ Auxerre': { primary: '#FFFFFF', secondary: '#003DA5', pattern: 'solid' },
  'Angers SCO': { primary: '#000000', secondary: '#FFFFFF', pattern: 'stripes' },
  'AS Monaco FC': { primary: '#E4032E', secondary: '#FFFFFF', pattern: 'sash' },
  'ES Troyes AC': { primary: '#0033A0', secondary: '#F58220', pattern: 'solid' },
  'FC Lorient': { primary: '#FF6600', secondary: '#000000', pattern: 'stripes' },
  'Le Havre AC': { primary: '#4FA8DA', secondary: '#002654', pattern: 'stripes' },
  'Le Mans FC': { primary: '#BE081A', secondary: '#F1C100', pattern: 'stripes' },
  'Lille OSC': { primary: '#E2001A', secondary: '#002654', pattern: 'sash' },
  'OGC Nice': { primary: '#CC092F', secondary: '#000000', pattern: 'stripes' },
  'Olympique de Marseille': { primary: '#FFFFFF', secondary: '#2FAEE0', pattern: 'solid' },
  'Olympique Lyonnais': { primary: '#FFFFFF', secondary: '#003DA5', pattern: 'solid' },
  'Paris FC': { primary: '#002D62', secondary: '#6CACE4', pattern: 'stripes' },
  'Paris Saint-Germain FC': { primary: '#004170', secondary: '#DA291C', pattern: 'band' },
  'Racing Club de Lens': { primary: '#E2001A', secondary: '#FFD100', pattern: 'hoops' },
  'RC Strasbourg Alsace': { primary: '#0072CE', secondary: '#FFFFFF', pattern: 'solid' },
  'Stade Brestois 29': { primary: '#E2001A', secondary: '#FFFFFF', pattern: 'solid' },
  'Stade Rennais FC 1901': { primary: '#E2001A', secondary: '#000000', pattern: 'stripes' },
  'Toulouse FC': { primary: '#6B2C91', secondary: '#FFFFFF', pattern: 'solid' },

  // LaLiga
  'Athletic Club': { primary: '#EE2523', secondary: '#FFFFFF', pattern: 'stripes' },
  'CA Osasuna': { primary: '#D2122E', secondary: '#001A70', pattern: 'solid' },
  'Club Atlético de Madrid': { primary: '#CB3524', secondary: '#FFFFFF', pattern: 'stripes' },
  'Deportivo Alavés': { primary: '#0055A4', secondary: '#FFFFFF', pattern: 'stripes' },
  'Elche CF': { primary: '#00843D', secondary: '#FFFFFF', pattern: 'stripes' },
  'FC Barcelona': { primary: '#004D98', secondary: '#A50044', pattern: 'stripes' },
  'Getafe CF': { primary: '#005CA9', secondary: '#FFFFFF', pattern: 'solid' },
  'Levante UD': { primary: '#0F4C9A', secondary: '#C8102E', pattern: 'stripes' },
  'Málaga CF': { primary: '#1E5EA8', secondary: '#FFFFFF', pattern: 'stripes' },
  'Rayo Vallecano de Madrid': { primary: '#FFFFFF', secondary: '#C8102E', pattern: 'sash' },
  'RC Celta de Vigo': { primary: '#8AC7EA', secondary: '#FFFFFF', pattern: 'solid' },
  'RC Deportivo La Coruña': { primary: '#0055A4', secondary: '#FFFFFF', pattern: 'stripes' },
  'RCD Espanyol de Barcelona': { primary: '#0A4C99', secondary: '#FFFFFF', pattern: 'stripes' },
  'Real Betis Balompié': { primary: '#00954C', secondary: '#FFFFFF', pattern: 'stripes' },
  'Real Madrid CF': { primary: '#FFFFFF', secondary: '#FEBE10', pattern: 'solid' },
  'Real Racing Club de Santander': { primary: '#007A3D', secondary: '#FFFFFF', pattern: 'stripes' },
  'Real Sociedad de Fútbol': { primary: '#0058A8', secondary: '#FFFFFF', pattern: 'stripes' },
  'Sevilla FC': { primary: '#FFFFFF', secondary: '#D0021B', pattern: 'solid' },
  'Valencia CF': { primary: '#FFFFFF', secondary: '#000000', pattern: 'solid' },
  'Villarreal CF': { primary: '#FFE667', secondary: '#005CA9', pattern: 'solid' },
};
