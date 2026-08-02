import { useCallback, useEffect, useRef, useState } from "react";

const PORTFOLIO_CHAT_URL = import.meta.env.VITE_PORTFOLIO_CHAT_URL || "/api/portfolio-chat";
const USER_ID = "u1";
const DEFAULT_CONVERSATION_ID = "portfolio-test-1";

const TEXT = {
  title: "T\u01b0 v\u1ea5n AI",
  panelTitle: "T\u01b0 v\u1ea5n AI s\u00f3ng th\u1ecb tr\u01b0\u1eddng",
  subtitle: "H\u1ecfi v\u1ec1 s\u00f3ng th\u1ecb tr\u01b0\u1eddng, s\u00f3ng ng\u00e0nh, chi\u1ebfn l\u01b0\u1ee3c",
  ready: "S\u1eb5n s\u00e0ng",
  expand: "M\u1edf r\u1ed9ng",
  placeholder: "H\u1ecfi v\u1ec1 s\u00f3ng th\u1ecb tr\u01b0\u1eddng, chi\u1ebfn l\u01b0\u1ee3c...",
  panelPlaceholder: "H\u1ecfi b\u1ea5t c\u1ee9 \u0111i\u1ec1u g\u00ec v\u1ec1 s\u00f3ng th\u1ecb tr\u01b0\u1eddng...",
  apiError: "Kh\u00f4ng g\u1ecdi \u0111\u01b0\u1ee3c API t\u01b0 v\u1ea5n AI.",
};

const SUGGEST_CHIPS = [
  "Ch\u1edd mua l\u00e0 g\u00ec?",
  "S\u00f3ng l\u1edbn l\u00e0 g\u00ec?",
  "Ch\u1edd b\u00e1n l\u00e0 g\u00ec?",
];

