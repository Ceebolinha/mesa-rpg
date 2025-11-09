import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Mesa Compartilhada — Cenas & NPCs (versão estável)
 * - Cenas: cabem sempre na área (object-contain), sem cortar.
 * - NPCs: aparecem/ somem com fade; podem tremer (sutil); dá pra arrastar e redimensionar.
 * - Demo: salva em localStorage + sincroniza entre abas da MESMA máquina via BroadcastChannel.
 * - Opcional Firebase: deixei ganchos, mas pode usar só o Demo enquanto testa.
 */

/*************** CONFIG (Firebase opcional – pode deixar vazio) ***************/
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBcoqQL7Cv-iiEE1_i8xeIcEuzaC2rSxsE",
  authDomain: "mesa-rpg-8a4b9.firebaseapp.com",
  databaseURL: "https://mesa-rpg-8a4b9-default-rtdb.firebaseio.com",
  projectId: "mesa-rpg-8a4b9",
  storageBucket: "mesa-rpg-8a4b9.firebasestorage.app",
  messagingSenderId: "196938820959",
  appId: "1:196938820959:web:8e2f8ac490f152ff465aea"
};

/**************************** UTILS ****************************/
const uid = () => Math.random().toString(36).slice(2, 9);

const defaultState = () => ({
  scenes: [],
  npcs: [],
  currentSceneId: null,
  // overlay: por NPC (id): { visible, x, y, scale }
  overlay: {},
  options: { fadeDurationMs: 450, npcShake: true, showGrid: false },
});

const STORAGE_KEY = "mesa-compartilhada-state";

/**************************** URL PARAMS ****************************/
function useQueryParams() {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));
  useEffect(() => {
    const handler = () => setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  const setParam = (key, value) => {
    const next = new URLSearchParams(params.toString());
    if (value === undefined || value === null || value === "") next.delete(key);
    else next.set(key, String(value));
    const url = `${window.location.pathname}?${next.toString()}`;
    window.history.replaceState({}, "", url);
    setParams(next);
  };
  return [params, setParam];
}

/**************************** SYNC LAYER ****************************/
/** Usa:
 *  - DEMO: localStorage + BroadcastChannel (entre abas da MESMA máquina)
 *  - Firebase: se você preencher o FIREBASE_CONFIG (opcional)
 */
function createSync(room, onChange) {
  const hasFirebase = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);
  let cleanup = () => {};

  // Define o objeto primeiro (evita "Cannot access 'sync' before initialization")
  const sync = {
    write: (_next) => {},
    patch: (_partial) => {},
    destroy: () => cleanup(),
  };

  if (hasFirebase) {
    // Carregamento preguiçoso do Firebase via CDN
    import("https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js").then(({ initializeApp }) => {
      import("https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js").then(
        ({ getDatabase, ref, onValue, set, update })
      ).then((mods) => {
        const { getDatabase, ref, onValue, set, update } = (mods || {});
        const app = initializeApp(FIREBASE_CONFIG);
        const db = getDatabase(app);
        const roomRef = ref(db, `rooms/${room}`);

        onValue(roomRef, (snap) => {
          const val = snap.val();
          if (val) onChange(val);
        });

        sync.write = async (next) => set(roomRef, next);
        sync.patch = async (partial) => update(roomRef, partial);
      }).catch(() => {});
    }).catch(() => {});
  } else {
    // DEMO: localStorage + BroadcastChannel
    const bc = "BroadcastChannel" in window ? new BroadcastChannel(`mesa-${room}`) : null;
    const handler = (ev) => {
      if (ev?.data?.type === "state") onChange(ev.data.payload);
    };
    bc?.addEventListener("message", handler);

    cleanup = () => {
      bc?.removeEventListener("message", handler);
      bc?.close?.();
    };

    sync.write = (next) => {
      localStorage.setItem(`${STORAGE_KEY}:${room}`, JSON.stringify(next));
      bc?.postMessage({ type: "state", payload: next });
    };
    sync.patch = (partial) => {
      const current = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:${room}`) || "null") || defaultState();
      const next = { ...current, ...partial };
      localStorage.setItem(`${STORAGE_KEY}:${room}`, JSON.stringify(next));
      bc?.postMessage({ type: "state", payload: next });
    };

    // Estado salvo localmente
    const initial = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:${room}`) || "null");
    if (initial) onChange(initial);
  }

  return sync;
}

