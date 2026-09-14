"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography, useTheme, alpha } from "@mui/material";

// Recorte de documentos con la cámara del celular, sin ML Kit (nativo
// Android/iOS, no aplica a un frontend web - ver conversación 28/Ago/2026
// con Mariana). Detección automática de esquinas con jscanify + OpenCV.js
// (mismo motor que ese demo), pero OpenCV.js se sirve local desde
// /public/opencv.js en vez del CDN de docs.opencv.org: cargarlo por red
// desde el celular por USB fue el origen de las fallas anteriores.
// - Al abrir la foto se intenta detectar el documento automático
//   (mejorContornoDocumento + getCornerPoints de jscanify) y se prellenan
//   los 4 círculos ahí.
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
//
// 31/Ago/2026 - primera prueba en campo (recibo Rappi) reveló dos bugs
// reales, diagnosticados via chrome://inspect (adb reverse tcp:3000/8080,
// ver conversación de esa fecha):
// 1. findPaperContour espera un cv.Mat, NO un canvas/imagen crudos (el
//    doc del propio metodo en jscanify dice "(cv.Mat)") - pasarle la
//    imagen directa tronaba SIEMPRE con "BindingError: Cannot pass [...]
//    as a Mat", escondido por completo por un catch vacío. extractPaper
//    no tenía este problema porque esa función sí hace cv.imread()
//    internamente.
// 2. Una vez arreglado eso, jscanify.findPaperContour se queda con "el
//    contorno de mayor área" sin exigir que se parezca a un documento -
//    en la foto de prueba un código QR (alto contraste, bordes muy
//    definidos) le ganó al contorno completo del recibo (bajo contraste
//    contra el fondo). mejorContornoDocumento reimplementa el mismo
//    pipeline pero exige que el candidato aproxime a un cuadrilátero
//    convexo con área mínima razonable, cayendo al criterio original de
//    jscanify solo si nada cumple eso.

// Handle de un cv.Mat (Emscripten/embind) - solo lo mínimo que se usa
// aquí. Hay que llamar a `.delete()` explícito cuando ya no se necesita,
// OpenCV.js no lo libera solo (memoria del heap de WASM, no de JS).
interface CvMat {
  delete(): void;
  rows: number;
  cols: number;
  data32S: Int32Array;
}

interface CvMatVector {
  size(): number;
  get(i: number): CvMat;
  delete(): void;
}

// Funciones de OpenCV.js usadas para reimplementar la selección de
// contorno (ver `mejorContornoDocumento` más abajo) - jscanify hace este
// mismo pipeline internamente pero sin filtrar por forma, así que se
// repite aquí en vez de depender de su `findPaperContour`.
interface CvNamespace {
  onRuntimeInitialized?: () => void;
  imread(el: HTMLCanvasElement | HTMLImageElement): CvMat;
  Mat: new () => CvMat;
  MatVector: new () => CvMatVector;
  Size: new (w: number, h: number) => unknown;
  Canny(src: CvMat, dst: CvMat, umbral1: number, umbral2: number): void;
  GaussianBlur(src: CvMat, dst: CvMat, size: unknown, sx: number, sy: number, borde: number): void;
  threshold(src: CvMat, dst: CvMat, umbral: number, max: number, tipo: number): void;
  findContours(src: CvMat, contornos: CvMatVector, jerarquia: CvMat, modo: number, metodo: number): void;
  contourArea(contorno: CvMat): number;
  arcLength(contorno: CvMat, cerrado: boolean): number;
  approxPolyDP(contorno: CvMat, salida: CvMat, epsilon: number, cerrado: boolean): void;
  isContourConvex(contorno: CvMat): boolean;
  BORDER_DEFAULT: number;
  THRESH_OTSU: number;
  RETR_CCOMP: number;
  CHAIN_APPROX_SIMPLE: number;
}

