"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Paper, Stack } from "@mui/material";
import { ExternalLink, Minus, Plus, Search, X as CloseIcon } from "lucide-react";

// Preview embebido de un documento ya subido (01/Sep/2026, pedido explicito
// de Mariana: "ver documento" en PLD debe verse en la misma pantalla, igual
// que el panel lateral del Motor Documental en Facturas/Flujos, en vez de
// abrir Drive en pestaña nueva). Reusable para cualquier endpoint que sirva
// el archivo con Content-Disposition inline y CSP frame-ancestors abierto a
// este origen (ver PldContraparteDocViewSet.ver) - no asume nada de Drive
// directamente.
export interface DocumentoPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  url: string | null;
  titulo: string;
  // false para documentos que sabemos que no son imagen (ej. XML) -
  // 09/Sep/2026, hallazgo real: el intento previo como <img> (que
  // siempre falla para XML) dejaba el <iframe> de respaldo en blanco -
  // salta directo a <iframe> sin pasar por el intento de <img>.
  probablementeImagen?: boolean;
  // "Abrir en pestaña nueva" debe apuntar al archivo real de Drive
  // (09/Sep/2026, "la redireccion debe hacer al archivo de drive"), no a
  // nuestro endpoint de streaming - `url` sigue siendo el que se embebe
  // en el <img>/<iframe>. Si se omite, cae a `url`.
  urlExterna?: string | null;
}

// ZOOM_MIN = 1 (04/Sep/2026, pedido de Mariana: "de ese contenedor que ya
// queda asi, ese sera el minimo") - el ajuste automatico (object-fit:
// contain) YA es el tamaño mas chico util; no tiene caso encoger mas alla
// de eso, solo se puede acercar desde ahi.
const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_PASO = 0.1;

