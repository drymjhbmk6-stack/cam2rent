import type { Metadata } from 'next';
import BlogOverview from './BlogOverview';

export const metadata: Metadata = {
  title: 'Blog | cam2rent – Action-Cam Verleih',
  description: 'Tipps, Vergleiche und Neuigkeiten rund um Action-Kameras. Erfahre alles über GoPro, DJI, Insta360 und mehr bei cam2rent.',
  openGraph: {
    title: 'Blog | cam2rent',
    description: 'Tipps, Vergleiche und Neuigkeiten rund um Action-Kameras.',
    type: 'website',
  },
};

export default function BlogPage() {
  return <BlogOverview />;
}
