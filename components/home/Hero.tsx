'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { isImageLeftMonth, type SeasonalImage } from '@/lib/seasonal-themes';

interface HeroData {
  ueberschrift: string;
  untertitel: string;
  cta_text: string;
  cta_link: string;
  is_active?: boolean;
}

const FALLBACK: HeroData = {
  ueberschrift: 'Action-Cams mieten statt kaufen',
  untertitel: 'Hochwertige Action-Kameras ab 9,90 €/Tag. Mit Haftungsschutz, schnell geliefert, flexibel.',
  cta_text: 'Kameras entdecken',
  cta_link: '/kameras',
};


export default function Hero({
  serverData,
  serverImage,
  serverMonth,
}: {
  serverData?: HeroData;
  serverImage?: SeasonalImage | null;
  serverMonth?: number;
}) {
  const [data, setData] = useState<HeroData>(serverData ?? FALLBACK);
  const [loaded, setLoaded] = useState(!!serverData);
  const [seasonalImage, setSeasonalImage] = useState<SeasonalImage | null>(serverImage ?? null);
  const [currentMonth, setCurrentMonth] = useState<number>(serverMonth ?? new Date().getMonth() + 1);

  useEffect(() => {
    // Nur Client-Fetch wenn keine Server-Daten vorhanden
    if (serverData) return;
    fetch('/api/shop-content?section=hero')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ueberschrift) {
          setData({
            ueberschrift: d.ueberschrift || FALLBACK.ueberschrift,
            untertitel: d.untertitel || FALLBACK.untertitel,
            cta_text: d.cta_text || FALLBACK.cta_text,
            cta_link: d.cta_link || FALLBACK.cta_link,
            is_active: d.is_active !== false,
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    // Saisonales Bild laden (nur wenn keine Server-Daten)
    if (serverImage !== undefined) return;
    fetch('/api/seasonal-images?zone=hero')
      .then((r) => r.json())
      .then((d) => {
        if (d.image) {
          setSeasonalImage(d.image);
          if (d.month) setCurrentMonth(d.month);
        }
      })
      .catch(() => {});
  }, []);

  // Nicht anzeigen wenn im Admin deaktiviert
  if (loaded && data.is_active === false) return null;

  // Ueberschrift in zwei Zeilen aufteilen (am letzten Leerzeichen)
  const words = data.ueberschrift.split(' ');
  const midPoint = Math.ceil(words.length / 2);
  const line1 = words.slice(0, midPoint).join(' ');
  const line2 = words.slice(midPoint).join(' ');

  const imageLeft = isImageLeftMonth(currentMonth);
  const hasImage = !!seasonalImage;

  // Text-Block
  const textBlock = (
    <div className={`relative z-10 ${hasImage ? 'flex flex-col justify-center' : ''}`}>
      <h1
        id="hero-heading"
        className="font-heading font-bold text-4xl sm:text-5xl lg:text-6xl leading-tight text-white mb-6 text-balance"
      >
        {line1}
        {line2 && (
          <>
            <br />
            <span className="text-white/90">{line2}</span>
          </>
        )}
      </h1>

      <p className="font-body text-lg sm:text-xl text-white/80 leading-relaxed mb-10 max-w-xl">
        {data.untertitel}
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href={data.cta_link}
          className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-brand-black font-heading font-semibold text-base rounded-[10px] hover:bg-blue-50 transition-colors shadow-lg shadow-black/10"
        >
          {data.cta_text}
        </Link>
        <Link
          href="/so-funktionierts"
          className="inline-flex items-center justify-center px-8 py-3.5 bg-transparent text-white font-heading font-semibold text-base rounded-[10px] border-2 border-white/50 hover:border-white hover:bg-white/10 transition-colors"
        >
          So funktioniert&apos;s
        </Link>
      </div>
    </div>
  );

  // Layout OHNE Bild: Original-Design
  if (!hasImage) {
    return (
      <section
        className="relative overflow-hidden bg-gradient-to-br from-accent-blue via-blue-600 to-blue-800 text-white"
        aria-labelledby="hero-heading"
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden="true"
        />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-black/10 blur-3xl" aria-hidden="true" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-32">
          <div className="max-w-3xl">
            {textBlock}
          </div>
        </div>
      </section>
    );
  }

  // Layout MIT Bild: Abwechselnd links/rechts
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-accent-blue via-blue-600 to-blue-800 text-white"
      aria-labelledby="hero-heading"
    >
      {/* Dot pattern overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        aria-hidden="true"
      />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-black/10 blur-3xl" aria-hidden="true" />

      {/* Desktop: Bild absolut positioniert, fuellt halbe Sektion */}
      <div className="relative">
        {/* Bild-Haelfte — auf Desktop absolut, fuellt die ganze Hoehe */}
        <div className={`hidden lg:block absolute inset-y-0 w-1/2 ${imageLeft ? 'left-0' : 'right-0'}`}>
          <Image
            src={seasonalImage.url}
            alt={seasonalImage.alt || 'Saisonales Bild'}
            fill
            className="object-cover"
            priority
            sizes="50vw"
          />
          {/* Gradient-Uebergang zum blauen Hintergrund */}
          <div className={`absolute inset-y-0 w-32 ${imageLeft ? 'right-0 bg-gradient-to-l' : 'left-0 bg-gradient-to-r'} from-blue-700/80 to-transparent`} />
          {seasonalImage.source === 'unsplash' && seasonalImage.photographer && (
            <div className={`absolute bottom-4 ${imageLeft ? 'left-4' : 'right-4'} px-2 py-1 rounded bg-black/50 backdrop-blur-sm`}>
              <span className="text-[10px] text-white/70 font-body">
                Foto: {seasonalImage.photographer}
              </span>
            </div>
          )}
        </div>

        {/* Mobile: Bild oben, volle Breite */}
        <div className="lg:hidden relative w-full h-56 sm:h-72">
          <Image
            src={seasonalImage.url}
            alt={seasonalImage.alt || 'Saisonales Bild'}
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-blue-700 to-transparent" />
          {seasonalImage.source === 'unsplash' && seasonalImage.photographer && (
            <div className="absolute bottom-2 right-3 px-2 py-1 rounded bg-black/50 backdrop-blur-sm">
              <span className="text-[10px] text-white/70 font-body">
                Foto: {seasonalImage.photographer}
              </span>
            </div>
          )}
        </div>

        {/* Text-Spalte */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-20 lg:py-28">
          <div className={`lg:w-1/2 ${imageLeft ? 'lg:ml-auto lg:pl-12' : 'lg:mr-auto lg:pr-12'}`}>
            {textBlock}
          </div>
        </div>
      </div>
    </section>
  );
}
