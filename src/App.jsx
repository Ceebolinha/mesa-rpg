import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * Mesa Compartilhada — Cenas & NPCs (Firebase ALWAYS ON)
 * - Cenas cabem no palco (object-contain), sem cobrir header/painel/rodapé.
 * - NPCs com fade; arrastar/redimensionar somente no papel "gm".
 * - Sempre sincroniza via Firebase Realtime Database.
 * - Link p/ jogadores: ?room=SALA&role=viewer
 */

/*************** CONFIG (Firebase Realtime Database) ***************/
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBcoqQL7Cv-iiEE1_i8xeIcEuzaC2rSxsE",
  authDomain: "mesa-rpg-8a4b9.firebaseapp.com",
  databaseURL: "https://mesa-rpg-8a4b9-default-rtdb.firebaseio.com",
  projectId: "mesa-rpg-8a4b9",
  storageBucket: "mesa-rpg-8a4b9.firebasestorage.app",
  messagingSenderId: "196938820959",
  appId: "1:196938820959:web:8e2f8ac490f152ff465aea",
};

/**************************** UTILS ****************************/
const uid = () => Math.random().toString(36).slice(2, 9);

const defaultState = () => ({
  scenes: [],
  npcs: [],
  currentSceneId: null,
  overlay: {}, // npcId -> { visible, x, y, scale }
  options: { fadeDurationMs: 450, npcShake: true, showGrid: false },
});

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

/**************************** SYNC (Firebase only) ****************************/
// Sempre usa Firebase Realtime Database
function createSync(room, onChange) {
  let cleanup = () => {};
  const sync = {
    write: (_next) => {},
    patch: (_partial) => {},
    destroy: () => cleanup(),
  };

  // Carrega Firebase via CDN (sem TypeScript, sem await fora de função)
  import("https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js")
    .then(({ initializeApp }) =>
      import("https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js").then(
        ({ getDatabase, ref, onValue, set, update }) => {
          const app = initializeApp(FIREBASE_CONFIG);
          const db = getDatabase(app);
          const roomRef = ref(db, `rooms/${room}`);

           onValue(roomRef, (snap) => {
  const val = snap.val();
  const merged = { ...defaultState(), ...(val || {}) };

  onChange(merged);

  if (!val) {
    set(roomRef, merged);
  }
});


          sync.write = async (next) => set(roomRef, next);
          sync.patch = async (partial) => update(roomRef, partial);
        }
      )
    )
    .catch((e) => console.error("Falha ao carregar Firebase:", e));

  return sync;
}

