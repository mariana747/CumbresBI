"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, FormControlLabel, Checkbox } from "@mui/material";
import Script from "next/script";

// Widget de reCAPTCHA v2 ("no soy un robot") para el formulario publico de
// KYC externo (docs/architecture/pld-fase2-alcance.md sec. 2, decision de
// Mariana 12/Ago/2026: v2 sobre v3). Site key es publica por diseno (va en
// el HTML) - la verificacion real ocurre server-side con la secret key
// (ver services/pld-service/pld/recaptcha.py).
//
// Modo simulado (NEXT_PUBLIC_RECAPTCHA_SITE_KEY vacio, default en dev): no
// hay cuenta real de reCAPTCHA que renderizar - se muestra una casilla de
// verificacion simple que manda un token fijo; el backend en modo
// simulado (RECAPTCHA_SECRET_KEY vacio) acepta cualquier token no vacio.
const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      render: (
        container: HTMLElement,
        params: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void }
      ) => number;
    };
  }
}

export default function RecaptchaV2({ onChange }: { onChange: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!SITE_KEY || !scriptReady || renderedRef.current || !containerRef.current) {
      return;
    }
    // window.grecaptcha existe como un "stub" en cuanto el script empieza a
    // cargar, pero .render() (y el resto de la API real) solo esta
    // disponible despues de que Google termine de inicializar
    // internamente - grecaptcha.ready() espera ese momento en vez de
    // asumir que ya esta listo solo porque el <script> ya cargo
    // (detectado 17/Ago/2026: "window.grecaptcha.render is not a function").
    window.grecaptcha?.ready(() => {
      if (renderedRef.current || !containerRef.current || !window.grecaptcha) return;
      window.grecaptcha.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: onChange,
        "expired-callback": () => onChange(null),
      });
      renderedRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady]);

  if (!SITE_KEY) {
    return (
      <Alert severity="warning" sx={{ "& .MuiAlert-message": { width: "100%" } }}>
        reCAPTCHA no configurado (modo desarrollo) — marca la casilla para simular la verificación.
        <FormControlLabel
          sx={{ display: "block", mt: 1 }}
          control={
            <Checkbox
              onChange={(e) => onChange(e.target.checked ? "dev-simulado" : null)}
            />
          }
          label="No soy un robot (simulado)"
        />
      </Alert>
    );
  }

  return (
    <>
      <Script src="https://www.google.com/recaptcha/api.js" async defer onReady={() => setScriptReady(true)} />
      <div ref={containerRef} />
    </>
  );
}
