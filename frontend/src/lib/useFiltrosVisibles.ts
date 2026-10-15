"use client";

import { useCallback, useState } from "react";

export interface FiltroConfig {
  key: string;
  label: string;
}

// Guarda en localStorage el orden y visibilidad de filtros de una pantalla.
// Devuelve la lista ordenada de claves visibles y un setter para guardar
// el nuevo orden desde el dialog de configuracion.
export function useFiltrosVisibles(
  storageKey: string,
  todos: FiltroConfig[]
): {
  visibles: string[];
  setVisibles: (keys: string[]) => void;
} {
  const leerStorage = (): string[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          // Mantener solo claves que siguen existiendo
          return parsed.filter((k) => todos.some((f) => f.key === k));
        }
      }
    } catch {
      // localStorage no disponible o dato corrupto
    }
    return todos.map((f) => f.key);
  };

  const [visibles, setVisiblesState] = useState<string[]>(leerStorage);

  const setVisibles = useCallback(
    (keys: string[]) => {
      setVisiblesState(keys);
      try {
        localStorage.setItem(storageKey, JSON.stringify(keys));
      } catch {
        // ignorar
      }
    },
    [storageKey]
  );

  return { visibles, setVisibles };
}
