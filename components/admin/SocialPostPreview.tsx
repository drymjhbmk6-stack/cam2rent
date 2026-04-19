'use client';

/**
 * SocialPostPreview — zeigt einen Post im Facebook- und Instagram-Look.
 *
 * Verwendet Dark-Mode-Varianten der echten Plattform-Layouts, damit
 * der Admin sieht wie der Post bei den Nutzern aussehen wird.
 */

interface Props {
  caption: string;
  hashtags?: string[];
  imageUrl?: string;
  linkUrl?: string;
  fbAccountName?: string;
  igAccountName?: string;
  igAccountUsername?: string;
  platforms?: string[];
}

export default function SocialPostPreview(props: Props) {
  const { platforms = ['facebook', 'instagram'] } = props;
  const showFb = platforms.includes('facebook');
  const showIg = platforms.includes('instagram');

  if (!showFb && !showIg) {
    return (
      <div className="rounded-xl bg-slate-900/30 border border-slate-800 p-6 text-sm text-slate-500 text-center">
        Keine Plattform ausgewählt — Vorschau nicht verfügbar
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showFb && <FacebookPreview {...props} />}
      {showIg && <InstagramPreview {...props} />}
    </div>
  );
}

function buildFullCaption(caption: string, hashtags?: string[]): string {
  const parts = [caption.trim()];
  if (hashtags && hashtags.length > 0) {
    const tags = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    parts.push('');
    parts.push(tags);
  }
  return parts.join('\n');
}

function FacebookPreview({ caption, hashtags, imageUrl, linkUrl, fbAccountName }: Props) {
  const fullText = buildFullCaption(caption, hashtags);
  const shortText = fullText.length > 300 ? fullText.slice(0, 280) + '…' : fullText;

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[#1877F2] flex items-center justify-center text-white font-bold text-[10px]">f</span>
        Facebook-Vorschau
      </p>
      <div className="rounded-lg overflow-hidden border border-slate-700" style={{ background: '#242526', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        {/* Header */}
        <div className="flex items-center gap-3 p-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
            {(fbAccountName ?? 'C').charAt(0)}
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-sm leading-tight">{fbAccountName ?? 'Cam2Rent'}</p>
            <p className="text-xs text-slate-400 leading-tight">Gerade eben · <span>🌍</span></p>
          </div>
          <span className="text-slate-400 text-xl leading-none">⋯</span>
        </div>

        {/* Caption */}
        {caption && (
          <div className="px-3 pb-3">
            <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">{shortText}</p>
            {fullText.length > 300 && <button className="text-sm text-slate-400 mt-1">Mehr anzeigen</button>}
          </div>
        )}

        {/* Bild */}
        {imageUrl && (
          <div className="bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="w-full max-h-[400px] object-cover" />
          </div>
        )}

        {/* Link-Preview */}
        {linkUrl && !imageUrl && (
          <div className="border-t border-slate-700 px-3 py-2 bg-[#18191A]">
            <p className="text-xs text-slate-500 uppercase">{new URL(linkUrl).hostname}</p>
            <p className="text-sm text-slate-200 font-medium mt-0.5">{linkUrl}</p>
          </div>
        )}

        {/* Reaktionen */}
        <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-400 border-t border-slate-700">
          <span>👍❤️ 127</span>
          <span>12 Kommentare · 4 Geteilt</span>
        </div>

        {/* Action-Buttons */}
        <div className="grid grid-cols-3 border-t border-slate-700 text-sm text-slate-300">
          <button className="py-2 hover:bg-slate-800 flex items-center justify-center gap-1">👍 Gefällt mir</button>
          <button className="py-2 hover:bg-slate-800 flex items-center justify-center gap-1">💬 Kommentieren</button>
          <button className="py-2 hover:bg-slate-800 flex items-center justify-center gap-1">↗ Teilen</button>
        </div>
      </div>
    </div>
  );
}

function InstagramPreview({ caption, hashtags, imageUrl, igAccountName, igAccountUsername }: Props) {
  const fullText = buildFullCaption(caption, hashtags);
  const captionHead = caption.trim().slice(0, 100);
  const hasMore = fullText.length > 100;

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
        <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center text-white font-bold text-[10px]">IG</span>
        Instagram-Vorschau
      </p>
      <div className="rounded-lg overflow-hidden border border-slate-700" style={{ background: '#000', fontFamily: '-apple-system, Helvetica, Arial, sans-serif' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
            <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-white text-xs font-bold">
              {(igAccountName ?? 'C').charAt(0)}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-sm leading-tight">{igAccountUsername ?? 'cam2rent.de'}</p>
            <p className="text-[10px] text-slate-400 leading-tight">Deutschland</p>
          </div>
          <span className="text-white text-xl leading-none">⋯</span>
        </div>

        {/* Bild (quadratisch) */}
        <div className="aspect-square bg-slate-900 flex items-center justify-center">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-slate-500 text-sm px-6">
              <p className="text-4xl mb-2">📷</p>
              <p>Instagram verlangt ein Bild</p>
              <p className="text-xs mt-2 text-slate-600">Ohne Bild wird der Post nicht veröffentlicht</p>
            </div>
          )}
        </div>

        {/* Action-Icons */}
        <div className="flex items-center gap-4 px-3 py-2 text-white text-xl">
          <span>♡</span>
          <span>💬</span>
          <span>✈</span>
          <span className="ml-auto">🔖</span>
        </div>

        {/* Likes */}
        <div className="px-3 text-white text-sm font-semibold">
          Gefällt <span>1.247</span> Personen
        </div>

        {/* Caption */}
        {caption && (
          <div className="px-3 py-1 text-sm text-white">
            <span className="font-semibold mr-1">{igAccountUsername ?? 'cam2rent.de'}</span>
            <span className="whitespace-pre-wrap">{captionHead}</span>
            {hasMore && <button className="text-slate-400 ml-1">… mehr</button>}
          </div>
        )}

        {/* Hashtag-Block separat (bei IG meist als Kommentar, aber ok) */}
        {hashtags && hashtags.length > 0 && (
          <div className="px-3 pb-1 text-sm text-[#E0F1FF]">
            {hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
          </div>
        )}

        <div className="px-3 py-2 text-xs text-slate-500">Alle 12 Kommentare ansehen</div>
        <div className="px-3 pb-3 text-[10px] text-slate-500 uppercase tracking-wider">Gerade eben</div>
      </div>
    </div>
  );
}