export default function DocumentoPreviewDialog({
  open,
  onClose,
  url,
  titulo,
  probablementeImagen = true,
  urlExterna,
}: DocumentoPreviewDialogProps) {
  // Zoom +/- (04/Sep/2026, pedido de Mariana: barra flotante centrada
  // abajo, encima del documento - como en apps de galeria/escaner, no dos
  // botones sueltos en el titulo) - transform:scale. Se reinicia cada vez
  // que se abre un documento distinto.
  const [zoom, setZoom] = useState(1);
  // 04/Sep/2026 (bug real: una foto de celular en un <iframe> se ve a su
  // resolucion NATIVA, chiquita, con espacio en blanco alrededor - el
  // iframe no la reescala) - se intenta como <img> primero (object-fit:
  // contain la ajusta sola al contenedor); si el archivo no es una imagen
  // (ej. PDF), onError cae a <iframe> (el visor nativo de PDF del
  // navegador si se ajusta razonablemente al ancho).
  const [esImagen, setEsImagen] = useState(true);
  // Pan con mouse directo sobre la imagen (07/Sep/2026, pedido de Mariana:
  // "manipular con el mouse" igual que en PLD) - arrastrar mueve `offset`,
  // la rueda del mouse hace zoom centrado donde esta el cursor. Ambos se
  // reinician junto con el zoom cada vez que se abre un documento distinto.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const arrastrando = useRef(false);
  const inicioArrastre = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  useEffect(() => {
    if (open) {
      setZoom(1);
      setEsImagen(probablementeImagen);
      setOffset({ x: 0, y: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url]);

  function manejarWheel(e: React.WheelEvent) {
    if (!esImagen) return;
    e.preventDefault();
    setZoom((z) => {
      const siguiente = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z - e.deltaY * 0.001).toFixed(2)));
      if (siguiente === ZOOM_MIN) setOffset({ x: 0, y: 0 });
      return siguiente;
    });
  }

  function manejarMouseDown(e: React.MouseEvent) {
    if (!esImagen || zoom <= ZOOM_MIN) return;
    e.preventDefault();
    arrastrando.current = true;
    inicioArrastre.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
  }

  function manejarMouseMove(e: React.MouseEvent) {
    if (!arrastrando.current) return;
    setOffset({
      x: inicioArrastre.current.offsetX + (e.clientX - inicioArrastre.current.x),
      y: inicioArrastre.current.offsetY + (e.clientY - inicioArrastre.current.y),
    });
  }

  function terminarArrastre() {
    arrastrando.current = false;
  }

  function manejarDobleClick() {
    setZoom(ZOOM_MIN);
    setOffset({ x: 0, y: 0 });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</Box>
        <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {(() => {
            const hrefExterno = urlExterna || url;
            return (
              hrefExterno && (
                <IconButton
                  size="small"
                  aria-label="Abrir en pestaña nueva"
                  href={hrefExterno}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={16} strokeWidth={1.5} />
                </IconButton>
              )
            );
          })()}
          <IconButton onClick={onClose} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </Box>
      </DialogTitle>
      {/* overflow:hidden aqui (04/Sep/2026, bug real: "solo se queda una
          barra de navegacion" - dos contenedores con overflow:auto
          anidados mostraban 2 scrollbars cuando con 1 bastaba) - el
          scroll real vive solo en el Box de adentro. */}
      <DialogContent dividers sx={{ p: 0, overflow: "hidden", position: "relative" }}>
        {url && (
          <>
            <Box
              sx={{
                // height fija, NO maxHeight (04/Sep/2026, revertido - un
                // maxHeight sin height no le da al hijo una altura de
                // referencia real, asi que su maxHeight:100% dejaba de
                // funcionar y el ticket ya no cabia completo). El espacio
                // en blanco sobrante se resuelve angostando el Dialog
                // (maxWidth), no encogiendo este contenedor.
                height: "80vh",
                width: "100%",
                display: "flex",
                // El centrado HORIZONTAL nunca cambia (04/Sep/2026, bug
                // real: "ahora se va a la izquierda" - cambiarlo tambien
                // al zoomear hacia flex-start causaba un salto lateral
                // brusco). Solo el vertical se ancla arriba al hacer zoom,
                // que es lo que de verdad necesitaba el scroll (crecer
                // hacia abajo, no simetrico desde el centro).
                alignItems: zoom > ZOOM_MIN ? "flex-start" : "center",
                justifyContent: "center",
                // El scroll nativo del navegador (overflow:auto) queda solo
                // como respaldo - el pan real ahora es el arrastre con
                // mouse de abajo, que mueve `offset` en vez de depender del
                // scrollbar.
                overflow: zoom > ZOOM_MIN ? "auto" : "hidden",
              }}
              onWheel={manejarWheel}
            >
              {esImagen ? (
                <Box
                  component="img"
                  src={url}
                  alt={titulo}
                  draggable={false}
                  onError={() => setEsImagen(false)}
                  onMouseDown={manejarMouseDown}
                  onMouseMove={manejarMouseMove}
                  onMouseUp={terminarArrastre}
                  onMouseLeave={terminarArrastre}
                  onDoubleClick={manejarDobleClick}
                  sx={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
                    transformOrigin: zoom > ZOOM_MIN ? "center top" : "center center",
                    cursor: zoom > ZOOM_MIN ? "grab" : "default",
                    "&:active": { cursor: zoom > ZOOM_MIN ? "grabbing" : "default" },
                    userSelect: "none",
                  }}
                />
              ) : (
                <Box
                  component="iframe"
                  src={url}
                  title={titulo}
                  sx={{
                    width: "100%",
                    height: "80vh",
                    border: 0,
                    display: "block",
                    transform: `scale(${zoom})`,
                    transformOrigin: zoom > ZOOM_MIN ? "center top" : "center center",
                  }}
                />
              )}
            </Box>
            {/* Barra flotante de zoom, centrada abajo sobre el documento -
                mismo patron visual que un visor de galeria/escaner. */}
            <Paper
              elevation={3}
              sx={{
                position: "sticky",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                width: "fit-content",
                mx: "auto",
                borderRadius: 999,
                px: 1,
                py: 0.5,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <IconButton
                  size="small"
                  aria-label="Alejar"
                  disabled={zoom <= ZOOM_MIN}
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_PASO).toFixed(2)))}
                >
                  <Minus size={16} strokeWidth={1.5} />
                </IconButton>
                <Search size={16} strokeWidth={1.5} />
                <IconButton
                  size="small"
                  aria-label="Acercar"
                  disabled={zoom >= ZOOM_MAX}
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_PASO).toFixed(2)))}
                >
                  <Plus size={16} strokeWidth={1.5} />
                </IconButton>
              </Stack>
            </Paper>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
