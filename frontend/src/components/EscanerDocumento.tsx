"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

// Recorte de documentos con la cámara del celular, sin ML Kit (nativo
// Android/iOS, no aplica a un frontend web - ver conversación 28/Ago/2026
// con Mariana). Detección automática de esquinas con jscanify + OpenCV.js
// (mismo motor que ese demo), pero OpenCV.js se sirve local desde
// /public/opencv.js en vez del CDN de docs.opencv.org: cargarlo por red
// desde el celular por USB fue el origen de las fallas anteriores.
// - Al abrir la foto se intenta detectar el documento automático
//   (findPaperContour + getCornerPoints de jscanify) y se prellenan los 4
//   círculos ahí.
// - El usuario siempre puede arrastrar los círculos si la detección no
//   quedó exacta.
// - Al confirmar, si OpenCV cargó bien se usa jscanify.extractPaper
//   (warpPerspective con interpolación bilineal - buena calidad); si algo
//   falló (OpenCV no cargó, excepción), cae a una homografía propia hecha
//   a mano en canvas puro, más tosca pero sin dependencias.
//
// Prueba piloto: solo MiCumbres > Tickets de reembolso ("Tomar foto"). Si
// funciona bien en campo, se vuelve el componente compartido para los
// demás inputs de captura (Tesorería/Flujos, tickets públicos, PLD - ver
// memoria "camara-y-drive-pendiente-varios-modulos").

declare global {
  interface Window {
    cv?: { onRuntimeInitialized?: () => void };
  }
}

interface JScanifyCorners {
  topLeftCorner: { x: number; y: number };
  topRightCorner: { x: number; y: number };
  bottomLeftCorner: { x: number; y: number };
  bottomRightCorner: { x: number; y: number };
}

interface JScanifyInstance {
  findPaperContour(img: unknown): unknown;
  getCornerPoints(contour: unknown): JScanifyCorners;
  extractPaper(
    img: HTMLImageElement,
    resultWidth: number,
    resultHeight: number,
    cornerPoints: JScanifyCorners
  ): HTMLCanvasElement | null;
}

interface Punto {
  x: number;
  y: number;
}

interface EscanerDocumentoProps {
  open: boolean;
  archivo: File | null;
  onCancelar: () => void;
  onConfirmar: (archivo: File) => void;
}

const MARGEN_INICIAL = 0.08; // esquinas iniciales al 8% del borde de la imagen

