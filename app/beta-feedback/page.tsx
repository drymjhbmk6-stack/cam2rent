'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

// ─── Sektionen ───────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'first_impression',
    title: 'Erster Eindruck',
    icon: '👁️',
    subtitle: 'Wie wirkt die Seite auf dich?',
    questions: [
      { id: 'q_design', type: 'stars' as const, label: 'Wie gefällt dir das Design insgesamt?' },
      { id: 'q_trust', type: 'stars' as const, label: 'Wie vertrauenswürdig wirkt die Seite auf dich?' },
      { id: 'q_first_feeling', type: 'choice' as const, label: 'Was war dein erster Gedanke beim Öffnen?', options: ['Sieht professionell aus', 'Modern und ansprechend', 'Übersichtlich und klar', 'Etwas unübersichtlich', 'Wusste nicht, wo ich anfangen soll'], multi: false },
    ],
  },
  {
    id: 'navigation',
    title: 'Navigation & Bedienung',
    icon: '🧭',
    subtitle: 'Findest du dich zurecht?',
    questions: [
      { id: 'q_nav_ease', type: 'stars' as const, label: 'Wie einfach war es, sich auf der Seite zurechtzufinden?' },
      { id: 'q_mobile', type: 'choice' as const, label: 'Auf welchem Gerät testest du hauptsächlich?', options: ['Smartphone', 'Tablet', 'Laptop/PC'], multi: false },
      { id: 'q_nav_issues', type: 'text' as const, label: 'Gab es Stellen, wo du nicht weiterwusstest?', placeholder: 'z.B. Button ging nicht, Seite hat nicht geladen...' },
    ],
  },
  {
    id: 'booking',
    title: 'Buchungsprozess',
    icon: '📅',
    subtitle: 'Vom Produkt bis zur Buchung',
    questions: [
      { id: 'q_product_info', type: 'stars' as const, label: 'Waren die Produktinfos ausreichend und verständlich?' },
      { id: 'q_booking_ease', type: 'stars' as const, label: 'Wie einfach war der Buchungsvorgang?' },
      { id: 'q_pricing', type: 'choice' as const, label: 'Wie empfindest du die Preise?', options: ['Sehr fair / günstig', 'Angemessen', 'Etwas teuer', 'Zu teuer', 'Kann ich nicht einschätzen'], multi: false },
      { id: 'q_booking_blocker', type: 'text' as const, label: 'Was würde dich davon abhalten, hier zu buchen?', placeholder: 'Sei ehrlich — jedes Feedback hilft uns!' },
    ],
  },
  {
    id: 'content',
    title: 'Inhalte & Texte',
    icon: '✏️',
    subtitle: 'Verstehst du alles?',
    questions: [
      { id: 'q_texts', type: 'stars' as const, label: 'Sind die Texte verständlich und hilfreich?' },
      { id: 'q_missing_info', type: 'choice' as const, label: 'Hat dir irgendeine Information gefehlt?', options: ['Nein, alles klar', 'FAQ / Häufige Fragen', 'Versandinfos', 'Rückgabe-Prozess', 'Mehr Produktdetails', 'Erfahrungsberichte'], multi: true },
    ],
  },
  {
    id: 'overall',
    title: 'Gesamteindruck',
    icon: '⭐',
    subtitle: 'Dein Fazit',
    questions: [
      { id: 'q_recommend', type: 'nps' as const, label: 'Wie wahrscheinlich würdest du cam2rent an Freunde weiterempfehlen?' },
      { id: 'q_best', type: 'text' as const, label: 'Was gefällt dir am besten an cam2rent?', placeholder: 'Das Beste zuerst...' },
      { id: 'q_worst', type: 'text' as const, label: 'Was sollten wir unbedingt verbessern?', placeholder: 'Deine ehrliche Meinung zählt am meisten!' },
      { id: 'q_idea', type: 'text' as const, label: 'Hast du eine Idee oder einen Wunsch?', placeholder: 'Optional — aber wir freuen uns über jeden Input!', optional: true },
    ],
  },
];