/**************************** APP ****************************/
export default function App() {
  const [params, setParam] = useQueryParams();
  const initialRoom = params.get("room") || "demo";
  const initialRole = params.get("role") || "viewer"; // "gm" | "viewer"

  const [room, setRoom] = useState(initialRoom);
  const [role, setRole] = useState(initialRole);
  const [useFirebase, setUseFirebase] = useState(false);
  const [state, setState] = useState(defaultState());
const [hydrated, setHydrated] = useState(false);
const syncRef = useRef(null);

  // Inicia camada de sync
  useEffect(() => {
  // 1) Pré-carrega do localStorage para não “zerar” o estado na primeira render
  try {
    const initial = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:${room}`) || "null");
    if (initial) setState(initial);
  } catch {}
  setHydrated(true);

  // 2) Inicia a camada de sync
  syncRef.current?.destroy?.();
  const sync = createSync(room, (incoming) => setState(incoming));
  syncRef.current = sync;
  return () => sync.destroy();
}, [room]);

  // Persiste no DEMO
  useEffect(() => {
  if (!hydrated) return; // evita sobrescrever com estado vazio
  try {
    localStorage.setItem(`${STORAGE_KEY}:${room}`, JSON.stringify(state));
  } catch {}
}, [state, room, hydrated]);

  // Reflete na URL
  useEffect(() => {
    setParam("room", room);
    setParam("role", role);
  }, [room, role]);

  // Helpers de escrita (sempre atualiza local; se houver sync, envia)
  const writeState = (next) => {
    setState(next);
    syncRef.current?.write?.(next);
  };
  const patchState = (partial) => {
    setState((prev) => ({ ...prev, ...partial }));
    syncRef.current?.patch?.(partial);
  };

  // Seleciona 1ª cena automaticamente, se ainda não houver
  useEffect(() => {
    if (!state.currentSceneId && state.scenes.length > 0) {
      setState((prev) => ({ ...prev, currentSceneId: prev.scenes[0].id }));
    }
  }, [state.currentSceneId, state.scenes.length]);

  const currentScene = useMemo(
    () => state.scenes.find((s) => s.id === state.currentSceneId) || null,
    [state]
  );

  const viewerUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", room);
    url.searchParams.set("role", "viewer");
    return url.toString();
  }, [room]);

  return (
    <div className="min-h-screen" style={{ background: "#0b1220", color: "#e6ecff" }}>
      {/* CSS mínimo para quem não tem Tailwind setado */}
      <CssInject />

      <header style={{ padding: "12px 16px", borderBottom: "1px solid #1b2540", display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>🎮 Mesa Compartilhada — Cenas & NPCs</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, opacity: .8 }}>Sala</label>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value.trim() || "demo")}
            style={{ background: "#0f172a", border: "1px solid #233059", borderRadius: 6, padding: "6px 8px", fontSize: 12, width: 120, color: "#e6ecff" }}
            placeholder="ex.: MANS-A1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ background: "#0f172a", border: "1px solid #233059", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "#e6ecff" }}
          >
            <option value="gm">Mestre</option>
            <option value="viewer">Jogador (visualizador)</option>
          </select>
          <a
            href={viewerUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, textDecoration: "underline", opacity: .9, color: "#9bd6ff" }}
            title="Abra este link em outro dispositivo para os jogadores"
          >
            Link de visualização
          </a>
          <label className="flex items-center gap-2 text-xs ml-3">
  <input
    type="checkbox"
    checked={useFirebase}
    onChange={(e) => setUseFirebase(e.target.checked)}
  />
  Usar Firebase
</label>

        </div>
      </header>

      <main style={{ display: "grid", gridTemplateColumns: role === "gm" ? "360px 1fr" : "1fr", minHeight: "calc(100vh - 96px)" }}>
        {role === "gm" ? (
          <GMPanel state={state} writeState={writeState} patchState={patchState} />
        ) : null}
        <Stage state={state} patchState={patchState} currentScene={currentScene} role={role} />
      </main>

      <footer style={{ padding: 12, borderTop: "1px solid #1b2540", textAlign: "center", fontSize: 12, color: "#9aa6bb" }}>
        Dica: use URLs públicas (Imgur, Drive público, Cloudinary) para os jogadores verem as imagens.
      </footer>
    </div>
  );
}

/**************************** GM PANEL ****************************/
function GMPanel({ state, writeState, patchState }) {
  const [tab, setTab] = useState("scenes");
  const btn = (label, active) => ({
    padding: "8px 12px",
    fontSize: 13,
    borderBottom: `2px solid ${active ? "#34d399" : "transparent"}`,
    color: active ? "#a7f3d0" : "#9aa6bb",
    background: "transparent",
    cursor: "pointer",
  });

  return (
    <aside style={{ borderRight: "1px solid #1b2540", background: "rgba(11,18,32,.3)" }}>
      <div style={{ display: "flex" }}>
        <button onClick={() => setTab("scenes")} style={btn("Cenas", tab === "scenes")}>Cenas</button>
        <button onClick={() => setTab("npcs")} style={btn("NPCs", tab === "npcs")}>NPCs</button>
        <button onClick={() => setTab("live")} style={btn("Ao vivo", tab === "live")}>Ao vivo</button>
      </div>
      {tab === "scenes" && <ScenesPanel state={state} writeState={writeState} patchState={patchState} />}
      {tab === "npcs" && <NpcsPanel state={state} patchState={patchState} />}
      {tab === "live" && <LivePanel state={state} patchState={patchState} />}
    </aside>
  );
}

function ScenesPanel({ state, writeState, patchState }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [filePreview, setFilePreview] = useState("");

  const addScene = () => {
    const id = uid();
    const imageUrl = url || filePreview || "";
    const next = { ...state, scenes: [...state.scenes, { id, name: name || "Nova Cena", imageUrl }] };
    writeState(next);
    if (!state.currentSceneId) patchState({ currentSceneId: id });
    setName(""); setUrl(""); setFilePreview("");
  };

  const onFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => setFilePreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const setCurrent = (id) => patchState({ currentSceneId: id });

  const removeScene = (id) => {
    const next = { ...state, scenes: state.scenes.filter((s) => s.id !== id) };
    writeState(next);
    if (state.currentSceneId === id) patchState({ currentSceneId: null });
  };

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ fontSize: 13, opacity: .8, marginBottom: 8 }}>Gerenciar Cenas</h2>

      <div style={{ display: "grid", gap: 8 }}>
        <input
          style={inputStyle}
          placeholder="Nome da cena"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={inputStyle}
          placeholder="URL da imagem (recomendado)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <label style={{ fontSize: 12, opacity: .7 }}>ou</label>
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} style={{ fontSize: 12 }} />
        {(url || filePreview) && <div style={{ fontSize: 12, opacity: .7 }}>Preview carregado.</div>}
        <button onClick={addScene} style={btnPrimary}>Adicionar Cena</button>
      </div>

      <div style={{ paddingTop: 12 }}>
        <h3 style={{ fontSize: 11, opacity: .6, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Lista</h3>
        <div style={{ display: "grid", gap: 6, maxHeight: "40vh", overflow: "auto", paddingRight: 4 }}>
          {state.scenes.map((s) => (
            <div key={s.id} style={rowCard}>
              <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{s.name || "Sem nome"}</div>
              <button style={btnGhost} onClick={() => setCurrent(s.id)}>Exibir</button>
              <button style={btnDanger} onClick={() => removeScene(s.id)}>Remover</button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ paddingTop: 8 }}>
        <h3 style={{ fontSize: 11, opacity: .6, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>NPCs nesta Cena</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {state.npcs.map((n) => (
            <NpcToggle key={n.id} npc={n} state={state} patchState={patchState} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NpcToggle({ npc, state, patchState }) {
  const vis = state.overlay[npc.id]?.visible || false;
  const toggle = () => {
    const curr = state.overlay[npc.id] || { x: 50, y: 75, visible: false, scale: 100 };
    const nextOverlay = { ...state.overlay, [npc.id]: { ...curr, visible: !vis } };
    patchState({ overlay: nextOverlay });
  };

  return (
    <button
      onClick={toggle}
      style={{
        textAlign: "left",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 13,
        border: `1px solid ${vis ? "rgba(52,211,153,.6)" : "#334155"}`,
        background: vis ? "rgba(52,211,153,.1)" : "rgba(15,23,42,.6)",
        color: "#e6ecff",
      }}
    >
      {vis ? "Ocultar" : "Mostrar"} — {npc.name || "NPC"}
    </button>
  );
}

function NpcsPanel({ state, patchState }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [filePreview, setFilePreview] = useState("");
  const [shake, setShake] = useState(true);

  const addNpc = () => {
    const id = uid();
    const imageUrl = url || filePreview || "";
    const next = { ...state, npcs: [...state.npcs, { id, name: name || "Novo NPC", imageUrl, shake }] };
    patchState(next);
    setName(""); setUrl(""); setFilePreview(""); setShake(true);
  };

  const onFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => setFilePreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const removeNpc = (id) => {
    const next = { ...state, npcs: state.npcs.filter((n) => n.id !== id) };
    patchState(next);
    if (state.overlay[id]) {
      const nextOverlay = { ...state.overlay };
      delete nextOverlay[id];
      patchState({ overlay: nextOverlay });
    }
  };

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ fontSize: 13, opacity: .8, marginBottom: 8 }}>Gerenciar NPCs</h2>
      <div style={{ display: "grid", gap: 8 }}>
        <input style={inputStyle} placeholder="Nome do NPC" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={inputStyle} placeholder="URL da imagem (recomendado)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <label style={{ fontSize: 12, opacity: .7 }}>ou</label>
        <input type="file" accept="image/*" onChange={(e)=> e.target.files?.[0] && onFile(e.target.files[0])} style={{ fontSize: 12 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <input type="checkbox" checked={shake} onChange={(e)=>setShake(e.target.checked)} /> Efeito de tremer (sutil)
        </label>
        <button onClick={addNpc} style={btnPrimary}>Adicionar NPC</button>
      </div>

      <div style={{ paddingTop: 12 }}>
        <h3 style={{ fontSize: 11, opacity: .6, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Lista</h3>
        <div style={{ display: "grid", gap: 6, maxHeight: "40vh", overflow: "auto", paddingRight: 4 }}>
          {state.npcs.map((n) => (
            <div key={n.id} style={rowCard}>
              <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{n.name || "Sem nome"}</div>
              <span style={{ fontSize: 10, opacity: .6, marginRight: 8 }}>{n.shake ? "tremer" : "fixo"}</span>
              <button style={btnDanger} onClick={() => removeNpc(n.id)}>Remover</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LivePanel({ state, patchState }) {
  const [fadeMs, setFadeMs] = useState(state.options.fadeDurationMs || 450);
  const [npcShake, setNpcShake] = useState(state.options.npcShake);
  const [showGrid, setShowGrid] = useState(state.options.showGrid);

  useEffect(() => {
    patchState({ options: { ...state.options, fadeDurationMs: fadeMs, npcShake, showGrid } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fadeMs, npcShake, showGrid]);

  return (
    <div style={{ padding: 12, display: "grid", gap: 8, fontSize: 13 }}>
      <h2 style={{ fontSize: 13, opacity: .8 }}>Exibição ao vivo</h2>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Duração do fade (ms)
        <input type="number" value={fadeMs} onChange={(e)=>setFadeMs(Number(e.target.value)||0)} style={{ ...inputStyle, width: 100 }} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={npcShake} onChange={(e)=>setNpcShake(e.target.checked)} /> NPCs com tremor sutil
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={showGrid} onChange={(e)=>setShowGrid(e.target.checked)} /> Mostrar grade (auxílio de posicionamento)
      </label>
      <p style={{ fontSize: 12, opacity: .7 }}>Jogadores veem apenas a Cena atual e os NPCs visíveis.</p>
    </div>
  );
}

/**************************** STAGE ****************************/
function Stage({ state, patchState, currentScene, role }) {
  const stageRef = useRef(null);
  const [dragging, setDragging] = useState(null); // { id, startX, startY, baseX, baseY }
  const fadeMs = state.options.fadeDurationMs || 450;

  const onMouseDownNpc = (id, e) => {
    const ov = state.overlay[id] || { x: 50, y: 80, visible: true, scale: 100 };
    // garantir visível ao interagir
    const ensure = { ...state.overlay, [id]: { ...ov, visible: true } };
    patchState({ overlay: ensure });
    setDragging({ id, startX: e.clientX, startY: e.clientY, baseX: ov.x, baseY: ov.y });
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging) return;
      const { id, startX, startY, baseX, baseY } = dragging;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nx = Math.max(0, Math.min(100, baseX + (dx / rect.width) * 100));
      const ny = Math.max(0, Math.min(100, baseY + (dy / rect.height) * 100));
      const nextOverlay = { ...state.overlay, [id]: { ...(state.overlay[id] || {}), x: nx, y: ny } };
      patchState({ overlay: nextOverlay });
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, state.overlay, patchState]);

  const setScale = (id, scale) => {
    const curr = state.overlay[id] || { x: 50, y: 80, visible: true, scale: 100 };
    const nextOverlay = { ...state.overlay, [id]: { ...curr, scale } };
    patchState({ overlay: nextOverlay });
  };

  // Área de cena: sempre do mesmo tamanho visual (sem corte): object-contain
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "#0b1220" }}>
      <div
        ref={stageRef}
        style={{
          width: "100%",
          height: "calc(100vh - 120px)",
          maxHeight: "calc(100vh - 120px)",
          margin: "0 auto",
          background: "black",
          position: "relative",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentScene?.id || "blank"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: fadeMs / 1000 }}
            style={{ position: "absolute", inset: 0 }}
          >
            {currentScene?.imageUrl ? (
              <img
                src={currentScene.imageUrl}
                alt={currentScene.name}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 0 }}
              />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#94a3b8" }}>
                Sem imagem da cena
              </div>
            )}

            {/* grade (opcional) */}
            {state.options.showGrid && (
              <div
                style={{
                  position: "absolute", inset: 0, pointerEvents: "none", opacity: .3, zIndex: 1,
                  backgroundImage:
                    "linear-gradient(transparent 95%, rgba(255,255,255,.25) 95%), linear-gradient(90deg, transparent 95%, rgba(255,255,255,.25) 95%)",
                  backgroundSize: "20px 20px",
                }}
              />
            )}

            {/* NPCs visíveis (por cima) */}
            {state.npcs.map((npc) => {
              const ov = state.overlay[npc.id];
              if (!ov?.visible) return null;
              const x = ov.x ?? 50;
              const y = ov.y ?? 80;
              const sc = (ov.scale ?? 100) / 100;
              return (
                <DraggableNpc
  key={npc.id}
  npc={npc}
  x={x}
  y={y}
  scale={sc}
  onMouseDown={(e) => onMouseDownNpc(npc.id, e)}
  onScale={(val) => setScale(npc.id, val)}
  fadeMs={fadeMs}
  shake={npc.shake && state.options.npcShake}
  role={role}
/>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function DraggableNpc({ npc, x, y, scale, onMouseDown, onScale, fadeMs, shake, role }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: fadeMs / 1000 }}
      style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%)`, zIndex: 10 }}
    >
      <div
  onMouseDown={role === "gm" ? onMouseDown : undefined}
  style={{
    cursor: role === "gm" ? "move" : "default",
    userSelect: "none",
    animation: shake ? "npcShake 2s ease-in-out infinite" : "none",
    filter: "drop-shadow(0 8px 24px rgba(0,0,0,.6))",
    pointerEvents: role === "gm" ? "auto" : "none",
  }}
  title={role === "gm" ? "Arraste para posicionar" : "Visualização"}
>
        {npc.imageUrl ? (
          <img
  src={npc.imageUrl}
  alt={npc.name}
  style={{
    maxHeight: "50vh",
    objectFit: "contain",
    transform: `scale(${scale})`,
    transformOrigin: "center center",
  }}
/>
        ) : (
          <div style={{ padding: "6px 10px", background: "rgba(30,41,59,.8)", border: "1px solid #334155", borderRadius: 6, fontSize: 13 }}>
            {npc.name}
          </div>
        )}
      </div>
      {role === "gm" && (
  <div style={{ display: "flex", justifyContent: "center", marginTop: 8, pointerEvents: "auto" }}>
    <input
      type="range"
      min={50}
      max={200}
      defaultValue={scale * 100}
      onChange={(e) => onScale(Number(e.target.value))}
      style={{ width: 160 }}
      title="Tamanho do NPC"
    />
  </div>
)}
    </motion.div>
  );
}

/**************************** ESTILOS MÍNIMOS ****************************/
const inputStyle = {
  background: "#0f172a",
  border: "1px solid #233059",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
  color: "#e6ecff",
};
const btnPrimary = {
  background: "rgba(52,211,153,.2)",
  border: "1px solid rgba(52,211,153,.4)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  color: "#e6ecff",
  cursor: "pointer",
};
const btnGhost = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  color: "#e6ecff",
  cursor: "pointer",
};
const btnDanger = {
  background: "rgba(239,68,68,.15)",
  border: "1px solid rgba(239,68,68,.4)",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  color: "#fecaca",
  cursor: "pointer",
};
const rowCard = {
  background: "rgba(2,6,23,.6)",
  border: "1px solid #1b2540",
  borderRadius: 10,
  padding: 8,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

/* Injeta animação de tremor sem depender de Tailwind */
function CssInject() {
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes npcShake { 0%, 100% { transform: translate(-50%, -50%) } 50% { transform: translate(calc(-50% + .6px), calc(-50% - .6px)) } }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);
  return null;
}