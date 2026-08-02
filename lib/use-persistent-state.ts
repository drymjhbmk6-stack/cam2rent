'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Wie `useState`, aber der Wert wird pro Browser/Gerät in `localStorage`
 * gespeichert und beim nächsten Öffnen der Seite automatisch wiederhergestellt.
 *
 * Zweck: Admin-Filter, Suchbegriffe, aktive Tabs, Ansichts-Umschalter etc.
 * bleiben erhalten, wenn der Admin die Seite verlässt und zurückkommt — statt
 * bei jedem Besuch auf den Default zurückzufallen.
 *
 * **Hydration-sicher:** Der ERSTE Render (Server + erste Client-Hydration)
 * nutzt immer `defaultValue` → kein Server/Client-Mismatch. Der gespeicherte
 * Wert wird erst nach dem Mount aus `localStorage` nachgeladen (ein zusätzlicher
 * Render). Das passt zum bestehenden `useCachedFetch`-Muster (Client-Pages ohne
 * echtes SSR der Daten).
 *
 * Persistenz ist **pro Gerät** (localStorage), nicht kontogebunden — konsistent
 * zu allen anderen Admin-UI-Prefs der App (Sidebar-Gruppen, Ansichtsmodi …).
 *
 * Verwendung — Drop-in für die filter-/tab-/such-`useState`:
 *   const [status, setStatus] = usePersistentState('admin:kunden:status', 'all');
 *
 * Wähle einen stabilen, seiten-eindeutigen `key` mit `admin:<seite>:<feld>`.
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue);

  // Erster Persist-Lauf wird übersprungen, damit der Default den bereits
  // gespeicherten Wert NICHT überschreibt, bevor er gelesen wurde.
  const skipNextPersist = useRef(true);

  // Nach dem Mount: gespeicherten Wert lesen und anwenden.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as T;
        setValue(parsed);
      }
    } catch {
      // localStorage nicht verfügbar / defekter Eintrag → Default behalten.
    }
  }, [key]);

  // Bei jeder Änderung speichern (den ersten Lauf mit dem Default auslassen).
  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Speicher voll / privat-Modus → still ignorieren.
    }
  }, [key, value]);

  return [value, setValue];
}
