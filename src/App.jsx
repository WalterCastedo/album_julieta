import { useEffect, useRef, useState, useMemo } from "react";
import Modal from "react-modal";
import { supabase } from "./lib/supabase";

Modal.setAppElement("#root");

function EditorStickerModal({
  sticker,
  guardarCambiosConfirmados,
  limitarMovimiento,
  getMinZoom,
  SLOT_W,
  SLOT_H,
  onClose,
}) {
  const pinchRef = useRef(null);

  const [borrador, setBorrador] = useState({
    x: sticker.x ?? 0,
    y: sticker.y ?? 0,
    zoom: sticker.zoom ?? 1,
  });

  const SCALE = 2.5;

  function iniciarMovimiento(e) {
    const touch = e.touches?.[0];
    pinchRef.current = {
      x: touch ? touch.clientX : e.clientX,
      y: touch ? touch.clientY : e.clientY,
      startX: borrador.x,
      startY: borrador.y,
      startZoom: borrador.zoom,
    };

    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", terminar);
    window.addEventListener("touchmove", mover, { passive: false });
    window.addEventListener("touchend", terminar);
  }

  function mover(e) {
    if (!pinchRef.current) return;
    if (e.cancelable) e.preventDefault();

    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;

    const dx = (clientX - pinchRef.current.x) / SCALE;
    const dy = (clientY - pinchRef.current.y) / SCALE;

    const limitado = limitarMovimiento(
      sticker,
      pinchRef.current.startX + dx,
      pinchRef.current.startY + dy,
      pinchRef.current.startZoom,
    );

    setBorrador((prev) => ({ ...prev, x: limitado.x, y: limitado.y }));
  }

  function terminar() {
    window.removeEventListener("mousemove", mover);
    window.removeEventListener("mouseup", terminar);
    window.removeEventListener("touchmove", mover);
    window.removeEventListener("touchend", terminar);
    pinchRef.current = null;
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        style={{ width: SLOT_W * SCALE + 8, height: SLOT_H * SCALE + 8 }}
        className="bg-black rounded-2xl overflow-hidden border-4 border-white flex justify-center items-center relative touch-none shadow-2xl"
      >
        <div
          style={{
            width: SLOT_W,
            height: SLOT_H,
            transform: `scale(${SCALE})`,
          }}
          className="relative"
        >
          <div
            className="absolute inset-0 flex items-center justify-center cursor-move"
            onMouseDown={iniciarMovimiento}
            onTouchStart={iniciarMovimiento}
            style={{
              transform: `translate(${borrador.x}px, ${borrador.y}px) scale(${borrador.zoom})`,
            }}
          >
            <img
              src={sticker.image}
              draggable={false}
              className="max-w-full max-h-full object-contain select-none pointer-events-none"
            />
          </div>
        </div>
      </div>

      <div className="w-[320px] flex flex-col gap-3">
        <input
          type="range"
          min={getMinZoom(sticker)}
          max={3}
          step={0.01}
          value={borrador.zoom}
          onChange={(e) => {
            const newZoom = Number(e.target.value);
            const limit = limitarMovimiento(
              sticker,
              borrador.x,
              borrador.y,
              newZoom,
            );
            setBorrador({ zoom: newZoom, x: limit.x, y: limit.y });
          }}
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 py-3 rounded-xl font-bold text-white hover:bg-slate-600"
          >
            Cancelar
          </button>

          <button
            onClick={() => {
              guardarCambiosConfirmados(sticker.id, borrador);
              onClose();
            }}
            className="flex-1 bg-emerald-600 py-3 rounded-xl font-bold text-white hover:bg-emerald-500"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [album, setAlbum] = useState(null);
  const [paginas, setPaginas] = useState([]);
  const [stickers, setStickers] = useState([]);
  const [stickerSeleccionado, setStickerSeleccionado] = useState(null);
  const [editorSticker, setEditorSticker] = useState(null);

  const longPressRef = useRef(null);
  const isLongPressRef = useRef(false); // Ref para evitar conflictos entre click y long press

  const [menuAbiertoPagina, setMenuAbiertoPagina] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [toast, setToast] = useState("");
  const [stickersLoading, setStickersLoading] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [modalCrear, setModalCrear] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaCantidad, setNuevaCantidad] = useState(4);
  const [insertAfter, setInsertAfter] = useState("final");
  const [moviendoPagina, setMoviendoPagina] = useState(null);
  const [stickerParaIntercambiar, setStickerParaIntercambiar] = useState(null);
  const SLOT_W = 115;
  const SLOT_H = 150;

  const [configPortada, setConfigPortada] = useState({
    color: "#ffffff",
    size: 48,
    font: "sans-serif",
    vertical: "center",
    horizontal: "center",
  });

  const bookPages = useMemo(
    () => [
      { isBlankCover: true },
      { id: "portada", isPortada: true },
      ...paginas,
    ],
    [paginas],
  );

  const pendingSaveRef = useRef({});
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    const comprobarPantalla = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      setCurrentIndex((prev) => {
        if (!mobile && prev % 2 !== 0) return Math.max(0, prev - 1);
        if (mobile && prev === 0) return 1;
        return prev;
      });
    };
    comprobarPantalla();
    window.addEventListener("resize", comprobarPantalla);
    return () => window.removeEventListener("resize", comprobarPantalla);
  }, []);
  async function intercambiarStickers(paginaIdDestino, slotIdDestino) {
    if (!stickerParaIntercambiar) return;

    const cromoOrigen = stickerParaIntercambiar;
    const cromoDestino = stickers.find(
      (s) => s.pagina_id === paginaIdDestino && s.slot_id === slotIdDestino,
    );

    // 1. Actualización optimista en la UI (¡Añadimos pagina_id!)
    setStickers((prev) =>
      prev.map((s) => {
        if (s.id === cromoOrigen.id) {
          return { ...s, slot_id: slotIdDestino, pagina_id: paginaIdDestino };
        }
        if (cromoDestino && s.id === cromoDestino.id) {
          return {
            ...s,
            slot_id: cromoOrigen.slot_id,
            pagina_id: cromoOrigen.pagina_id,
          };
        }
        return s;
      }),
    );

    setStickerParaIntercambiar(null);

    // 2. Guardar en Supabase (¡Añadimos pagina_id!)
    try {
      // Movemos el origen al destino
      await supabase
        .from("stickers")
        .update({
          slot_id: slotIdDestino,
          pagina_id: paginaIdDestino, // Soluciona el bug principal
        })
        .eq("id", cromoOrigen.id);

      // Si había un cromo en el destino, lo movemos al origen
      if (cromoDestino) {
        await supabase
          .from("stickers")
          .update({
            slot_id: cromoOrigen.slot_id,
            pagina_id: cromoOrigen.pagina_id, // Soluciona el bug principal
          })
          .eq("id", cromoDestino.id);
      }

      setToast("Cromos intercambiados");
      setTimeout(() => setToast(""), 2000);
    } catch (error) {
      console.error("Error al intercambiar:", error);
      // Recargar ambas páginas involucradas si falla
      await cargarStickers([paginaIdDestino, cromoOrigen.pagina_id]);
    }
  }
  function guardarStickerEnBD(id, cambios) {
    const limpio = Object.fromEntries(
      Object.entries(cambios).filter(
        ([_, v]) => v !== undefined && !Number.isNaN(v),
      ),
    );

    pendingSaveRef.current[id] = {
      ...(pendingSaveRef.current[id] || {}),
      ...limpio,
    };

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const updates = pendingSaveRef.current;
      pendingSaveRef.current = {};

      for (const id in updates) {
        const { error } = await supabase
          .from("stickers")
          .update(updates[id])
          .eq("id", id);

        if (error) {
          console.error("Error Supabase:", error);
        }
      }
    }, 600);
  }

  useEffect(() => {
    async function init() {
      await cargarAlbum();
      const { data } = await supabase
        .from("paginas")
        .select("*")
        .order("orden", { ascending: true });
      if (!data) return;

      setPaginas(data);
      const visibles = data
        .slice(Math.max(0, currentIndex - 2), currentIndex + 4)
        .map((p) => p.id);
      cargarStickers(visibles);
    }
    init();
  }, []);

  useEffect(() => {
    if (!paginas.length) return;
    const visibles = paginas
      .slice(Math.max(0, currentIndex - 2), currentIndex + 4)
      .map((p) => p.id);
    cargarStickers(visibles);
  }, [currentIndex, paginas]);

  function guardarCambiosConfirmados(id, nuevosDatos) {
    setStickers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...nuevosDatos } : s)),
    );
    guardarStickerEnBD(id, nuevosDatos);
  }

  function limitarMovimiento(sticker, x, y, zoom) {
    let baseW = SLOT_W;
    let baseH = SLOT_H;

    if (sticker && sticker.natural_width && sticker.natural_height) {
      const scaleW = SLOT_W / sticker.natural_width;
      const scaleH = SLOT_H / sticker.natural_height;
      const containScale = Math.min(scaleW, scaleH);

      baseW = sticker.natural_width * containScale;
      baseH = sticker.natural_height * containScale;
    }

    const currentW = baseW * zoom;
    const currentH = baseH * zoom;

    const limitX = Math.max(0, (currentW - SLOT_W) / 2);
    const limitY = Math.max(0, (currentH - SLOT_H) / 2);

    return {
      x: Math.max(-limitX, Math.min(limitX, x)),
      y: Math.max(-limitY, Math.min(limitY, y)),
    };
  }

  function getMinZoom(sticker) {
    if (!sticker.natural_width || !sticker.natural_height) return 1;
    const scaleW = SLOT_W / sticker.natural_width;
    const scaleH = SLOT_H / sticker.natural_height;
    return Math.max(scaleW, scaleH) / Math.min(scaleW, scaleH);
  }

  async function cargarAlbum() {
    const { data, error } = await supabase
      .from("album")
      .select("*")
      .limit(1)
      .single();
    if (!error) setAlbum(data);
  }

  async function actualizarTitulo(titulo) {
    setAlbum((prev) => ({ ...prev, titulo }));
    await supabase.from("album").update({ titulo }).eq("id", album.id);
  }

  async function subirPortada(file) {
    if (!file) return;
    const imagen = await convertirAJPG(file, 1600, 0.7);
    const nombre = "portada-" + Date.now() + imagen.name;
    await supabase.storage.from("stickers").upload(nombre, imagen);
    const { data } = supabase.storage.from("stickers").getPublicUrl(nombre);
    await supabase
      .from("album")
      .update({ portada: data.publicUrl })
      .eq("id", album.id);
    cargarAlbum();
  }

  async function cargarPaginas() {
    const { data } = await supabase
      .from("paginas")
      .select("*")
      .order("orden", { ascending: true });
    if (!data || data.length === 0) {
      const { data: nueva } = await supabase
        .from("paginas")
        .insert({ titulo: "Mi Primera Página ❤️", cantidad_fotos: 4 })
        .select();
      setPaginas(nueva);
      return;
    }
    setPaginas(data);
  }

  async function cargarStickers(paginaIds = []) {
    let query = supabase.from("stickers").select("*");
    if (paginaIds.length > 0) {
      query = query.in("pagina_id", paginaIds);
    }
    const { data } = await query;
    if (!data) return;

    setStickers((prev) => {
      const filtrados = prev.filter((s) => !paginaIds.includes(s.pagina_id));
      return [...filtrados, ...data];
    });
  }

  async function crearPaginaConfirmada() {
    if (!nuevoNombre) {
      alert("Escribe un nombre para la hoja");
      return;
    }
    const confirmar = confirm(
      `¿Crear la hoja "${nuevoNombre}" con ${nuevaCantidad} imágenes?`,
    );
    if (!confirmar) return;

    let orden = paginas.length + 1;
    if (insertAfter === "inicio") {
      orden = 1;
      for (const p of paginas) {
        await supabase
          .from("paginas")
          .update({ orden: p.orden + 1 })
          .eq("id", p.id);
      }
    }
    if (insertAfter !== "final" && insertAfter !== "inicio") {
      const paginaBase = paginas.find((p) => p.id === Number(insertAfter));
      if (paginaBase) {
        orden = paginaBase.orden + 1;
        for (const p of paginas) {
          if (p.orden >= orden) {
            await supabase
              .from("paginas")
              .update({ orden: p.orden + 1 })
              .eq("id", p.id);
          }
        }
      }
    }

    const { error } = await supabase.from("paginas").insert({
      titulo: nuevoNombre,
      cantidad_fotos: nuevaCantidad,
      orden,
    });
    if (error) {
      console.error(error);
      return;
    }
    await cargarPaginas();
    setModalCrear(false);
    setNuevoNombre("");
    setNuevaCantidad(4);
    setInsertAfter("final");
    setToast("Página creada correctamente");
    setTimeout(() => setToast(""), 2000);
  }

  async function eliminarPagina(id) {
    const confirmar = confirm("¿Eliminar esta página y todos sus stickers?");
    if (!confirmar) return false;

    await supabase.from("stickers").delete().eq("pagina_id", id);
    await supabase.from("paginas").delete().eq("id", id);

    const { data: nuevas } = await supabase
      .from("paginas")
      .select("*")
      .order("orden", { ascending: true });
    for (let i = 0; i < nuevas.length; i++) {
      await supabase
        .from("paginas")
        .update({ orden: i + 1 })
        .eq("id", nuevas[i].id);
    }
    await cargarPaginas();
    await cargarStickers();
    const prevIndex = Math.max(
      isMobile ? 1 : 0,
      currentIndex - (isMobile ? 1 : 2),
    );
    ejecutarAnimacion(prevIndex, "prev");
    return true;
  }

  async function renombrarPagina(id) {
    const nuevoNombre = prompt("Nuevo nombre de la página:");
    if (!nuevoNombre) return;
    setPaginas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, titulo: nuevoNombre } : p)),
    );
    await supabase.from("paginas").update({ titulo: nuevoNombre }).eq("id", id);
  }

  async function moverPagina(id, nuevoOrden) {
    const paginasOrdenadas = [...paginas].sort((a, b) => a.orden - b.orden);
    const paginaActual = paginasOrdenadas.find((p) => p.id === id);
    if (!paginaActual) return;
    const ordenViejo = paginaActual.orden;

    if (ordenViejo === nuevoOrden) return;
    if (nuevoOrden > ordenViejo) {
      for (const p of paginasOrdenadas) {
        if (p.orden > ordenViejo && p.orden <= nuevoOrden) {
          await supabase
            .from("paginas")
            .update({ orden: p.orden - 1 })
            .eq("id", p.id);
        }
      }
    } else {
      for (const p of paginasOrdenadas) {
        if (p.orden < ordenViejo && p.orden >= nuevoOrden) {
          await supabase
            .from("paginas")
            .update({ orden: p.orden + 1 })
            .eq("id", p.id);
        }
      }
    }
    await supabase.from("paginas").update({ orden: nuevoOrden }).eq("id", id);
    await cargarPaginas();
  }

  async function subirFondo(file, paginaId) {
    if (!file) return;
    const imagen = await convertirAJPG(file, 1600, 0.7);
    const nombre = Date.now() + imagen.name;
    await supabase.storage.from("stickers").upload(nombre, imagen);
    const { data } = supabase.storage.from("stickers").getPublicUrl(nombre);
    await supabase
      .from("paginas")
      .update({ fondo: data.publicUrl })
      .eq("id", paginaId);
    cargarPaginas();
  }

  async function subirStickerSlot(file, paginaId, slotId) {
    const loadingKey = `${paginaId}-${slotId}`;
    setStickersLoading((prev) => ({ ...prev, [loadingKey]: true }));

    const imagen = await convertirAJPG(file, 1600, 0.7);
    const nombre = Date.now() + imagen.name;
    await supabase.storage.from("stickers").upload(nombre, imagen);
    const { data } = supabase.storage.from("stickers").getPublicUrl(nombre);

    const img = document.createElement("img");
    const urlTemp = URL.createObjectURL(imagen);
    const { naturalWidth, naturalHeight } = await new Promise((resolve) => {
      img.onload = () =>
        resolve({
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      img.src = urlTemp;
    });
    URL.revokeObjectURL(urlTemp);

    const scaleW = SLOT_W / naturalWidth;
    const scaleH = SLOT_H / naturalHeight;
    const initialZoom = Math.max(scaleW, scaleH) / Math.min(scaleW, scaleH);

    const { error } = await supabase.from("stickers").insert({
      pagina_id: paginaId,
      slot_id: slotId,
      image: data.publicUrl,
      x: 0,
      y: 0,
      zoom: initialZoom,
      natural_width: naturalWidth,
      natural_height: naturalHeight,
    });

    if (error) {
      setStickersLoading((prev) => ({ ...prev, [loadingKey]: false }));
      console.error("ERROR INSERT STICKER:", error);
      alert(error.message);
      return;
    }
    await cargarStickers([paginaId]);
    setStickersLoading((prev) => ({ ...prev, [loadingKey]: false }));
  }

  async function eliminarSticker(id) {
    const confirmar = confirm("¿Eliminar este cromo del álbum?");
    if (!confirmar) return;
    await supabase.from("stickers").delete().eq("id", id);
    setStickers((prev) => prev.filter((s) => s.id !== id));
    setToast("Cromo eliminado");
    setTimeout(() => {
      setToast("");
    }, 2000);
  }
  async function intercambiarStickers(paginaIdDestino, slotIdDestino) {
    if (!stickerParaIntercambiar) return;

    const cromoOrigen = stickerParaIntercambiar;
    const cromoDestino = stickers.find(
      (s) => s.pagina_id === paginaIdDestino && s.slot_id === slotIdDestino,
    );

    // 1. Actualización optimista en la UI (¡Añadimos pagina_id!)
    setStickers((prev) =>
      prev.map((s) => {
        if (s.id === cromoOrigen.id) {
          return { ...s, slot_id: slotIdDestino, pagina_id: paginaIdDestino };
        }
        if (cromoDestino && s.id === cromoDestino.id) {
          return {
            ...s,
            slot_id: cromoOrigen.slot_id,
            pagina_id: cromoOrigen.pagina_id,
          };
        }
        return s;
      }),
    );

    setStickerParaIntercambiar(null);

    // 2. Guardar en Supabase (¡Añadimos pagina_id!)
    try {
      // Movemos el origen al destino
      await supabase
        .from("stickers")
        .update({
          slot_id: slotIdDestino,
          pagina_id: paginaIdDestino,
        })
        .eq("id", cromoOrigen.id);

      // Si había un cromo en el destino, lo movemos al origen
      if (cromoDestino) {
        await supabase
          .from("stickers")
          .update({
            slot_id: cromoOrigen.slot_id,
            pagina_id: cromoOrigen.pagina_id,
          })
          .eq("id", cromoDestino.id);
      }

      setToast("Cromos intercambiados");
      setTimeout(() => setToast(""), 2000);
    } catch (error) {
      console.error("Error al intercambiar:", error);
      // Recargar ambas páginas involucradas si falla
      await cargarStickers([paginaIdDestino, cromoOrigen.pagina_id]);
    }
  }
  function convertirAJPG(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement("img");
        img.src = e.target.result;
        let done = false;
        img.onload = () => {
          if (done) return;
          done = true;
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, maxWidth / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(null);
              const name = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
              resolve(new File([blob], name, { type: "image/jpeg" }));
            },
            "image/jpeg",
            quality,
          );
        };
        img.onerror = () => {
          if (done) return;
          done = true;
          resolve(null);
        };
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  const agruparCromos = (slots) => {
    const n = slots.length;
    if (n === 1) return [slots];
    if (n === 2) return [[slots[0]], [slots[1]]];
    if (n === 3) return [[slots[0]], [slots[1], slots[2]]];
    if (n === 4) return [slots.slice(0, 2), slots.slice(2, 4)];
    if (n === 5) return [slots.slice(0, 2), slots.slice(2, 5)];
    if (n === 6)
      return [slots.slice(0, 2), slots.slice(2, 4), slots.slice(4, 6)];
    if (n === 7)
      return [slots.slice(0, 2), slots.slice(2, 4), slots.slice(4, 7)];
    if (n === 8)
      return [slots.slice(0, 2), slots.slice(2, 5), slots.slice(5, 8)];
    if (n === 9)
      return [slots.slice(0, 3), slots.slice(3, 6), slots.slice(6, 9)];
    return [slots];
  };

  const ejecutarAnimacion = (newIndex, dir) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setDirection(dir);
    setCurrentIndex(newIndex);
    setTimeout(() => {
      setIsAnimating(false);
      setDirection("");
    }, 600);
  };

  const handleNext = () => {
    const maxIndex = isMobile
      ? bookPages.length - 1
      : Math.ceil(bookPages.length / 2) * 2 - 2;
    if (currentIndex >= maxIndex) return;
    const newIndex = Math.min(maxIndex, currentIndex + (isMobile ? 1 : 2));
    ejecutarAnimacion(newIndex, "next");
  };

  const handlePrev = () => {
    if (currentIndex <= (isMobile ? 1 : 0)) return;
    const newIndex = Math.max(
      isMobile ? 1 : 0,
      currentIndex - (isMobile ? 1 : 2),
    );
    ejecutarAnimacion(newIndex, "prev");
  };

  const paginaIzquierda = bookPages[currentIndex];
  const paginaDerecha = isMobile ? null : bookPages[currentIndex + 1];

  const isViewingCover = paginaIzquierda?.isPortada || paginaDerecha?.isPortada;
  const isMenuLeftOpen = menuAbiertoPagina === paginaIzquierda?.id;
  const isMenuRightOpen = !isMobile && menuAbiertoPagina === paginaDerecha?.id;

  const stickersMap = useMemo(() => {
    const map = {};
    for (const s of stickers) {
      map[`${s.pagina_id}-${s.slot_id}`] = s;
    }
    return map;
  }, [stickers]);

  const renderItem = (item, isLeftPage) => {
    if (!item || item.isBlankCover) {
      return (
        <div className="absolute inset-0 z-0 bg-slate-800 flex items-center justify-center border-slate-700 border-8 overflow-hidden book-texture rounded-[inherit]">
          <div className="absolute inset-0 bg-black/40" />
        </div>
      );
    }

    if (item.isPortada) {
      return (
        <>
          <div className="absolute inset-0 z-0 bg-black overflow-hidden rounded-[inherit] border-slate-700 border-r-4">
            {album?.portada ? (
              <img
                loading="lazy"
                decoding="async"
                src={album.portada}
                alt="Portada"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                <span className="text-8xl">📖</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/20 pointer-events-none" />
          </div>

          <div
            className="absolute inset-0 flex p-6 pointer-events-none z-10"
            style={{
              justifyContent:
                configPortada.horizontal === "left"
                  ? "flex-start"
                  : configPortada.horizontal === "center"
                    ? "center"
                    : "flex-end",
              alignItems:
                configPortada.vertical === "top"
                  ? "flex-start"
                  : configPortada.vertical === "center"
                    ? "center"
                    : "flex-end",
            }}
          >
            <textarea
              value={album?.titulo || ""}
              onChange={(e) => actualizarTitulo(e.target.value)}
              rows={3}
              style={{
                color: configPortada.color,
                fontSize: `clamp(24px, ${configPortada.size / 10}vw, ${configPortada.size}px)`,
                fontFamily: configPortada.font,
                lineHeight: 1.1,
                textAlign: configPortada.horizontal,
              }}
              className="pointer-events-auto bg-transparent resize-none outline-none font-black max-w-[100%] min-w-[120px]"
            />
          </div>
        </>
      );
    }

    return (
      <>
        <div className="absolute inset-0 z-0 overflow-hidden rounded-[inherit] bg-slate-900">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: item.fondo
                ? `linear-gradient(rgba(15, 23, 42, 0.15), rgba(15, 23, 42, 0.5)), url("${item.fondo}")`
                : "radial-gradient(circle at center, #1e293b 1.2px, transparent 1.2px)",
              backgroundSize: item.fondo ? "cover" : "24px 24px",
              backgroundPosition: "center",
              backgroundRepeat: item.fondo ? "no-repeat" : "repeat",
            }}
          />
        </div>

        <div className="relative z-10 w-full h-full pb-6 select-none flex flex-col justify-between">
          <div
            className={`relative z-[100] w-full flex justify-between items-center bg-slate-950/90 backdrop-blur-md px-4 py-2 border-b border-white/10 shrink-0 ${isLeftPage ? "flex-row" : "flex-row-reverse"}`}
          >
            <div
              className={`flex flex-col min-w-0 ${isLeftPage ? "items-start text-left" : "items-end text-right"}`}
            >
              <span className="text-[12px] md:text-sm font-black tracking-wide text-slate-100 truncate max-w-[150px] md:max-w-[200px]">
                {item.titulo}
              </span>
            </div>

            <div className="relative z-[99999]">
              <button
                onClick={() =>
                  setMenuAbiertoPagina(
                    menuAbiertoPagina === item.id ? null : item.id,
                  )
                }
                className="bg-slate-800 hover:bg-slate-700 px-2 py-1.5 rounded-xl text-[10px] font-bold border border-slate-600 text-slate-200 flex items-center gap-1 transition-all active:scale-95 shadow-sm"
              >
                ⚙️ Opciones
              </button>

              {menuAbiertoPagina === item.id && (
                <div
                  className={`absolute top-full mt-2 w-44 bg-slate-950/95 border border-slate-700 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.9)] z-[99999] py-1 backdrop-blur-xl ${isLeftPage ? "right-0" : "left-0"}`}
                >
                  <button
                    onClick={() => {
                      renombrarPagina(item.id);
                      setMenuAbiertoPagina(null);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-300"
                  >
                    ✏️ Renombrar Hoja
                  </button>
                  <label className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 cursor-pointer block">
                    🖼️ Cambiar Fondo{" "}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        subirFondo(e.target.files?.[0], item.id);
                        setMenuAbiertoPagina(null);
                      }}
                    />
                  </label>
                  <div className="border-t border-slate-800 my-1" />
                  <div className="px-3 py-2 border-b border-slate-800 flex flex-col gap-2">
                    <select
                      value={
                        moviendoPagina?.id === item.id
                          ? moviendoPagina.destino
                          : ""
                      }
                      onChange={(e) =>
                        setMoviendoPagina({
                          id: item.id,
                          destino: e.target.value,
                        })
                      }
                      className="w-full bg-slate-800 text-white text-xs rounded px-2 py-2"
                    >
                      <option value="">Seleccionar destino</option>
                      <option value="inicio">Al inicio</option>
                      {paginas
                        .filter((p) => p.id !== item.id)
                        .sort((a, b) => a.orden - b.orden)
                        .map((p) => (
                          <option key={p.id} value={p.orden}>
                            Después de: {p.titulo}
                          </option>
                        ))}
                    </select>

                    <button
                      disabled={
                        !moviendoPagina ||
                        moviendoPagina.id !== item.id ||
                        !moviendoPagina.destino
                      }
                      onClick={async () => {
                        if (!moviendoPagina || moviendoPagina.id !== item.id)
                          return;
                        let nuevoOrden =
                          moviendoPagina.destino === "inicio"
                            ? 1
                            : Number(moviendoPagina.destino) + 1;
                        if (!confirm("¿Mover esta hoja?")) return;
                        await moverPagina(item.id, nuevoOrden);
                        setMoviendoPagina(null);
                        setMenuAbiertoPagina(null);
                        setToast("Hoja movida");
                        setTimeout(() => setToast(""), 2000);
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded px-2 py-2 font-bold"
                    >
                      Confirmar movimiento
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      const eliminado = await eliminarPagina(item.id);
                      if (!eliminado) return;
                      setMenuAbiertoPagina(null);
                      setToast("Hoja eliminada");
                      setTimeout(() => setToast(""), 2000);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-red-900/50 text-red-400 font-medium"
                  >
                    🗑️ Eliminar Hoja
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="w-full h-full flex-1 flex flex-col justify-start items-center mt-2 content-center p-2 relative z-10 overflow-y-auto overflow-x-hidden custom-scrollbar">
            <div className="w-full flex flex-col justify-center items-center gap-3 h-full">
              {agruparCromos(
                Array.from(
                  { length: Math.min(item.cantidad_fotos || 6, 9) },
                  (_, i) => i + 1,
                ),
              ).map((fila, indexFila) => (
                <div
                  key={`fila-${indexFila}`}
                  className="flex flex-row justify-center items-center gap-3 w-full"
                >
                  {fila.map((slotId) => {
                    const sticker = stickersMap[`${item.id}-${slotId}`];
                    const ocupado = !!sticker;
                    const loadingKey = `${item.id}-${slotId}`;
                    const cargando = stickersLoading[loadingKey];
                    const esEspecial = slotId % 2 === 0;

                    return (
                      <div
                        key={slotId}
                        className={`slot-physical relative ${
                          stickerParaIntercambiar &&
                          stickerParaIntercambiar.id === sticker?.id
                            ? "ring-4 ring-pink-500 animate-pulse scale-105 z-50"
                            : stickerParaIntercambiar
                              ? "cursor-pointer hover:ring-4 ring-blue-400 ring-2 ring-blue-400/30" // Le añadí un ring suave permanente para que se note dónde puedes soltar
                              : ""
                        }`}
                        onClick={(e) => {
                          // LÓGICA DE INTERCAMBIO vs VISUALIZACIÓN
                          if (stickerParaIntercambiar) {
                            e.stopPropagation();

                            // Si toca el MISMO cromo, cancelamos el intercambio
                            if (stickerParaIntercambiar.id === sticker?.id) {
                              setStickerParaIntercambiar(null);
                              setToast(""); // <--- ¡AQUÍ ESTÁ LA MAGIA! Borramos el cartel
                            } else {
                              // Si toca un espacio diferente, hacemos el intercambio
                              intercambiarStickers(item.id, slotId);
                            }
                          } else if (!isLongPressRef.current && ocupado) {
                            // Comportamiento normal (abrir visualizador)
                            setStickerSeleccionado(sticker);
                          }
                        }}
                      >
                        <div className="w-full h-full relative">
                          {/* Input de archivo SOLO si no estamos intercambiando y está vacío */}
                          {!sticker && !stickerParaIntercambiar && (
                            <label className="absolute inset-0 z-20 cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  await subirStickerSlot(file, item.id, slotId);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}

                          <div
                            className={`w-full h-full transition-all duration-300 relative rounded-xl overflow-hidden flex items-center justify-center border-2 ${
                              ocupado
                                ? "border-white bg-white shadow-lg shadow-black/80"
                                : esEspecial
                                  ? "border-dashed border-amber-400/50 bg-amber-500/10"
                                  : "border-dashed border-slate-600 bg-slate-950/80"
                            }`}
                          >
                            {cargando ? (
                              <div className="w-full h-full flex items-center justify-center bg-slate-900">
                                <div className="sticker-loading-card">
                                  <div className="shine"></div>
                                </div>
                              </div>
                            ) : ocupado ? (
                              <div
                                className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center cursor-pointer"
                                onMouseDown={() => {
                                  if (stickerParaIntercambiar) return;
                                  isLongPressRef.current = false;
                                  longPressRef.current = setTimeout(() => {
                                    isLongPressRef.current = true;
                                    setEditorSticker(sticker);
                                  }, 500);
                                }}
                                onMouseUp={() =>
                                  clearTimeout(longPressRef.current)
                                }
                                onMouseLeave={() =>
                                  clearTimeout(longPressRef.current)
                                }
                                onTouchStart={() => {
                                  if (stickerParaIntercambiar) return;
                                  isLongPressRef.current = false;
                                  longPressRef.current = setTimeout(() => {
                                    isLongPressRef.current = true;
                                    setEditorSticker(sticker);
                                  }, 500);
                                }}
                                onTouchEnd={() =>
                                  clearTimeout(longPressRef.current)
                                }
                                // ¡AQUÍ BORRAMOS EL ONCLICK VIEJO QUE CAUSABA EL CONFLICTO!
                              >
                                {/* CONTENEDOR LÓGICO */}
                                {/* CONTENEDOR LÓGICO */}{" "}
                                <div className="slot-logical absolute flex items-center justify-center">
                                  <div
                                    className="absolute inset-0 flex items-center justify-center"
                                    style={{
                                      transform: `translate(${sticker.x ?? 0}px, ${sticker.y ?? 0}px) scale(${sticker.zoom ?? 1})`,
                                      transformOrigin: "center",
                                    }}
                                  >
                                    <img
                                      loading="lazy"
                                      decoding="async"
                                      src={sticker.image}
                                      draggable={false}
                                      className="max-w-full max-h-full object-contain select-none pointer-events-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center select-none text-center p-0.5 opacity-80">
                                <span
                                  className={`text-[8px] md:text-[9px] font-mono tracking-tighter uppercase font-bold ${esEspecial ? "text-amber-400" : "text-slate-500"}`}
                                >
                                  {esEspecial ? "★ BRILL" : "CROMO"}
                                </span>
                                <span
                                  className={`text-xl md:text-3xl font-black tracking-tighter font-mono ${esEspecial ? "text-amber-300" : "text-slate-600"}`}
                                >
                                  {slotId < 10 ? `0${slotId}` : slotId}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div
            className={`absolute bottom-2 ${isLeftPage ? "left-4" : "right-4"} text-[10px] font-mono text-white/50 font-bold z-0 pointer-events-none`}
          >
            {item.titulo ? `PÁG. ${bookPages.indexOf(item)}` : ""}
          </div>
        </div>
      </>
    );
  };
  const stickersDePagina = stickerSeleccionado
    ? stickers
        .filter((s) => s.pagina_id === stickerSeleccionado.pagina_id)
        .sort((a, b) => a.slot_id - b.slot_id)
    : [];

  const indexStickerActual = stickerSeleccionado
    ? stickersDePagina.findIndex((s) => s.id === stickerSeleccionado.id)
    : -1;
  const paginaDelSticker = stickerSeleccionado
    ? paginas.find((p) => p.id === stickerSeleccionado.pagina_id)
    : null;

  const numPaginaDelSticker = stickerSeleccionado
    ? bookPages.findIndex((p) => p.id === stickerSeleccionado.pagina_id)
    : -1;
  return (
    <div className="min-h-screen bg-slate-950 text-white p-1 md:p-3 font-sans selection:bg-pink-500 overflow-y-auto overflow-x-hidden real-album-body flex flex-col">
      {toast && (
        <div className="fixed inset-0 flex items-center justify-center z-[99999] pointer-events-none">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl text-lg font-bold animate-pulse">
            {toast}
          </div>
        </div>
      )}
      <header className="max-w-5xl mx-auto text-center mb-2 select-none z-50">
        <span className="inline-block bg-gradient-to-r from-pink-500/10 to-amber-500/10 text-pink-400 text-[10px] md:text-xs font-bold tracking-widest uppercase px-3 py-0.5 rounded-full border border-pink-500/20 shadow-sm">
          Mi Álbum Virtual
        </span>
        <div className="flex flex-col items-center gap-3 mt-2">
          <input
            type="text"
            value={album?.titulo || ""}
            disabled
            placeholder="Título del álbum"
            className="bg-transparent text-center text-xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-pink-400 via-rose-300 to-amber-300 bg-clip-text text-transparent outline-none border-b border-pink-500/20 px-2 py-1 max-w-[90vw]"
          />
        </div>
      </header>

      <div className="w-full max-w-[1200px] mx-auto mb-3 min-h-[70px] relative flex items-center justify-center z-50">
        <div
          className={`absolute inset-0 bg-slate-900/95 border border-slate-700 rounded-2xl px-3 py-2 backdrop-blur-xl shadow-xl flex flex-nowrap items-center justify-start md:justify-center gap-3 w-full overflow-x-auto custom-scrollbar transition-all duration-300 ${isViewingCover ? "opacity-100 visible translate-y-0 z-10" : "opacity-0 invisible pointer-events-none -translate-y-4 -z-10"}`}
        >
          <input
            type="text"
            value={album?.titulo || ""}
            onChange={(e) => actualizarTitulo(e.target.value)}
            placeholder="Título del álbum"
            className="bg-slate-950 text-white px-3 py-1.5 rounded-xl text-sm outline-none border border-slate-700 shrink-0 w-[140px] sm:w-[150px]"
          />
          <label className="cursor-pointer bg-pink-600 hover:bg-pink-500 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0">
            Cambiar portada{" "}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => subirPortada(e.target.files?.[0])}
            />
          </label>
          <input
            type="color"
            value={configPortada.color}
            onChange={(e) =>
              setConfigPortada((prev) => ({ ...prev, color: e.target.value }))
            }
            className="w-8 h-8 rounded cursor-pointer shrink-0"
          />
          <input
            type="range"
            min="20"
            max="90"
            value={configPortada.size}
            onChange={(e) =>
              setConfigPortada((prev) => ({
                ...prev,
                size: Number(e.target.value),
              }))
            }
            className="w-[70px] shrink-0"
          />
          <select
            value={configPortada.font}
            onChange={(e) =>
              setConfigPortada((prev) => ({ ...prev, font: e.target.value }))
            }
            className="bg-slate-950 px-2 py-1.5 rounded text-xs shrink-0"
          >
            <option value="sans-serif">Sans</option>
            <option value="serif">Serif</option>
            <option value="monospace">Mono</option>
            <option value="cursive">Cursive</option>
          </select>
          <select
            value={configPortada.vertical}
            onChange={(e) =>
              setConfigPortada((prev) => ({
                ...prev,
                vertical: e.target.value,
              }))
            }
            className="bg-slate-950 px-2 py-1.5 rounded text-xs shrink-0"
          >
            <option value="top">Arriba</option>
            <option value="center">Centro</option>
            <option value="bottom">Abajo</option>
          </select>
          <select
            value={configPortada.horizontal}
            onChange={(e) =>
              setConfigPortada((prev) => ({
                ...prev,
                horizontal: e.target.value,
              }))
            }
            className="bg-slate-950 px-2 py-1.5 rounded text-xs shrink-0"
          >
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
        </div>

        <div
          className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${!isViewingCover ? "opacity-100 visible translate-y-0" : "opacity-0 invisible pointer-events-none -translate-y-4"}`}
        >
          <button
            onClick={() => setModalCrear(true)}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 rounded-xl"
          >
            Nueva Hoja
          </button>
        </div>
      </div>

      <div className="w-full max-w-[1100px] mx-auto flex flex-row items-center justify-center my-0 px-1 sm:px-12 relative min-h-[75vh] md:min-h-[600px] perspective-container">
        {(isMobile ? currentIndex > 1 : currentIndex > 0) && (
          <button
            onClick={handlePrev}
            disabled={isAnimating}
            className="absolute left-1 sm:left-0 top-1/2 -translate-y-1/2 z-[9999] w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-3xl font-light shadow-2xl border border-slate-600 transition-all disabled:opacity-50"
          >
            ‹
          </button>
        )}

        <div
          className={`w-full flex ${isMobile ? "max-w-[420px] flex-col" : "max-w-[1000px] flex-row"} h-[75vh] md:h-[650px] relative mx-auto rounded-xl shadow-[0_30px_60px_rgba(0,0,0,0.9)]`}
        >
          {!isMobile && (
            <div className="absolute left-1/2 top-0 bottom-0 w-24 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/60 to-transparent z-[1000] pointer-events-none mix-blend-multiply" />
          )}

          <div
            className={`h-full relative ${isMobile ? "w-full rounded-xl border border-slate-700" : "w-1/2 rounded-l-xl border-y border-l border-slate-700 shadow-[inset_-25px_0_40px_rgba(0,0,0,0.6)]"} ${isMenuLeftOpen ? "z-[999]" : "z-20"} ${direction === "prev" ? (isMobile ? "mobile-turn-uniform" : "page-turn-prev") : direction === "next" ? (isMobile ? "mobile-turn-uniform" : "page-fade-in") : ""}`}
          >
            {renderItem(paginaIzquierda, true)}
          </div>

          {!isMobile && (
            <div
              className={`h-full w-1/2 relative rounded-r-xl border-y border-r border-slate-700 shadow-[inset_25px_0_40px_rgba(0,0,0,0.6)] ${isMenuRightOpen ? "z-[999]" : "z-10"} ${direction === "next" ? "page-turn-next" : direction === "prev" ? "page-fade-in" : ""}`}
            >
              {renderItem(paginaDerecha, false)}
            </div>
          )}
        </div>

        {(isMobile
          ? currentIndex < bookPages.length - 1
          : currentIndex < bookPages.length - 2) && (
          <button
            onClick={handleNext}
            disabled={isAnimating}
            className="absolute right-1 sm:right-0 top-1/2 -translate-y-1/2 z-[9999] w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-3xl font-light shadow-2xl border border-slate-600 transition-all disabled:opacity-50"
          >
            ›
          </button>
        )}
      </div>

      <footer className="text-center py-4 text-[11px] text-slate-500 font-medium tracking-wide z-50">
        Álbum Virtual • Diseñado por wjcs
      </footer>

      <Modal
        isOpen={!!stickerSeleccionado}
        onRequestClose={() => setStickerSeleccionado(null)}
        shouldCloseOnOverlayClick={true}
        style={{
          overlay: {
            background: "rgba(2, 6, 23, 0.92)",
            backdropFilter: "blur(12px)",
            zIndex: 99999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          },
          content: {
            background: "transparent",
            border: "none",
            inset: "auto",
            padding: 0,
            overflow: "visible",
            width: "100%",
            maxWidth: "600px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          },
        }}
      >
        {stickerSeleccionado && (
          <div className="flex flex-col items-center gap-4 w-full animate-in fade-in zoom-in-90 duration-300 px-4 sm:px-8">
            {/* Encabezado: Título y Número de Página */}
            <div className="text-center flex flex-col items-center mb-2 pointer-events-none">
              <h3 className="text-white text-xl md:text-3xl font-black tracking-tight drop-shadow-lg">
                {paginaDelSticker?.titulo}
              </h3>
              <span className="text-white/60 text-[10px] md:text-xs font-mono font-bold tracking-widest uppercase mt-1 bg-white/10 px-3 py-1 rounded-full border border-white/10 shadow-sm">
                PÁGINA {numPaginaDelSticker}
              </span>
            </div>

            {/* Contenedor Principal de Navegación e Imagen */}
            <div className="relative flex items-center justify-center w-full group">
              {/* Botón Anterior */}
              {indexStickerActual > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setStickerSeleccionado(
                      stickersDePagina[indexStickerActual - 1],
                    );
                  }}
                  className="absolute left-0 sm:-left-4 z-50 bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md active:scale-90 text-white w-12 h-12 flex items-center justify-center rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-white/20 transition-all focus:outline-none"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
              )}

              {/* Tarjeta del Cromo */}
              <div
                className="relative p-2 sm:p-3 bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 transition-transform duration-300 hover:scale-[1.02]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-2 bg-white rounded-2xl shadow-inner relative overflow-hidden">
                  <img
                    loading="lazy"
                    decoding="async"
                    src={stickerSeleccionado.image}
                    className="max-h-[45vh] md:max-h-[55vh] object-contain rounded-xl pointer-events-none select-none"
                    alt="Cromo ampliado"
                  />
                </div>

                {/* Etiqueta de posición */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] sm:text-xs font-bold px-4 py-1.5 rounded-full border border-slate-700 shadow-xl font-mono tracking-widest whitespace-nowrap z-10">
                  {indexStickerActual + 1} / {stickersDePagina.length}
                </div>
              </div>

              {/* Botón Siguiente */}
              {indexStickerActual < stickersDePagina.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setStickerSeleccionado(
                      stickersDePagina[indexStickerActual + 1],
                    );
                  }}
                  className="absolute right-0 sm:-right-4 z-50 bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md active:scale-90 text-white w-12 h-12 flex items-center justify-center rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-white/20 transition-all focus:outline-none"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              )}
            </div>

            {/* Controles de Acción */}
            <div
              className="grid grid-cols-2 sm:flex sm:flex-row gap-3 w-full justify-center mt-6"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setStickerParaIntercambiar(stickerSeleccionado);
                  setStickerSeleccionado(null);
                  setToast("Selecciona el espacio de destino");
                }}
                className="flex items-center justify-center gap-2 bg-purple-600/90 hover:bg-purple-500 backdrop-blur-sm active:scale-95 px-4 py-3 rounded-2xl font-bold text-sm shadow-xl border border-purple-400/30 text-white transition-all"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m16 3 4 4-4 4" />
                  <path d="M20 7H4" />
                  <path d="m8 21-4-4 4-4" />
                  <path d="M4 17h16" />
                </svg>
                <span>Mover</span>
              </button>
              <button
                onClick={() => {
                  setEditorSticker(stickerSeleccionado);
                  setStickerSeleccionado(null);
                }}
                className="flex items-center justify-center gap-2 bg-blue-600/90 hover:bg-blue-500 backdrop-blur-sm active:scale-95 px-4 py-3 rounded-2xl font-bold text-sm shadow-xl border border-blue-400/30 text-white transition-all"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                <span>Ajustar</span>
              </button>

              <button
                onClick={async () => {
                  await eliminarSticker(stickerSeleccionado.id);
                  setStickerSeleccionado(null);
                }}
                className="flex items-center justify-center gap-2 bg-rose-600/90 hover:bg-rose-500 backdrop-blur-sm active:scale-95 px-4 py-3 rounded-2xl font-bold text-sm shadow-xl border border-rose-400/30 text-white transition-all"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                <span>Despegar</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    const response = await fetch(stickerSeleccionado.image);
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `cromo-${stickerSeleccionado.id}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error("Error al descargar:", error);
                  }
                }}
                className="flex items-center justify-center gap-2 bg-emerald-600/90 hover:bg-emerald-500 backdrop-blur-sm active:scale-95 px-4 py-3 rounded-2xl font-bold text-sm shadow-xl border border-emerald-400/30 text-white transition-all col-span-1 sm:col-span-1"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                <span>Descargar</span>
              </button>
            </div>

            {/* BOTÓN DE CERRAR EXPLÍCITO */}
            <button
              onClick={() => setStickerSeleccionado(null)}
              className="mt-2 mb-4 flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700 active:scale-95 px-5 py-2.5 rounded-xl font-medium text-sm shadow-lg border border-slate-600 text-slate-200 transition-all"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              <span>Cerrar</span>
            </button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={modalCrear}
        onRequestClose={() => setModalCrear(false)}
        style={{
          overlay: { background: "rgba(0,0,0,0.85)" },
          content: {
            inset: 0,
            background: "transparent",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        }}
      >
        <div className="bg-slate-900 p-6 rounded-2xl w-[300px] flex flex-col gap-3 border border-slate-700">
          <h2 className="text-lg font-bold text-center">Nueva Hoja</h2>
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nombre de la hoja"
            className="px-3 py-2 rounded bg-slate-800 outline-none"
          />
          <select
            value={nuevaCantidad}
            onChange={(e) => setNuevaCantidad(Number(e.target.value))}
            className="px-3 py-2 rounded bg-slate-800"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n} imágenes
              </option>
            ))}
          </select>
          <select
            value={insertAfter}
            onChange={(e) => setInsertAfter(e.target.value)}
            className="px-3 py-2 rounded bg-slate-800"
          >
            <option value="inicio">Al inicio</option>
            {paginas.map((p) => (
              <option key={p.id} value={p.id}>
                Después de: {p.titulo}
              </option>
            ))}
          </select>
          <div className="flex gap-2 justify-end mt-2">
            <button
              onClick={() => setModalCrear(false)}
              className="px-3 py-2 bg-slate-700 rounded"
            >
              Cancelar
            </button>
            <button
              onClick={crearPaginaConfirmada}
              className="px-3 py-2 bg-emerald-600 rounded"
            >
              Crear
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!editorSticker}
        onRequestClose={() => setEditorSticker(null)}
        style={{
          overlay: {
            background: "rgba(0,0,0,0.92)",
            zIndex: 99999,
            backdropFilter: "blur(8px)",
          },
          content: {
            inset: 0,
            border: "none",
            background: "transparent",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          },
        }}
      >
        {editorSticker && (
          <EditorStickerModal
            sticker={stickers.find((s) => s.id === editorSticker.id)}
            guardarCambiosConfirmados={guardarCambiosConfirmados}
            limitarMovimiento={limitarMovimiento}
            getMinZoom={getMinZoom}
            SLOT_W={SLOT_W}
            SLOT_H={SLOT_H}
            onClose={() => setEditorSticker(null)}
          />
        )}
      </Modal>

      <style>{`
        /* --- CLASES MÁGICAS AÑADIDAS AQUÍ PARA UNIFICAR ESCALAS --- */
        .slot-physical {
          width: 85px;
          aspect-ratio: 115 / 150;
          --slot-scale: 0.73913;
        }
        @media (min-width: 640px) {
          .slot-physical {
            width: 100px;
            --slot-scale: 0.86956;
          }
        }
        @media (min-width: 768px) {
          .slot-physical {
            width: 115px;
            --slot-scale: 1;
          }
        }
        .slot-logical {
          width: 115px;
          height: 150px;
          transform: scale(var(--slot-scale));
          transform-origin: center;
          flex-shrink: 0;
        }
        /* -------------------------------------------------------- */

        .real-album-body { background-color: #020617; background-image: radial-gradient(circle at 1px 1px, #1e293b 1px, transparent 0); background-size: 24px 24px; }
        .book-texture { background-image: repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000), repeating-linear-gradient(45deg, #000 25%, #1e293b 25%, #1e293b 75%, #000 75%, #000); background-position: 0 0, 10px 10px; background-size: 20px 20px; }
        .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.15); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.3); }
        .perspective-container { perspective: 2500px; }
        .page-turn-next { transform-origin: left center; animation: flipNext 0.6s cubic-bezier(0.25, 0.8, 0.25, 1) forwards; backface-visibility: hidden; z-index: 50; }
        .page-turn-prev { transform-origin: right center; animation: flipPrev 0.6s cubic-bezier(0.25, 0.8, 0.25, 1) forwards; backface-visibility: hidden; z-index: 50; }
        .page-fade-in { animation: staticFade 0.5s ease-in-out forwards; }
        .mobile-turn-uniform { transform-origin: center; animation: mobileFlipUniform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards; }
        @keyframes flipNext { 0% { transform: rotateY(90deg) scale(0.98); filter: brightness(0.3); opacity: 0.5; } 100% { transform: rotateY(0deg) scale(1); filter: brightness(1); opacity: 1; } }
        @keyframes flipPrev { 0% { transform: rotateY(-90deg) scale(0.98); filter: brightness(0.3); opacity: 0.5; } 100% { transform: rotateY(0deg) scale(1); filter: brightness(1); opacity: 1; } }
        @keyframes staticFade { 0% { filter: brightness(0.5); } 100% { filter: brightness(1); } }
        @keyframes mobileFlipUniform { 0% { transform: rotateY(90deg) scale(0.95); opacity: 0; filter: blur(2px); } 100% { transform: rotateY(0deg) scale(1); opacity: 1; filter: blur(0); } }
        img { -webkit-user-drag: none; user-drag: none; }
        .sticker-loading-card { width: 85%; height: 85%; border-radius: 14px; background: linear-gradient(135deg, #0f172a, #1e293b, #334155); border: 2px solid rgba(255,255,255,0.15); position: relative; overflow: hidden; animation: stickerEnter 0.7s cubic-bezier(.2,.8,.2,1), stickerFloat 2s ease-in-out infinite; box-shadow: 0 15px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1); }
        .sticker-loading-card .shine { position: absolute; inset: -50%; background: linear-gradient(120deg, transparent, rgba(255,255,255,0.25), transparent); animation: stickerShine 1.2s linear infinite; }
        @keyframes stickerEnter { 0% { transform: scale(0.2) rotate(-25deg) translateY(80px); opacity: 0; filter: blur(8px); } 60% { transform: scale(1.08) rotate(4deg) translateY(-4px); opacity: 1; filter: blur(0); } 100% { transform: scale(1) rotate(0deg) translateY(0); } }
        @keyframes stickerFloat { 0% { transform: translateY(0px); } 50% { transform: translateY(-4px); } 100% { transform: translateY(0px); } }
        @keyframes stickerShine { 0% { transform: translateX(-120%) rotate(20deg); } 100% { transform: translateX(120%) rotate(20deg); } }
        .touch-none { touch-action: none; }
      `}</style>
    </div>
  );
}