// Resuelve la homografía 3x3 que manda los 4 puntos "dst" (rectángulo de
// salida) a los 4 puntos "src" (esquinas elegidas sobre la foto original),
// para poder recorrer el rectángulo de salida pixel por pixel y jalar el
// valor correspondiente de la foto original (sampling inverso).
function resolverHomografia(src: Punto[], dst: Punto[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = dst[i];
    const { x: u, y: v } = src[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  // Eliminación gaussiana con pivoteo parcial, sistema 8x8.
  for (let col = 0; col < 8; col++) {
    let pivote = col;
    for (let fila = col + 1; fila < 8; fila++) {
      if (Math.abs(A[fila][col]) > Math.abs(A[pivote][col])) pivote = fila;
    }
    [A[col], A[pivote]] = [A[pivote], A[col]];
    [b[col], b[pivote]] = [b[pivote], b[col]];
    for (let fila = col + 1; fila < 8; fila++) {
      const factor = A[fila][col] / A[col][col];
      for (let k = col; k < 8; k++) A[fila][k] -= factor * A[col][k];
      b[fila] -= factor * b[col];
    }
  }
  const h = new Array(8).fill(0);
  for (let col = 7; col >= 0; col--) {
    let suma = b[col];
    for (let k = col + 1; k < 8; k++) suma -= A[col][k] * h[k];
    h[col] = suma / A[col][col];
  }
  return [...h, 1]; // h11..h32, h33=1
}

function distancia(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// jscanify 1.4+ trae el build de navegador en el subpath "./client" (la
// raíz del paquete es la variante de Node, usa `fs`/`canvas`, no compila
// en Next). Es un módulo UMD (module.exports = factory() directo, sin
// named export real) - según cómo lo interprete webpack el constructor
// aparece en `.default` o en la raíz del namespace importado.
async function crearScanner(): Promise<JScanifyInstance> {
  const mod = await import("jscanify/client");
  const Ctor = ((mod as { default?: unknown }).default ?? mod) as new () => JScanifyInstance;
  return new Ctor();
}

function cornersADisplay(c: JScanifyCorners, escala: number): Punto[] {
  return [
    { x: c.topLeftCorner.x / escala, y: c.topLeftCorner.y / escala },
    { x: c.topRightCorner.x / escala, y: c.topRightCorner.y / escala },
    { x: c.bottomRightCorner.x / escala, y: c.bottomRightCorner.y / escala },
    { x: c.bottomLeftCorner.x / escala, y: c.bottomLeftCorner.y / escala },
  ];
}

// Endereza la región marcada por las 4 esquinas (orden: sup-izq, sup-der,
// inf-der, inf-izq) y regresa un canvas nuevo ya recortado/enderezado.
function enderezar(imagen: HTMLImageElement, esquinas: Punto[]): HTMLCanvasElement {
  const [supIzq, supDer, infDer, infIzq] = esquinas;
  const ancho = Math.round(Math.max(distancia(supIzq, supDer), distancia(infIzq, infDer)));
  const alto = Math.round(Math.max(distancia(supIzq, infIzq), distancia(supDer, infDer)));

  const origen = document.createElement("canvas");
  origen.width = imagen.naturalWidth;
  origen.height = imagen.naturalHeight;
  const ctxOrigen = origen.getContext("2d")!;
  ctxOrigen.drawImage(imagen, 0, 0);
  const datosOrigen = ctxOrigen.getImageData(0, 0, origen.width, origen.height);

  const destino = document.createElement("canvas");
  destino.width = ancho;
  destino.height = alto;
  const ctxDestino = destino.getContext("2d")!;
  const datosDestino = ctxDestino.createImageData(ancho, alto);

  const h = resolverHomografia(
    esquinas,
    [
      { x: 0, y: 0 },
      { x: ancho, y: 0 },
      { x: ancho, y: alto },
      { x: 0, y: alto },
    ]
  );

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const denom = h[6] * x + h[7] * y + 1;
      const sx = Math.round((h[0] * x + h[1] * y + h[2]) / denom);
      const sy = Math.round((h[3] * x + h[4] * y + h[5]) / denom);
      const destIdx = (y * ancho + x) * 4;
      if (sx >= 0 && sx < origen.width && sy >= 0 && sy < origen.height) {
        const srcIdx = (sy * origen.width + sx) * 4;
        datosDestino.data[destIdx] = datosOrigen.data[srcIdx];
        datosDestino.data[destIdx + 1] = datosOrigen.data[srcIdx + 1];
        datosDestino.data[destIdx + 2] = datosOrigen.data[srcIdx + 2];
        datosDestino.data[destIdx + 3] = 255;
      }
    }
  }
  ctxDestino.putImageData(datosDestino, 0, 0);
  return destino;
}

export default function EscanerDocumento({ open, archivo, onCancelar, onConfirmar }: EscanerDocumentoProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [dispWidth, setDispWidth] = useState(0);
  const [dispHeight, setDispHeight] = useState(0);
  const [esquinas, setEsquinas] = useState<Punto[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [cvListo, setCvListo] = useState(false);
  const [detectando, setDetectando] = useState(false);
  const [autoDetectado, setAutoDetectado] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const arrastrandoRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !archivo) {
      setImg(null);
      setEsquinas([]);
      setAutoDetectado(false);
      return;
    }
    const imagen = new Image();
    const url = URL.createObjectURL(archivo);
    imagen.onload = () => {
      setImg(imagen);
      setImgUrl(url);
      // Ancho de despliegue acotado a lo que cabe dentro del contenido del
      // dialog "xs" (~444px menos padding) para que el preview no se
      // salga de pantalla en celular.
      const ancho = Math.min(imagen.naturalWidth, 320);
      const alto = (imagen.naturalHeight / imagen.naturalWidth) * ancho;
      setDispWidth(ancho);
      setDispHeight(alto);
      const mx = ancho * MARGEN_INICIAL;
      const my = alto * MARGEN_INICIAL;
      setEsquinas([
        { x: mx, y: my },
        { x: ancho - mx, y: my },
        { x: ancho - mx, y: alto - my },
        { x: mx, y: alto - my },
      ]);
    };
    imagen.src = url;
    // La URL se revoca al desmontar/cerrar, no apenas carga: el <img> del
    // preview en el JSX reutiliza esta misma blob URL.
    return () => URL.revokeObjectURL(url);
  }, [open, archivo]);

  // Detección automática de esquinas (como en la demo de jscanify) en
  // cuanto OpenCV.js terminó de cargar y ya hay foto - si falla o no
  // encuentra nada, se quedan las esquinas por margen puestas arriba.
  useEffect(() => {
    if (!cvListo || !img || dispWidth === 0) return;
    let cancelado = false;
    setDetectando(true);
    (async () => {
      try {
        const scanner = await crearScanner();
        const contorno = scanner.findPaperContour(img);
        if (!contorno || cancelado) return;
        const corners = scanner.getCornerPoints(contorno);
        const escala = img.naturalWidth / dispWidth;
        if (
          corners.topLeftCorner &&
          corners.topRightCorner &&
          corners.bottomLeftCorner &&
          corners.bottomRightCorner
        ) {
          setEsquinas(cornersADisplay(corners, escala));
          setAutoDetectado(true);
        }
      } catch {
        // Se queda con las esquinas por margen - el usuario ajusta a mano.
      } finally {
        if (!cancelado) setDetectando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvListo, img, dispWidth]);

  function iniciarArrastre(i: number) {
    arrastrandoRef.current = i;
  }

  function mover(clientX: number, clientY: number) {
    const i = arrastrandoRef.current;
    if (i === null || !contenedorRef.current) return;
    const rect = contenedorRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), dispWidth);
    const y = Math.min(Math.max(clientY - rect.top, 0), dispHeight);
    setEsquinas((prev) => prev.map((p, idx) => (idx === i ? { x, y } : p)));
  }

  function soltarArrastre() {
    arrastrandoRef.current = null;
  }

  async function confirmar() {
    if (!img || esquinas.length !== 4 || !archivo) return;
    setProcesando(true);
    // Escala las esquinas (elegidas/ajustadas sobre la vista previa
    // reducida) a la resolución real de la foto antes de recortar.
    const escala = img.naturalWidth / dispWidth;
    const [supIzq, supDer, infDer, infIzq] = esquinas.map((p) => ({ x: p.x * escala, y: p.y * escala }));
    const ancho = Math.round(Math.max(distancia(supIzq, supDer), distancia(infIzq, infDer)));
    const alto = Math.round(Math.max(distancia(supIzq, infIzq), distancia(supDer, infDer)));

    let canvas: HTMLCanvasElement | null = null;
    if (cvListo) {
      try {
        const scanner = await crearScanner();
        canvas = scanner.extractPaper(img, ancho, alto, {
          topLeftCorner: supIzq,
          topRightCorner: supDer,
          bottomLeftCorner: infIzq,
          bottomRightCorner: infDer,
        });
      } catch {
        canvas = null; // cae al respaldo de abajo
      }
    }
    if (!canvas) {
      canvas = enderezar(img, [supIzq, supDer, infDer, infIzq]);
    }

    canvas.toBlob(
      (blob) => {
        setProcesando(false);
        if (!blob) return;
        onConfirmar(new File([blob], archivo.name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  const etiquetas = ["Superior izquierda", "Superior derecha", "Inferior derecha", "Inferior izquierda"];

  return (
    <>
      {/* opencv.js self-hosted en /public (10MB) - lazyOnload para no
          bloquear la carga inicial de la pantalla. onReady solo avisa que
          el <script> terminó de descargarse, NO que el runtime WASM ya
          está listo (eso tarda otro poco) - por eso se engancha aparte a
          cv.onRuntimeInitialized, que es cuando de verdad se pueden llamar
          funciones de OpenCV (findPaperContour tronaba en silencio antes
          de este punto y el catch lo mandaba al respaldo manual). */}
      <Script
        src="/opencv.js"
        strategy="lazyOnload"
        onReady={() => {
          if (window.cv) window.cv.onRuntimeInitialized = () => setCvListo(true);
        }}
      />
      <Dialog open={open} onClose={onCancelar} maxWidth="xs" fullWidth>
        <DialogTitle>Ajusta las esquinas del documento</DialogTitle>
        <DialogContent>
        {img && esquinas.length === 4 && (
          <>
            <Box
              ref={contenedorRef}
              sx={{
                position: "relative",
                width: dispWidth,
                height: dispHeight,
                mx: "auto",
                touchAction: "none",
                userSelect: "none",
              }}
              onMouseMove={(e) => mover(e.clientX, e.clientY)}
              onMouseUp={soltarArrastre}
              onMouseLeave={soltarArrastre}
              onTouchMove={(e) => mover(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchEnd={soltarArrastre}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgUrl ?? undefined}
                alt="Foto a recortar"
                width={dispWidth}
                height={dispHeight}
                style={{ display: "block", width: dispWidth, height: dispHeight, borderRadius: 4 }}
                draggable={false}
              />
              <svg
                width={dispWidth}
                height={dispHeight}
                style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
              >
                <polygon
                  points={esquinas.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(25,118,210,0.25)"
                  stroke="#1976d2"
                  strokeWidth={2}
                />
              </svg>
              {esquinas.map((p, i) => (
                <Box
                  key={i}
                  onMouseDown={() => iniciarArrastre(i)}
                  onTouchStart={() => iniciarArrastre(i)}
                  title={etiquetas[i]}
                  sx={{
                    position: "absolute",
                    left: p.x - 14,
                    top: p.y - 14,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    bgcolor: "#1976d2",
                    border: "2px solid white",
                    boxShadow: 2,
                    cursor: "grab",
                    touchAction: "none",
                  }}
                />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, textAlign: "center" }}>
              {detectando
                ? "Detectando el documento…"
                : autoDetectado
                  ? "Detección automática — ajusta si hace falta."
                  : "No se detectó automático — ajusta los 4 círculos a mano."}
            </Typography>
          </>
        )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button onClick={() => archivo && onConfirmar(archivo)} disabled={procesando || !archivo}>
            Usar foto original
          </Button>
          <Button variant="contained" onClick={confirmar} disabled={procesando || !img}>
            {procesando ? "Enderezando…" : "Confirmar recorte"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
