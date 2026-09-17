import { useState } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { relativeTime } from '../lib/relativeTime.js';

// Same card anatomy as TransferCard.jsx (source/time header row, headline,
// footer with source + action) so the two tabs read as one family, per
// explicit request -- swaps TransferCard's official/rumor pill + from->to
// club arrow (nothing to show here, a news story has no "direction") for a
// thumbnail, and swaps "View profile" for a direct "Read" link since
// there's no player to open a profile for.
//
// Headline shows the AI-translated title (title_<lang>), not the raw
// original-language `title` -- confirmed-live user feedback: showing the
// original headline above an already-translated AI summary read as
// inconsistent. Falls back to the original when a translation is missing
// (rows from before this feature, or a failed LLM call). The original-
// language teaser that used to sit under the headline was dropped for the
// same reason -- it always undermined the "everything here is in your
// language" promise the translated headline now makes; the source link
// still reaches the untranslated original.
export default function NewsCard({ theme, t, language, article, onOpenSummary }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasSummary = Boolean(article[`ai_summary_${language}`]);
  const title = article[`title_${language}`] ?? article.title;

  return (
    <div style={{ background: theme.surfaceRaised, borderRadius: '12px', padding: '12px 14px', border: `1px solid ${theme.border}`, display: 'flex', gap: '10px' }}>
      {article.image_url && !imageFailed ? (
        <img
          src={article.image_url}
          alt=""
          onError={() => setImageFailed(true)}
          style={{ width: '58px', height: '58px', borderRadius: '9px', objectFit: 'cover', flex: '0 0 auto', background: theme.border }}
        />
      ) : (
        <div style={{ width: '58px', height: '58px', borderRadius: '9px', flex: '0 0 auto', background: theme.border }} />
      )}

      <div style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: theme.textMuted, fontWeight: 600 }}>
          <span style={{ color: theme.text }}>{article.source}</span>
          <span style={{ width: '2px', height: '2px', borderRadius: '50%', background: theme.textMuted }} />
          <span>{relativeTime(article.published_at, t)}</span>
        </div>

        <p
          style={{
            fontSize: '13.5px',
            fontWeight: 700,
            lineHeight: 1.3,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
          {hasSummary && (
            <button
              onClick={() => onOpenSummary?.(article)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 700,
                color: theme.accent,
                background: `${theme.accent}24`,
                border: 'none',
                borderRadius: '999px',
                padding: '4px 9px 4px 7px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Sparkles size={12} /> AI Summary
            </button>
          )}
          <a
            href={article.source_url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 700,
              color: theme.textMuted,
              background: theme.border,
              border: 'none',
              borderRadius: '999px',
              padding: '4px 9px 4px 7px',
              textDecoration: 'none',
            }}
          >
            <ExternalLink size={12} /> {t.transfers.readOriginal}
          </a>
        </div>
      </div>
    </div>
  );
}