// ─── Komponenten ─────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const labels = ['', 'Schlecht', 'Geht so', 'Okay', 'Gut', 'Super!'];
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)} onMouseLeave={() => setHover(0)}
          className={`text-3xl transition-all ${star <= (hover || value) ? 'text-accent-blue scale-110' : 'text-brand-border dark:text-gray-600'}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
          ★
        </button>
      ))}
      <span className="text-xs text-brand-muted ml-2 italic min-w-[50px]">{labels[hover || value] || ''}</span>
    </div>
  );
}

function NPSRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex gap-1 flex-wrap justify-center mb-2">
        {[0,1,2,3,4,5,6,7,8,9,10].map((n) => {
          const sel = value === n;
          const color = sel ? (n <= 6 ? 'bg-status-error' : n <= 8 ? 'bg-accent-amber' : 'bg-accent-blue') : 'bg-brand-bg dark:bg-gray-800';
          return (
            <button key={n} type="button" onClick={() => onChange(n)}
              className={`w-9 h-9 rounded-lg text-sm font-heading font-semibold transition-all ${color} ${sel ? 'text-white ring-2 ring-offset-1 ring-accent-blue scale-105' : 'text-brand-muted border border-brand-border dark:border-gray-700'}`}>
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-brand-muted px-1">
        <span>Unwahrscheinlich</span>
        <span>Sehr wahrscheinlich</span>
      </div>
    </div>
  );
}

function ChoiceSelect({ options, value, onChange, multi }: { options: string[]; value: unknown; onChange: (v: unknown) => void; multi: boolean }) {
  const selected = value || (multi ? [] : null);
  const toggle = (opt: string) => {
    if (multi) {
      const arr = Array.isArray(selected) ? selected : [];
      onChange(arr.includes(opt) ? arr.filter((x: string) => x !== opt) : [...arr, opt]);
    } else {
      onChange(opt === selected ? null : opt);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = multi ? (Array.isArray(selected) && selected.includes(opt)) : selected === opt;
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`px-4 py-2 rounded-full text-sm font-body transition-all ${isActive ? 'bg-accent-blue/15 text-accent-blue border-2 border-accent-blue font-semibold' : 'bg-brand-bg dark:bg-gray-800 text-brand-steel dark:text-gray-400 border border-brand-border dark:border-gray-700'}`}>
            {multi && isActive && '✓ '}{opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────────

export default function BetaFeedbackPage() {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testerName, setTesterName] = useState('');
  const [testerEmail, setTesterEmail] = useState('');
  const [wantsGutschein, setWantsGutschein] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const totalSections = SECTIONS.length;
  const currentSection = SECTIONS[step];
  const isLastStep = step === totalSections - 1;

  const setAnswer = (qid: string, val: unknown) => setAnswers((prev) => ({ ...prev, [qid]: val }));

  const goNext = () => {
    if (step < totalSections - 1) setStep(step + 1);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await fetch('/api/beta-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testerName, testerEmail, wantsGutschein, answers,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        }),
      });
    } catch {}
    setSubmitted(true);
    setSubmitting(false);
  };

  const pct = Math.round(((step + 1) / totalSections) * 100);

  // ── Intro ──
  if (!started) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center animate-fade-in">
          <div className="text-5xl mb-4">🎬</div>
          <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-1">
            cam<span className="text-accent-blue">2</span>rent
          </h1>
          <p className="text-xs font-heading font-semibold text-accent-blue uppercase tracking-[3px] mb-6">Beta-Test Feedback</p>

          <div className="bg-white dark:bg-brand-dark rounded-card shadow-card p-6 text-left mb-6">
            <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-4 leading-relaxed">
              Hey! Danke, dass du dir die Zeit nimmst, unsere Kamera-Verleih-Plattform zu testen.
              Dein Feedback ist uns mega wichtig!
            </p>
            <div className="space-y-3 text-sm text-brand-steel dark:text-gray-400">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-accent-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">⏱</span>
                <span>Dauert nur <strong className="text-brand-black dark:text-white">3–5 Minuten</strong></span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-accent-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">5</span>
                <span><strong className="text-brand-black dark:text-white">5 kurze Abschnitte</strong> mit schnellen Bewertungen</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-accent-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">🎁</span>
                <span><strong className="text-accent-blue">10% Gutschein</strong> als Dankeschoen</span>
              </div>
            </div>
          </div>

          <button onClick={() => setStarted(true)}
            className="px-8 py-3.5 bg-accent-blue text-white font-heading font-semibold text-base rounded-btn hover:bg-blue-700 transition-colors shadow-lg shadow-accent-blue/30">
            Los geht&apos;s! →
          </button>
        </div>
      </div>
    );
  }

  // ── Danke ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-brand-bg dark:bg-brand-black flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center animate-fade-in">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="font-heading font-bold text-2xl text-brand-black dark:text-white mb-2">
            Vielen Dank{testerName ? `, ${testerName}` : ''}!
          </h1>
          <p className="font-body text-sm text-brand-steel dark:text-gray-400 mb-8">
            Dein Feedback hilft uns enorm, cam2rent noch besser zu machen.
          </p>
          {wantsGutschein && testerEmail && (
            <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-card p-6 mb-6">
              <p className="text-xs font-heading font-semibold text-accent-blue uppercase tracking-wider mb-3">Dein Gutscheincode</p>
              <div className="bg-white dark:bg-brand-black rounded-xl py-3 px-5 font-mono text-2xl font-bold text-accent-blue tracking-widest mb-2">
                BETA10
              </div>
              <p className="text-xs text-brand-muted">10% Rabatt auf deine erste Buchung</p>
            </div>
          )}
          <Link href="/" className="text-sm font-body text-accent-blue hover:underline">
            Zurueck zur Startseite
          </Link>
        </div>
      </div>
    );
  }

  // ── Survey ──
  return (
    <div ref={topRef} className="min-h-screen bg-brand-bg dark:bg-brand-black py-6 px-4 pb-24">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-4">
          <span className="font-heading font-bold text-sm text-brand-black dark:text-white">cam<span className="text-accent-blue">2</span>rent</span>
          <span className="text-brand-muted text-sm ml-2">Beta-Feedback</span>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-brand-muted mb-1.5">
            <span>Abschnitt {step + 1} von {totalSections}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 bg-brand-border dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-accent-blue rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Section */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-2xl">{currentSection.icon}</span>
            <h2 className="font-heading font-bold text-lg text-brand-black dark:text-white">{currentSection.title}</h2>
          </div>
          <p className="text-sm text-brand-muted ml-9">{currentSection.subtitle}</p>
        </div>

        {/* Questions */}
        <div className="space-y-5">
          {currentSection.questions.map((q) => (
            <div key={q.id} className="bg-white dark:bg-brand-dark rounded-card shadow-card p-5 border border-brand-border/40 dark:border-white/5">
              <label className="block text-sm font-heading font-semibold text-brand-black dark:text-white mb-3 leading-snug">
                {q.label}
                {'optional' in q && q.optional && <span className="text-brand-muted font-normal text-xs ml-1">(optional)</span>}
              </label>
              {q.type === 'stars' && <StarRating value={(answers[q.id] as number) || 0} onChange={(v) => setAnswer(q.id, v)} />}
              {q.type === 'nps' && <NPSRating value={(answers[q.id] as number) ?? null} onChange={(v) => setAnswer(q.id, v)} />}
              {q.type === 'choice' && 'options' in q && <ChoiceSelect options={q.options!} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} multi={'multi' in q && !!q.multi} />}
              {q.type === 'text' && (
                <textarea value={(answers[q.id] as string) || ''} onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder={'placeholder' in q ? q.placeholder : ''} rows={3}
                  className="w-full px-4 py-3 rounded-[10px] border border-brand-border dark:border-white/10 bg-brand-bg dark:bg-brand-black text-brand-black dark:text-white text-sm font-body placeholder-brand-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              )}
            </div>
          ))}
        </div>

        {/* Gutschein (letzter Step) */}
        {isLastStep && (
          <div className="mt-6 bg-accent-blue/5 dark:bg-accent-blue/10 border border-accent-blue/20 rounded-card p-5">
            <p className="font-heading font-bold text-sm text-accent-blue mb-1">🎁 Moechtest du einen 10% Gutschein?</p>
            <p className="text-xs text-brand-muted mb-4">Als Dankeschoen fuer dein Feedback.</p>
            <div className="flex gap-3 mb-4">
              <button type="button" onClick={() => setWantsGutschein(true)}
                className={`px-4 py-2 rounded-btn text-sm font-heading font-semibold transition-all ${wantsGutschein ? 'bg-accent-blue/20 text-accent-blue border-2 border-accent-blue' : 'bg-brand-bg dark:bg-gray-800 text-brand-muted border border-brand-border dark:border-gray-700'}`}>
                Ja, gerne!
              </button>
              <button type="button" onClick={() => setWantsGutschein(false)}
                className="px-4 py-2 rounded-btn text-sm font-heading text-brand-muted bg-brand-bg dark:bg-gray-800 border border-brand-border dark:border-gray-700">
                Nein, danke
              </button>
            </div>
            {wantsGutschein && (
              <div className="space-y-3">
                <input type="text" value={testerName} onChange={(e) => setTesterName(e.target.value)} placeholder="Dein Vorname"
                  className="w-full px-4 py-2.5 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-brand-black dark:text-white text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
                <input type="email" value={testerEmail} onChange={(e) => setTesterEmail(e.target.value)} placeholder="Deine E-Mail (fuer den Gutschein)"
                  className="w-full px-4 py-2.5 rounded-[10px] border border-brand-border dark:border-white/10 bg-white dark:bg-brand-black text-brand-black dark:text-white text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent-blue" />
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 gap-3">
          {step > 0 ? (
            <button onClick={goBack} className="px-5 py-3 rounded-btn text-sm font-heading font-semibold text-brand-muted border border-brand-border dark:border-gray-700 hover:bg-brand-bg dark:hover:bg-gray-800 transition-colors">
              ← Zurueck
            </button>
          ) : <div />}
          {isLastStep ? (
            <button onClick={handleSubmit} disabled={submitting}
              className="px-8 py-3 rounded-btn text-sm font-heading font-semibold bg-accent-blue text-white hover:bg-blue-700 transition-colors shadow-lg shadow-accent-blue/30 disabled:opacity-50">
              {submitting ? 'Wird gesendet...' : 'Feedback absenden ✓'}
            </button>
          ) : (
            <button onClick={goNext}
              className="px-8 py-3 rounded-btn text-sm font-heading font-semibold bg-accent-blue text-white hover:bg-blue-700 transition-colors shadow-lg shadow-accent-blue/30">
              Weiter →
            </button>
          )}
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-6">
          {SECTIONS.map((_, i) => (
            <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-accent-blue' : i < step ? 'w-2 bg-accent-teal' : 'w-2 bg-brand-border dark:bg-gray-700'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