function MsgBubble({ role, text, isPanel }) {
  const cls = isPanel ? { wrap: "pmsg", bub: "pbubble", av: "pav" } : { wrap: "msg", bub: "bubble", av: "av" };
  const html = String(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  return (
    <div className={`${cls.wrap} ${role}`}>
      <div className={cls.av}>{role === "ai" ? "AI" : "B\u1ea1n"}</div>
      <div className={cls.bub} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function TypingIndicator({ isPanel }) {
  const cls = isPanel ? { wrap: "pmsg", bub: "pbubble", av: "pav" } : { wrap: "msg", bub: "bubble", av: "av" };
  return (
    <div className={`${cls.wrap} ai`}>
      <div className={cls.av}>AI</div>
      <div className={cls.bub} style={{ padding: "5px 10px" }}>
        <div className="dm-typing"><span /><span /><span /></div>
      </div>
    </div>
  );
}



export default function TuVanAiCard() {
  const [msgs, setMsgs] = useState([]);
  const [chatVal, setChatVal] = useState("");
  const [panelVal, setPanelVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMsgs, setPanelMsgs] = useState([]);
  const [panelSynced, setPanelSynced] = useState(false);
  const [conversationId, setConversationId] = useState(DEFAULT_CONVERSATION_ID);

  const msgsRef = useRef(null);
  const panelRef = useRef(null);
  const chatTaRef = useRef(null);
  const panelTaRef = useRef(null);
  const panelSyncedRef = useRef(false);
  const msgsDataRef = useRef([]);

  useEffect(() => {
    msgsDataRef.current = msgs;
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [msgs]);

  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = panelRef.current.scrollHeight;
  }, [panelMsgs]);
  useEffect(() => {
    panelSyncedRef.current = panelSynced;
  }, [panelSynced]);

  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") setPanelOpen(false); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("portfolio-ai-panel-open", panelOpen);
    return () => document.body.classList.remove("portfolio-ai-panel-open");
  }, [panelOpen]);


  const fetchReply = useCallback(async (q) => {
    const res = await fetch(PORTFOLIO_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, user_id: USER_ID, conversation_id: conversationId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `API loi ${res.status}`);
    if (data.conversation_id) setConversationId(data.conversation_id);
    return typeof data.answer === "string" ? data.answer : "";
  }, [conversationId]);

  const sendMsg = useCallback(async (q, isPanel = false) => {
    if (!q.trim()) return;
    if (isPanel) {
      setPanelVal("");
      setPanelMsgs((prev) => [...prev, { role: "user", text: q }, { role: "typing" }]);
    } else {
      setChatVal("");
      const nextMsgs = [...msgsDataRef.current, { role: "user", text: q }, { role: "typing" }];
      msgsDataRef.current = nextMsgs;
      setMsgs(nextMsgs);
      panelSyncedRef.current = false;
      setPanelSynced(false);
    }
    setLoading(true);

    let text;
    try {
      text = await fetchReply(q);
    } catch (error) {
      text = error.message || TEXT.apiError;
    }

    setLoading(false);
    if (isPanel) {
      setPanelMsgs((prev) => [...prev.filter((m) => m.role !== "typing"), { role: "ai", text }]);
    } else {
      const nextMsgs = [...msgsDataRef.current.filter((m) => m.role !== "typing"), { role: "ai", text }];
      msgsDataRef.current = nextMsgs;
      setMsgs(nextMsgs);
      if (panelSyncedRef.current) {
        setPanelMsgs(nextMsgs);
      }
    }
  }, [fetchReply]);

  const openPanel = useCallback(() => {
    if (!panelSyncedRef.current) {
      setPanelMsgs(msgsDataRef.current);
      panelSyncedRef.current = true;
      setPanelSynced(true);
    }
    setPanelOpen(true);
    setTimeout(() => panelTaRef.current?.focus(), 300);
  }, []);

  return (
    <>
      <style>{`
        @keyframes portfolioAiDot{0%,80%,100%{opacity:.32;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
        @keyframes dmReadyPulse{0%,100%{opacity:1;transform:scale(1);box-shadow:0 0 0 3px rgba(61,214,140,.10)}50%{opacity:.45;transform:scale(.72);box-shadow:0 0 0 1px rgba(61,214,140,.04)}}
        .st-ai-card{border:.5px solid var(--bdr,#242E42);border-radius:16px;background:var(--surf,#111520)}
        .dm-header-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}.dm-ready-pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0;color:var(--G,#3DD68C);font-size:10.5px;font-weight:700;line-height:1;white-space:nowrap}.dm-ready-dot{width:6px;height:6px;border-radius:50%;background:var(--G,#3DD68C);box-shadow:0 0 0 3px rgba(61,214,140,.10);display:inline-block;animation:dmReadyPulse 1.8s infinite ease-in-out}.dm-expand-btn{height:24px;border:.5px solid var(--Bb,rgba(124,58,237,.30));border-radius:999px;background:linear-gradient(180deg,rgba(124,58,237,.18),rgba(124,58,237,.10));color:var(--B,#7C3AED);padding:0 10px 0 8px;font:inherit;font-size:10.5px;font-weight:800;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;line-height:1;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.dm-expand-btn:hover{border-color:rgba(124,58,237,.55);background:rgba(124,58,237,.20)}.dm-expand-ic{font-size:12px;line-height:1;transform:translateY(-.5px)}
        .dm-chat-msgs{display:flex;flex-direction:column;gap:8px;padding:8px 14px;max-height:220px;overflow-y:auto;flex-shrink:1}
        .dm-chat-msgs:empty{display:none}
        .msg,.pmsg{display:flex;align-items:flex-start;gap:8px}.msg.user,.pmsg.user{justify-content:flex-end}.msg.user .av,.pmsg.user .pav{order:2}
        .av,.pav{width:24px;height:24px;border-radius:50%;background:var(--Bs,rgba(124,58,237,.13));color:var(--B,#7C3AED);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:700}.pav{width:28px;height:28px;font-size:11px}
        .bubble,.pbubble{border:.5px solid var(--bdr,#242E42);border-radius:8px;background:var(--elev,#171D2E);color:var(--t2,#C7D2E6);line-height:1.55;white-space:pre-wrap}.bubble{max-width:calc(100% - 32px);padding:8px 10px;font-size:12.5px}.pbubble{max-width:calc(100% - 38px);padding:10px 12px;font-size:12px}.user .bubble,.user .pbubble{border-color:var(--Bb,rgba(124,58,237,.30));background:var(--Bs,rgba(124,58,237,.13));color:var(--t1,#F0F4FF)}
        .dm-typing{display:flex;gap:5px;align-items:center}.dm-typing span{width:6px;height:6px;border-radius:50%;background:var(--t2,#A8B8D0);animation:portfolioAiDot 1.1s infinite ease-in-out}.dm-typing span:nth-child(2){animation-delay:.16s}.dm-typing span:nth-child(3){animation-delay:.32s}
        .dm-chip,.dm-panel-chip{display:inline-flex;align-items:center;border:.5px solid var(--bdr,#242E42);border-radius:999px;background:var(--elev,#171D2E);color:var(--t2,#C7D2E6);cursor:pointer;white-space:nowrap;user-select:none;font-weight:600;font-family:inherit}.dm-chip{min-height:28px;padding:0 10px;font-size:11px}.dm-panel-chip{min-height:26px;padding:0 9px;font-size:10px}
      `}</style>
      <div className="card st-ai-card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--elev)", borderBottom: ".5px solid var(--bdr)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--Bs)", border: ".5px solid var(--Bb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--P)" }}>✦</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--t1)" }}>{TEXT.title}</div>
              <div style={{ fontSize: 9, color: "var(--t3)" }}>{TEXT.subtitle}</div>
            </div>
          </div>
          <div className="dm-header-actions">
            <div className="dm-ready-pill">
              <span className="dm-ready-dot" />
              {TEXT.ready}
            </div>
            <button className="dm-expand-btn" onClick={openPanel} title={TEXT.expand}>
              <span className="dm-expand-ic">↗</span>
              <span>{TEXT.expand}</span>
            </button>
          </div>
        </div>

        <div className="dm-chat-msgs" ref={msgsRef}>
          {msgs.map((m, i) => m.role === "typing" ? <TypingIndicator key={i} isPanel={false} /> : <MsgBubble key={i} role={m.role} text={m.text} isPanel={false} />)}
        </div>

        <div style={{ padding: "6px 14px", display: "flex", gap: 5, flexWrap: "wrap", borderTop: ".5px solid var(--bdr)", flexShrink: 0 }}>
          {SUGGEST_CHIPS.map((txt) => <span key={txt} className="dm-chip" onClick={() => { setChatVal(txt); sendMsg(txt, false); }}>{txt}</span>)}
        </div>

        <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderTop: ".5px solid var(--bdr)", flexShrink: 0, alignItems: "flex-end" }}>
          <textarea
            ref={chatTaRef}
            rows={1}
            value={chatVal}
            onChange={(e) => { setChatVal(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 72) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(chatVal, false); } }}
            placeholder={TEXT.placeholder}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: ".5px solid var(--bdr)", background: "var(--elev)", color: "var(--t1)", fontSize: 11, outline: "none", resize: "none", minHeight: 30, maxHeight: 72, lineHeight: 1.5, fontFamily: "inherit" }}
          />
          <button onClick={() => sendMsg(chatVal, false)} disabled={loading} style={{ width: 30, height: 30, borderRadius: 7, background: "var(--B,#7C3AED)", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, opacity: loading ? 0.6 : 1 }}>➤</button>
        </div>
      </div>

      {panelOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 900, backdropFilter: "blur(2px)" }} onClick={() => setPanelOpen(false)} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 460, background: "var(--surf,#111520)", borderLeft: ".5px solid var(--bdr)", zIndex: 901, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "14px 16px", borderBottom: ".5px solid var(--bdr)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "var(--elev)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--Bs)", border: ".5px solid var(--Bb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--P)" }}>✦</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{TEXT.panelTitle}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)" }}>{TEXT.subtitle}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--G)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--G)", display: "inline-block", animation: "pulse 2s infinite" }} />Live
                </div>
                <button onClick={() => setPanelOpen(false)} style={{ width: 28, height: 28, borderRadius: 7, border: ".5px solid var(--bdr)", background: "var(--elev)", color: "var(--t2)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px" }} ref={panelRef}>
              {panelMsgs.map((m, i) => m.role === "typing" ? <TypingIndicator key={i} isPanel /> : <MsgBubble key={i} role={m.role} text={m.text} isPanel />)}
            </div>

            <div style={{ padding: "10px 16px", display: "flex", gap: 6, flexWrap: "wrap", borderTop: ".5px solid var(--bdr)", flexShrink: 0 }}>
              {SUGGEST_CHIPS.map((txt) => <span key={txt} className="dm-panel-chip" onClick={() => { setPanelVal(txt); sendMsg(txt, true); }}>{txt}</span>)}
            </div>

            <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: ".5px solid var(--bdr)", flexShrink: 0, alignItems: "flex-end" }}>
              <textarea
                ref={panelTaRef}
                rows={1}
                value={panelVal}
                onChange={(e) => { setPanelVal(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 90) + "px"; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(panelVal, true); } }}
                placeholder={TEXT.panelPlaceholder}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: ".5px solid var(--bdr)", background: "var(--elev)", color: "var(--t1)", fontSize: 12, outline: "none", resize: "none", minHeight: 36, maxHeight: 90, lineHeight: 1.5, fontFamily: "inherit" }}
              />
              <button onClick={() => sendMsg(panelVal, true)} disabled={loading} style={{ width: 36, height: 36, borderRadius: 8, background: "var(--B,#7C3AED)", color: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, opacity: loading ? 0.6 : 1 }}>➤</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
