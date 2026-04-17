# Cam2Rent – Logo-Paket

## Struktur

```
cam2rent-logos/
├── cam2rent-v4-light.svg          # Haupt-Logo (Lightmode)
├── cam2rent-v4-dark.svg           # Haupt-Logo (Darkmode)
├── cam2rent-mono-schwarz.svg      # Monochrom schwarz (Rechnungen, Stempel)
├── cam2rent-mono-weiss.svg        # Monochrom weiß (dunkle Hintergründe)
├── icon-light.svg                 # Quadratisches Icon (Light)
├── icon-dark.svg                  # Quadratisches Icon (Dark)
├── png/                           # PNG-Exports 400/800/1200/2400 px breit
└── favicon/                       # Favicon + App-Icons (16–1024 px) + favicon.ico
```

## Einbindung in cam2rent.de

### Favicon (HTML-Head)
```html
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon/icon-light-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon/icon-light-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon/icon-light-180.png">
```

### Logo mit automatischem Dark/Light-Switch
```html
<picture>
  <source srcset="/logo/cam2rent-v4-dark.svg" media="(prefers-color-scheme: dark)">
  <img src="/logo/cam2rent-v4-light.svg" alt="Cam2Rent" width="200">
</picture>
```

### Für Invoice-PDFs
Empfehlung: `cam2rent-mono-schwarz.svg` oder `logo-mono-schwarz-800w.png` – 
druckt sauber in Schwarzweiß.

## Farbpalette

| Farbe        | Hex      | Verwendung                |
|--------------|----------|---------------------------|
| Primary dark | #1E40AF  | Gradient-Start (Light)    |
| Primary      | #3B82F6  | Hauptblau                 |
| Primary light| #60A5FA  | Gradient-Ende (Dark)      |
| Slate 900    | #0F172A  | Text, Objektiv            |
| Slate 50     | #F8FAFC  | Text auf Dark, Hintergrund|