declare global {
  interface Window {
    cv?: CvNamespace;
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

// Ancho al que se reduce la foto SOLO para la detección de contorno.
// findPaperContour usa internamente un blur/Canny con parámetros fijos que
// están calibrados para imágenes de este orden de tamaño; una foto de
// celular a resolución completa (3000-4000px de ancho) hace que ese blur
// quede "relativamente" muy chico frente al detalle/ruido de la imagen y
// el contorno que encuentra sale mal (o no encuentra nada) - por eso la
// detección automática fallaba tanto. extractPaper (el recorte final) sí
// sigue usando la imagen a resolución completa, esto es solo para ubicar
// las esquinas.
const DETECCION_ANCHO = 600;

// Dibuja `imagen` reducida a un canvas de ancho `anchoDestino` (alto
// proporcional) para usarlo como entrada de la detección.
function canvasParaDeteccion(imagen: HTMLImageElement, anchoDestino: number): HTMLCanvasElement {
  const ancho = Math.min(anchoDestino, imagen.naturalWidth);
  const alto = Math.round((imagen.naturalHeight / imagen.naturalWidth) * ancho);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext("2d")!.drawImage(imagen, 0, 0, ancho, alto);
  return canvas;
}

// jscanify.findPaperContour se queda con "el contorno de mayor área"
// entre todo lo que encuentra Canny+threshold+findContours, sin exigir
// que se parezca a un documento - en campo (31/Ago/2026, ticket de Rappi)
// eso hizo que le ganara un código QR (alto contraste, bordes muy
// definidos) al contorno completo del recibo (bajo contraste contra el
// fondo). Se repite el mismo pipeline pero exigiendo que el contorno
// candidato aproxime a un cuadrilátero convexo (4 vértices via
// approxPolyDP + isContourConvex) y cubra al menos AREA_MINIMA_FRACCION
// de la foto - un documento sostenido para la foto ocupa la mayor parte
// del encuadre, un QR/logo no. Si ningún candidato cumple todo eso, cae
// al mismo criterio de jscanify (contorno de mayor área a secas) para no
// regresar peor que antes.
const AREA_MINIMA_FRACCION = 0.15;

function mejorContornoDocumento(cv: CvNamespace, mat: CvMat): CvMat | null {
  const imgGray = new cv.Mat();
  cv.Canny(mat, imgGray, 50, 200);
  const imgBlur = new cv.Mat();
  cv.GaussianBlur(imgGray, imgBlur, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
  const imgThresh = new cv.Mat();
  cv.threshold(imgBlur, imgThresh, 0, 255, cv.THRESH_OTSU);

  const contornos = new cv.MatVector();
  const jerarquia = new cv.Mat();
  cv.findContours(imgThresh, contornos, jerarquia, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

  const areaMinima = mat.rows * mat.cols * AREA_MINIMA_FRACCION;
  let mejorCuadrilatero: CvMat | null = null;
  let mejorCuadrilateroArea = 0;
  let areaMaxima = 0;
  let indiceAreaMaxima = -1;

  for (let i = 0; i < contornos.size(); i++) {
    const contorno = contornos.get(i);
    const area = cv.contourArea(contorno);
    if (area > areaMaxima) {
      areaMaxima = area;
      indiceAreaMaxima = i;
    }
    if (area >= areaMinima) {
      const approx = new cv.Mat();
      const perimetro = cv.arcLength(contorno, true);
      cv.approxPolyDP(contorno, approx, 0.02 * perimetro, true);
      // approxPolyDP puede devolver 4 vertices que NO forman un
      // rectangulo sano (cuadrilatero auto-intersectado, "en forma de
      // moño") - isContourConvex descarta esos casos. Sin este filtro,
      // en campo (31/Ago/2026) se eligió un cuadrilátero degenerado con
      // las 4 esquinas amontonadas en una esquina de la foto.
      if (approx.rows === 4 && area > mejorCuadrilateroArea && cv.isContourConvex(approx)) {
        mejorCuadrilatero?.delete();
        mejorCuadrilatero = approx;
        mejorCuadrilateroArea = area;
      } else {
        approx.delete();
      }
    }
  }

  // El respaldo ("el contorno más grande a secas", igual al criterio
  // original de jscanify) NO tiene piso de tamaño - en campo devolvía con
  // falsa confianza un contorno chico y mal formado (otra vez el QR, esta
  // vez ~2.5% del área) presentado como "Detección automática" en vez de
  // admitir honestamente que no encontró el documento. Se le exige el
  // mismo piso de área que al cuadrilátero (aunque no sea un cuadrilátero
  // limpio) - si ni eso se cumple, null: mejor "ajusta a mano" sincero que
  // una detección seria pero incorrecta.
  const resultado =
    mejorCuadrilatero ?? (indiceAreaMaxima >= 0 && areaMaxima >= areaMinima ? contornos.get(indiceAreaMaxima) : null);

  imgGray.delete();
  imgBlur.delete();
  imgThresh.delete();
  contornos.delete();
  jerarquia.delete();
  return resultado;
}

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

// jscanify etiqueta cada esquina con una heurística de extremos (más
// arriba-izquierda = menor x+y, etc.) que asume el documento casi alineado
// con la foto. Con rotación/perspectiva fuerte esa heurística puede
// etiquetar mal (p.ej. llamar "superior derecha" a lo que geométricamente
// es la esquina inferior). Para no heredar ese error, se ignoran las
// etiquetas y se reordenan las 4 esquinas por su ángulo respecto al
// centroide del propio cuadrilátero: eso da el orden correcto
// (sup-izq, sup-der, inf-der, inf-izq) sin importar cómo las llamó
// jscanify, siempre que el cuadrilátero sea convexo (caso normal de una
// hoja/documento).
function ordenarPorAngulo(puntos: Punto[]): Punto[] {
  const cx = puntos.reduce((s, p) => s + p.x, 0) / puntos.length;
  const cy = puntos.reduce((s, p) => s + p.y, 0) / puntos.length;
  return [...puntos].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
}

function cornersADisplay(c: JScanifyCorners, escala: number): Punto[] {
  const crudos = [
    { x: c.topLeftCorner.x / escala, y: c.topLeftCorner.y / escala },
    { x: c.topRightCorner.x / escala, y: c.topRightCorner.y / escala },
    { x: c.bottomRightCorner.x / escala, y: c.bottomRightCorner.y / escala },
    { x: c.bottomLeftCorner.x / escala, y: c.bottomLeftCorner.y / escala },
  ];
  return ordenarPorAngulo(crudos);
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
  const theme = useTheme();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [dispWidth, setDispWidth] = useState(0);
  const [dispHeight, setDispHeight] = useState(0);
  // Tamaño de la "ventana" visible (con scroll) - separado del tamaño de
  // la imagen renderizada (dispWidth/dispHeight): la imagen puede ser más
  // grande que lo que se ve de una vez (mejor precisión para ubicar
  // esquinas), el visor recorta y se navega con las flechas.
  const [visorWidth, setVisorWidth] = useState(0);
  const [visorHeight, setVisorHeight] = useState(0);
  const [esquinas, setEsquinas] = useState<Punto[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [cvListo, setCvListo] = useState(false);
  const [detectando, setDetectando] = useState(false);
  const [autoDetectado, setAutoDetectado] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const arrastrandoRef = useRef<number | null>(null);
  // El área de arrastre de esquinas usa touchAction:"none" (necesario
  // para poder arrastrar los círculos sin que el navegador interprete el
  // gesto como scroll) - eso tapa el swipe nativo dentro de esa misma
  // área, pero el visor (visorRef) en si mismo si hace scroll nativo
  // (mouse wheel/trackpad/swipe fuera de los circulos) si la imagen es
  // mas grande que la ventana visible. Las flechas explicitas de paneo se
  // quitaron (04/Sep/2026, pedido de Mariana) ahora que el visor ampliado
  // casi nunca las necesita.
  const visorRef = useRef<HTMLDivElement>(null);

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
      // Tamaño del VISOR (ventana visible, con scroll) - acotado a lo que
      // cabe dentro del contenido del dialog "xs" (~444px menos padding).
      // Los topes NO son un numero fijo: en celulares angostos (~360px de
      // viewport) un tope fijo se pasaba del espacio real disponible una
      // vez restado el margen del Dialog + el padding del DialogContent
      // (visto 31/Ago/2026 en revisión de responsivo). Se calculan contra
      // window.innerWidth/innerHeight, con margenes estimados para ese
      // margen+padding (horizontal) y titulo+caption+acciones+padding
      // (vertical).
      // Topes ampliados (04/Sep/2026, hallazgo real: en una ventana de
      // escritorio mas "corta" que ancha, innerHeight-280 caia por debajo
      // del tope viejo de 420 mucho mas seguido que en un celular en
      // vertical, obligando a mas scroll para ver el ticket completo sin
      // ninguna razon real de espacio - la ventana si tenia lugar de
      // sobra). Los minimos (200/240, celulares muy chicos) no cambian.
      const visAncho = Math.max(200, Math.min(480, window.innerWidth - 96));
      const visAlto = Math.max(240, Math.min(600, window.innerHeight - 280));
      setVisorWidth(visAncho);
      setVisorHeight(visAlto);

      // Tamaño de RENDER de la imagen - puede ser más grande que el visor
      // (mejor precisión para ubicar las esquinas en fotos de alta
      // resolución); el visor recorta y se navega con las flechas
      // (desplazar) en vez de depender del swipe nativo, que queda tapado
      // por touchAction:"none" del área de arrastre de esquinas
      // (reportado 31/Ago/2026 - antes se shrinkeaba la imagen entera
      // para que siempre cupiera de una vez, perdiendo precisión).
      const ANCHO_RENDER_MAX = 480;
      const ancho = Math.min(imagen.naturalWidth, ANCHO_RENDER_MAX);
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

  // Detección automática de esquinas en cuanto OpenCV.js terminó de
  // cargar y ya hay foto - si falla o no encuentra nada, se quedan las
  // esquinas por margen puestas arriba.
  useEffect(() => {
    if (!cvListo || !img || dispWidth === 0) return;
    let cancelado = false;
    setDetectando(true);
    (async () => {
      // Los Mat se declaran aqui (no dentro del try) para poder liberarlos
      // en el finally sin importar por donde se salga del try.
      let mat: CvMat | undefined;
      let contorno: CvMat | null | undefined;
      try {
        const scanner = await crearScanner();
        const canvasDeteccion = canvasParaDeteccion(img, DETECCION_ANCHO);
        // findPaperContour/imread esperan un cv.Mat, NO un canvas/imagen
        // crudos - ver comentario largo arriba del archivo (bug real
        // confirmado 31/Ago/2026 via chrome://inspect). extractPaper() en
        // confirmar() no tiene este problema porque esa función sí hace
        // el cv.imread() internamente.
        mat = window.cv!.imread(canvasDeteccion);
        contorno = mejorContornoDocumento(window.cv!, mat);
        if (!contorno || cancelado) return;
        const corners = scanner.getCornerPoints(contorno);
        const escala = canvasDeteccion.width / dispWidth;
        if (
          corners.topLeftCorner &&
          corners.topRightCorner &&
          corners.bottomLeftCorner &&
          corners.bottomRightCorner
        ) {
          const enPantalla = cornersADisplay(corners, escala);
          console.log("[EscanerDocumento] esquinas detectadas (crudas, escaladas)", corners, enPantalla, {
            dispWidth,
            dispHeight,
          });
          setEsquinas(enPantalla);
          setAutoDetectado(true);
        } else {
          console.warn("[EscanerDocumento] contorno encontrado pero sin las 4 esquinas", corners);
        }
      } catch (err) {
        // Se queda con las esquinas por margen - el usuario ajusta a mano.
        console.error("[EscanerDocumento] fallo la deteccion automatica de esquinas", err);
      } finally {
        contorno?.delete();
        mat?.delete();
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
          la señal de "listo" real. Distintos builds de OpenCV.js exponen
          esa señal distinto: unos con el patrón clásico
          onRuntimeInitialized, otros (mas recientes) con `cv` como
          thenable (`cv.then(...)`). Se cubren los dos y se loguea si
          ninguno llega, porque antes esto fallaba en silencio total - si
          `window.cv` no existía en el instante exacto de onReady, nada
          quedaba enganchado y cvListo se quedaba en false para siempre
          sin ningún rastro (bug real diagnosticado 31/Ago/2026). */}
      <Script
        src="/opencv.js"
        strategy="lazyOnload"
        onReady={() => {
          const cv = window.cv as unknown;
          console.log("[EscanerDocumento] opencv.js cargado, window.cv =", typeof cv, cv);
          if (!cv) {
            console.error("[EscanerDocumento] opencv.js no definio window.cv");
            return;
          }
          if (typeof (cv as { then?: unknown }).then === "function") {
            (cv as Promise<unknown>).then(() => {
              console.log("[EscanerDocumento] cv listo via promesa (cv.then)");
              setCvListo(true);
            });
          } else {
            (cv as { onRuntimeInitialized?: () => void }).onRuntimeInitialized = () => {
              console.log("[EscanerDocumento] cv listo via onRuntimeInitialized");
              setCvListo(true);
            };
          }
          setTimeout(() => {
            setCvListo((yaListo) => {
              if (!yaListo) console.error("[EscanerDocumento] OpenCV no inicializo despues de 15s");
              return yaListo;
            });
          }, 15000);
        }}
      />
      <Dialog open={open} onClose={onCancelar} maxWidth="xs" fullWidth>
        <DialogTitle>Ajusta las esquinas del documento</DialogTitle>
        <DialogContent>
        {img && esquinas.length === 4 && (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
              <Box>
                {/* Visor: ventana visible con scroll - la imagen (dentro,
                    ref=contenedorRef) puede ser más grande que esto para
                    mejor precisión al ubicar esquinas. touchAction:"none"
                    vive en el área de arrastre de esquinas, no aquí, así
                    que el swipe/scroll nativo funciona dentro del visor en
                    el espacio que no sea encima de un círculo - las
                    flechas explícitas de paneo se quitaron (04/Sep/2026,
                    pedido de Mariana) ahora que el visor ampliado
                    (ver visAncho/visAlto) casi nunca las necesita. */}
                <Box
                  ref={visorRef}
                  sx={{
                    width: visorWidth,
                    height: visorHeight,
                    overflow: "auto",
                    mx: "auto",
                  }}
                >
                  <Box
                    ref={contenedorRef}
                    sx={{
                      position: "relative",
                      width: dispWidth,
                      height: dispHeight,
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
                        fill={alpha(theme.palette.primary.main, 0.25)}
                        stroke={theme.palette.primary.main}
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
                          bgcolor: "primary.main",
                          border: "2px solid",
                          borderColor: "background.paper",
                          boxShadow: 2,
                          cursor: "grab",
                          touchAction: "none",
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, textAlign: "center" }}>
              Ajusta los 4 puntos a tu imagen
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
