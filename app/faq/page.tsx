import type { Metadata } from 'next';
import FaqContent from './FaqContent';

export const metadata: Metadata = {
  title: 'FAQ – Häufige Fragen',
  description:
    'Häufig gestellte Fragen rund um Buchung, Versand, Rückgabe, Kaution und Zahlung bei Cam2Rent.',
};

export default function FAQPage() {
  return <FaqContent />;
}
