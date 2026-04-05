'use client';

import { useEffect, useState, useRef } from 'react';
function MegaphoneIcon() {
  return (
    <svg className="h-4 w-4 text-cyan-300/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

interface NewsMessage {
  id: string;
  text: string;
  active: boolean;
}

interface NewsBannerData {
  enabled: boolean;
  messages: NewsMessage[];
}

const FALLBACK: NewsBannerData = {
  enabled: true,
  messages: [
    { id: '1', text: 'Neu im Shop: GoPro Hero 13 Black', active: true },
    { id: '2', text: 'Jetzt Sets buchen und sparen', active: true },
    { id: '3', text: 'Kostenloser Standardversand ab 50 \u20ac Bestellwert', active: true },
  ],
};

export default function NewsBanner() {
  const [data, setData] = useState<NewsBannerData | null>(null);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [animDuration, setAnimDuration] = useState(20);

  useEffect(() => {
    fetch('/api/shop-content?section=news_banner')
      .then((res) => (res.ok ? res.json() : FALLBACK))
      .then((d: NewsBannerData) => setData(d))
      .catch(() => setData(FALLBACK));
  }, []);

  // Calculate animation duration based on content width so speed is ~45px/sec
  useEffect(() => {
    if (trackRef.current) {
      const halfWidth = trackRef.current.scrollWidth / 2;
      const speed = 45; // px per second
      setAnimDuration(Math.max(10, halfWidth / speed));
    }
  }, [data]);

  if (!data || !data.enabled) return null;

  const activeMessages = data.messages.filter((m) => m.active);
  if (activeMessages.length === 0) return null;

  const separator = ' \u00b7 ';
  const text = activeMessages.map((m) => m.text).join(separator) + separator;

  return (
    <div
      className="relative w-full overflow-hidden bg-[#1e293b]"
      style={{ height: 38 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      role="marquee"
      aria-label="Neuigkeiten"
    >
      {/* Fixed icon on the left */}
      <div className="absolute left-0 top-0 z-10 flex h-full w-10 items-center justify-center bg-[#1e293b]">
        <MegaphoneIcon />
      </div>

      {/* Scrolling track */}
      <div
        ref={trackRef}
        className="news-banner-track flex h-full items-center whitespace-nowrap pl-10"
        style={{
          animationDuration: `${animDuration}s`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      >
        {/* Duplicate content for seamless loop */}
        <span className="inline-block text-sm text-[#94a3b8]">{text}</span>
        <span className="inline-block text-sm text-[#94a3b8]">{text}</span>
      </div>

      <style jsx>{`
        @keyframes news-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .news-banner-track {
          animation-name: news-scroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
      `}</style>
    </div>
  );
}