/**************************** APP ****************************/
export default function App() {
  const [params, setParam] = useQueryParams();
  const initialRoom = params.get("room") || "demo";
  const initialRole = params.get("role") || "viewer"; // default viewer p/ não vazar GM

  const [room, setRoom] = useState(initialRoom);
  const [role, setRole] = useState(initialRole);
  const [state, setState] = useState(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const syncRef = useRef(null);

  // Inicia camada de sync SEMPRE via Firebase
  useEffect(() => {
    syncRef.current?.destroy?.();
    const sync = createSync(room, (incoming) => {
  setState((prev) => ({ ...prev, ...incoming })); // garante merge
  setHydrated(true); // marca que carregou
});

    syncRef.current = sync;
    return () => sync.destroy();
  }, [room]);

  // Reflete sala/papel na URL (útil pra compartilhar link)
  useEffect(() => {
    setParam("room", room);
    setParam("role", role);
  }, [room, role]);

  // Ações de escrita (local + remoto)
  const writeState = (next) => {
    setState(next);
    syncRef.current?.write?.(next);
  };
  const patchState = (partial) => {
    setState((prev) => ({ ...prev, ...partial }));
    syncRef.current?.patch?.(partial);
  };

  // Seleciona primeira cena automaticamente quando passar a existir
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
      <CssInject />

      <header
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #1b2540",
          display: "flex",
          gap: 12,
          alignItems: "center",
          position: "relative",
          zIndex: 10,
          background: "#0b1220",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 600 }}>🎮 Mesa Compartilhada — Cenas & NPCs</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Sala</label>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value.trim() || "demo")}
            style={{
              background: "#0f172a",
              border: "1px solid #233059",
              borderRadius: 6,
              padding: "6px 8px",
              fontSize: 12,
              width: 120,
              color: "#e6ecff",
            }}
            placeholder="ex.: MANS-A1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              background: "#0f172a",
              border: "1px solid #233059",
              borderRadius: 6,
              padding: "6px 8px",
              fontSize: 12,
              color: "#e6ecff",
            }}
          >
            <option value="gm">Mestre</option>
            <option value="viewer">Jogador (visualizador)</option>
          </select>
          <a
            href={viewerUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, textDecoration: "underline", opacity: 0.9, color: "#9bd6ff" }}
            title="Abra este link em outro dispositivo para os jogadores"
          >
            Link de visualização
          </a>
        </div>
      </header>

      {/* Painel (quando GM) + Palco. Nada absoluto aqui fora do palco. */}
      <main
        style={{
          display: "grid",
          gridTemplateColumns: role === "gm" ? "360px 1fr" : "1fr",
          minHeight: "calc(100vh - 96px)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {role === "gm" ? (
          <GMPanel state={state} writeState={writeState} patchState={patchState} />
        ) : null}
        <Stage state={state} patchState={patchState} currentScene={currentScene} role={role} />
      </main>

      <footer
        style={{
          padding: 12,
          borderTop: "1px solid #1b2540",
          textAlign: "center",
          fontSize: 12,
          color: "#9aa6bb",
          position: "relative",
          zIndex: 10,
          background: "#0b1220",
        }}
      >
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
      {tab === "live" && <LivePanel state={state} patchState={patchState} hydrated={hydrated} />}
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
        <input style={inputStyle} placeholder="Nome da cena" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={inputStyle} placeholder="URL da imagem (recomendado)" value={url} onChange={(e) => setUrl(e.target.value)} />
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
    patchState({
  npcs: [...state.npcs, { id, name: name || "Novo NPC", imageUrl, shake }]
});
    setName(""); setUrl(""); setFilePreview(""); setShake(true);
  };

  const onFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => setFilePreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const removeNpc = (id) => {
    patchState({
  npcs: state.npcs.filter((n) => n.id !== id)
});
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

function LivePanel({ state, patchState, hydrated }) {
  const [fadeMs, setFadeMs] = useState(state.options.fadeDurationMs || 450);
  const [npcShake, setNpcShake] = useState(state.options.npcShake);
  const [showGrid, setShowGrid] = useState(state.options.showGrid);

  useEffect(() => {
  if (!hydrated) return; // ← impede salvar cedo demais
  patchState({ options: { ...state.options, fadeDurationMs: fadeMs, npcShake, showGrid } });
}, [fadeMs, npcShake, showGrid, hydrated]);


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
  const lastWrite = useRef(0);
  const [dragging, setDragging] = useState(null); // { id, startX, startY, baseX, baseY }
  const fadeMs = state.options.fadeDurationMs || 450;

  const onMouseDownNpc = (id, e) => {
    if (role !== "gm") return;
    const ov = state.overlay[id] || { x: 50, y: 80, visible: true, scale: 100 };
    const ensure = { ...state.overlay, [id]: { ...ov, visible: true } };
    patchState({ overlay: ensure });
    setDragging({ id, startX: e.clientX, startY: e.clientY, baseX: ov.x, baseY: ov.y });
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging) return;
      const { id, startX, startY, baseX, baseY } = dragging;
      const now = Date.now();
if (now - lastWrite.current < 50) return;
lastWrite.current = now;
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

  return (
    <div
      ref={stageRef}
      style={{
        position: "relative",
        width: "100%",
        height: "calc(100vh - 120px)", // palco com altura fixa; não cobre header/rodapé
        background: "black",
        overflow: "hidden",
      }}
    >
      {/* Cena */}
      {currentScene?.imageUrl ? (
        <img
          key={currentScene.id}
          src={currentScene.imageUrl}
          alt={currentScene.name}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            zIndex: 0,
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#94a3b8",
            background: "black",
            zIndex: 0,
          }}
        >
          Sem imagem da cena
        </div>
      )}

      {/* Grade opcional */}
      {state.options.showGrid && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.3,
            zIndex: 1,
            backgroundImage:
              "linear-gradient(transparent 95%, rgba(255,255,255,.25) 95%), linear-gradient(90deg, transparent 95%, rgba(255,255,255,.25) 95%)",
            backgroundSize: "20px 20px",
          }}
        />
      )}

      {/* NPCs (por cima) */}
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
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
        title={role === "gm" ? "Arraste para posicionar" : "Visualização"}
      >
        {npc.imageUrl ? (
          <img
            src={npc.imageUrl}
            alt={npc.name}
            style={{ maxHeight: "50vh", objectFit: "contain", display: "block" }}
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

/* Tremor sem Tailwind */
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
