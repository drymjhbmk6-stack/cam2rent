export interface Product {
  id: string;
  name: string;
  brand: 'GoPro' | 'DJI' | 'Insta360';
  model: string;
  description: string;
  shortDescription: string;
  pricePerDay: number;
  pricePerWeekend: number;
  pricePerWeek: number;
  deposit: number;
  insurancePerDay: number;
  images: string[];
  specs: {
    resolution: string;
    fps: string;
    waterproof: string;
    battery: string;
    weight: string;
    storage: string;
  };
  category: string;
  tags: ('popular' | 'new' | 'deal')[];
  available: boolean;
  stock: number;
  slug: string;
}

export const products: Product[] = [
  {
    id: '1',
    name: 'GoPro Hero 13 Black',
    brand: 'GoPro',
    model: 'Hero 13',
    description:
      'Die neueste GoPro mit verbessertem Sensor, erweitertem Zubehör-Ökosystem und langer Akkulaufzeit. Perfekt für Sport, Reisen und Abenteuer.',
    shortDescription: '5.3K60, 27MP, wasserdicht bis 10m',
    pricePerDay: 12.9,
    pricePerWeekend: 29.9,
    pricePerWeek: 69.9,
    deposit: 150,
    insurancePerDay: 2.5,
    images: ['/images/gopro-hero13.png'],
    specs: {
      resolution: '5.3K',
      fps: '60fps',
      waterproof: '10m',
      battery: '1900mAh',
      weight: '154g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['new', 'popular'],
    available: true,
    stock: 5,
    slug: 'gopro-hero-13-black',
  },
  {
    id: '2',
    name: 'GoPro Hero 12 Black',
    brand: 'GoPro',
    model: 'Hero 12',
    description:
      'Bewährte Qualität zum günstigen Preis. Die Hero 12 bietet alle wichtigen Features für beeindruckende Videos und Fotos.',
    shortDescription: '5.3K60, 27MP, wasserdicht bis 10m',
    pricePerDay: 9.9,
    pricePerWeekend: 24.9,
    pricePerWeek: 54.9,
    deposit: 120,
    insurancePerDay: 2.0,
    images: ['/images/gopro-hero12.png'],
    specs: {
      resolution: '5.3K',
      fps: '60fps',
      waterproof: '10m',
      battery: '1720mAh',
      weight: '154g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['popular'],
    available: true,
    stock: 3,
    slug: 'gopro-hero-12-black',
  },
  {
    id: '3',
    name: 'DJI Osmo Action 4',
    brand: 'DJI',
    model: 'Action 4',
    description:
      "DJIs Flaggschiff-Actionkamera mit großem 1/1.3\"-Sensor für beeindruckende Low-Light-Aufnahmen. Dual-Screen und hervorragende Stabilisierung.",
    shortDescription: '4K120, großer Sensor, Dual-Screen',
    pricePerDay: 11.9,
    pricePerWeekend: 27.9,
    pricePerWeek: 64.9,
    deposit: 140,
    insurancePerDay: 2.5,
    images: ['/images/dji-action4.png'],
    specs: {
      resolution: '4K',
      fps: '120fps',
      waterproof: '18m',
      battery: '1770mAh',
      weight: '145g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['popular'],
    available: true,
    stock: 4,
    slug: 'dji-osmo-action-4',
  },
  {
    id: '4',
    name: 'DJI Osmo Action 5 Pro',
    brand: 'DJI',
    model: 'Action 5 Pro',
    description:
      'Die neueste DJI Action-Cam mit verbesserter Stabilisierung, noch längerem Akku und beeindruckender Wasserbeständigkeit bis 40m ohne Gehäuse.',
    shortDescription: '4K120, 40m wasserdicht, längere Akkulaufzeit',
    pricePerDay: 13.9,
    pricePerWeekend: 32.9,
    pricePerWeek: 74.9,
    deposit: 160,
    insurancePerDay: 3.0,
    images: ['/images/dji-action5-pro.png'],
    specs: {
      resolution: '4K',
      fps: '120fps',
      waterproof: '40m',
      battery: '1950mAh',
      weight: '145g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['new'],
    available: true,
    stock: 2,
    slug: 'dji-osmo-action-5-pro',
  },
  {
    id: '5',
    name: 'Insta360 Ace Pro 2',
    brand: 'Insta360',
    model: 'Ace Pro 2',
    description:
      'Insta360s Premium-Actionkamera mit Leica-Optik und KI-gestützten Features. Brillante Bildqualität bei jedem Licht.',
    shortDescription: '8K30, Leica Objektiv, AI-Features',
    pricePerDay: 14.9,
    pricePerWeekend: 34.9,
    pricePerWeek: 79.9,
    deposit: 180,
    insurancePerDay: 3.0,
    images: ['/images/insta360-ace-pro2.png'],
    specs: {
      resolution: '8K',
      fps: '30fps',
      waterproof: '12m',
      battery: '1800mAh',
      weight: '177g',
      storage: 'microSD',
    },
    category: 'action-cam',
    tags: ['new'],
    available: false,
    stock: 0,
    slug: 'insta360-ace-pro-2',
  },
  {
    id: '6',
    name: 'Insta360 X4',
    brand: 'Insta360',
    model: 'X4',
    description:
      'Die beste 360°-Kamera auf dem Markt. Unsichtbarer Selfie-Stick-Effekt, Me-Modus und beeindruckende 8K-Qualität für immersive Videos.',
    shortDescription: '8K30 360°, unsichtbarer Selfie-Stick',
    pricePerDay: 16.9,
    pricePerWeekend: 39.9,
    pricePerWeek: 89.9,
    deposit: 200,
    insurancePerDay: 3.5,
    images: ['/images/insta360-x4.png'],
    specs: {
      resolution: '8K 360°',
      fps: '30fps',
      waterproof: '10m',
      battery: '2290mAh',
      weight: '203g',
      storage: 'microSD',
    },
    category: '360-cam',
    tags: ['deal'],
    available: true,
    stock: 2,
    slug: 'insta360-x4',
  },
];
