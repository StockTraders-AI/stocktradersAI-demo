import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { mono } from "../../styles/tokens";

export function PortfolioAiLoadingStyles() {
  return (
    <style>
      {`
        @keyframes portfolio-ai-typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: .55; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes portfolio-ai-status-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .42; transform: scale(.78); }
        }
      `}
    </style>
  );
}

function PortfolioMsgText({ text }) {
  return (
    <>
      {String(text || "").split("\n").map((line, index) => (
        <span key={`${line}-${index}`}>
          {line}
          {index < String(text || "").split("\n").length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function PortfolioTypingDots() {
  return (
    <div aria-label="AI đang trả lời" role="status" style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 12 }}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{
            width: 4,
            height: 4,
            borderRadius: 999,
            background: "var(--t3)",
            display: "inline-block",
            animation: "portfolio-ai-typing-bounce .9s infinite",
            animationDelay: `${index * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function PortfolioMsgBubble({ role, text, panel = false }) {
  const isAi = role === "ai" || role === "typing";
  const isTyping = role === "typing";
  return (
    <div style={{ width: "100%", minWidth: 0, display: "flex", gap: 7, alignItems: "flex-start", justifyContent: isAi ? "flex-start" : "flex-end" }}>
      {isAi && (
        <span style={{ width: panel ? 28 : 22, height: panel ? 28 : 22, borderRadius: 999, background: "var(--Bs)", border: "0.5px solid var(--Bb)", color: "var(--B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: panel ? 12 : 10, fontWeight: 850, flexShrink: 0 }}>
          AI
        </span>
      )}
      <div style={{ maxWidth: panel && isAi ? "calc(100% - 35px)" : isAi ? "82%" : panel ? "86%" : "78%", minWidth: 0, borderRadius: isAi ? "3px 8px 8px 8px" : "8px 3px 8px 8px", padding: isTyping ? (panel ? "7px 11px" : "5px 10px") : panel ? "9px 11px" : "7px 9px", background: isAi ? "var(--elev)" : "var(--Bs)", border: `0.5px solid ${isAi ? "var(--bdr)" : "var(--Bb)"}`, color: isAi ? "var(--t1)" : "var(--t1)", fontSize: panel ? 12 : 11, lineHeight: 1.5, overflowWrap: "anywhere" }}>
        {isTyping ? <PortfolioTypingDots /> : <PortfolioMsgText text={text} />}
      </div>
    </div>
  );
}

const QUICK_QUESTIONS = ["Mã nào đúng sóng đúng ngành?", "Ngành nào đang dẫn dắt?", "Nên cắt mã nào?", "Phân bổ tỷ trọng 3-5-2?", "So sánh các mã?"];

export default function PortfolioChatPanel({ open, narrow, onClose, msgs, loading, value, onChange, onSend, hasAnalysis, analyzed, cats, score, counts }) {
  const asideRef = useRef(null);
  const msgListRef = useRef(null);

  useEffect(() => {
    if (open && msgListRef.current) msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
  }, [msgs, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // iOS/mobile: Dashboard mobile tự cuộn trong một container riêng, không phải
  // body. Khóa cả container đó để gesture trong chat không kéo trang phía sau.
  useEffect(() => {
    if (!open || !narrow) return undefined;
    const dashboardScroller = document.querySelector('[data-mobile-dashboard-scroll="true"]');
    const scrollY = dashboardScroller ? dashboardScroller.scrollTop : window.scrollY;
    const { style } = document.body;
    const prev = { position: style.position, top: style.top, left: style.left, right: style.right, width: style.width };
    style.position = "fixed";
    style.top = dashboardScroller ? "0" : `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";

    const scrollerStyle = dashboardScroller?.style;
    const prevScroller = scrollerStyle
      ? { overflowY: scrollerStyle.overflowY, overscrollBehavior: scrollerStyle.overscrollBehavior, touchAction: scrollerStyle.touchAction }
      : null;
    if (scrollerStyle) {
      scrollerStyle.overflowY = "hidden";
      scrollerStyle.overscrollBehavior = "none";
      scrollerStyle.touchAction = "none";
    }

    const html = document.documentElement;
    const prevOverscroll = html.style.overscrollBehavior;
    html.style.overscrollBehavior = "none";
    return () => {
      style.position = prev.position;
      style.top = prev.top;
      style.left = prev.left;
      style.right = prev.right;
      style.width = prev.width;
      if (scrollerStyle && prevScroller) {
        scrollerStyle.overflowY = prevScroller.overflowY;
        scrollerStyle.overscrollBehavior = prevScroller.overscrollBehavior;
        scrollerStyle.touchAction = prevScroller.touchAction;
        dashboardScroller.scrollTop = scrollY;
      }
      html.style.overscrollBehavior = prevOverscroll;
      if (!dashboardScroller) window.scrollTo(0, scrollY);
    };
  }, [open, narrow]);

  // iOS: panel luôn ôm khít visual viewport — cao đúng bằng vùng nhìn thấy và
  // trượt theo offsetTop. Ô nhập vì thế không bao giờ bị bàn phím che, Safari
  // không có lý do tự cuộn trang nên header/panel đứng yên tuyệt đối.
  useEffect(() => {
    if (!open || !narrow) return undefined;
    const viewport = window.visualViewport;
    const node = asideRef.current;
    if (!viewport || !node) return undefined;

    let raf = 0;
    const apply = () => {
      raf = 0;
      node.style.height = `${Math.round(viewport.height)}px`;
      node.style.transform = `translateY(${Math.round(viewport.offsetTop)}px)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    apply();

    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      if (raf) cancelAnimationFrame(raf);
      node.style.height = "";
      node.style.transform = "";
    };
  }, [open, narrow]);

  // iOS chưa hỗ trợ overscroll-behavior đủ ổn định cho nested scroll.
  // Chặn pull vượt biên trong khung tin nhắn để scroll không rơi xuống Dashboard.
  useEffect(() => {
    if (!open || !narrow) return undefined;
    const panel = asideRef.current;
    const list = msgListRef.current;
    if (!panel || !list) return undefined;

    let startY = 0;
    const onTouchStart = (event) => {
      startY = event.touches?.[0]?.clientY || 0;
    };
    const onTouchMove = (event) => {
      const target = event.target;
      const scrollTarget = target?.closest?.('[data-portfolio-chat-scroll="true"]');

      if (scrollTarget === list) {
        const currentY = event.touches?.[0]?.clientY || startY;
        const deltaY = currentY - startY;
        const canScroll = list.scrollHeight > list.clientHeight;
        const atTop = list.scrollTop <= 0;
        const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;

        if (!canScroll || (atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
          event.preventDefault();
        }
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
    };
  }, [open, narrow]);

  if (!open) return null;

  // Portal ra document.body: panel nằm ngoài container cuộn của MobileDashboard
  // nên chạm/cuộn trên panel không thể lan xuống Dashboard phía sau (body vốn
  // overflow hidden).
  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.52)", backdropFilter: narrow ? undefined : "blur(2px)", zIndex: 900, touchAction: "none" }} onClick={onClose} />
      <aside ref={asideRef} style={{
        position: "fixed",
        top: 0,
        height: narrow ? "100dvh" : "100%",
        right: 0,
        bottom: narrow ? undefined : 0,
        width: narrow ? "100vw" : "min(460px,96vw)",
        maxWidth: "100vw",
        boxSizing: "border-box",
        overflow: "hidden",
        overscrollBehavior: "contain",
        background: "var(--surf)",
        borderLeft: narrow ? "none" : "0.5px solid var(--bdr)",
        zIndex: 901,
        display: "flex",
        flexDirection: "column",
        willChange: narrow ? "transform" : undefined,
        boxShadow: narrow ? "none" : "-24px 0 70px rgba(0,0,0,.35)"
      }}>
        <div style={{ padding: narrow ? "12px 14px" : "14px 16px", borderBottom: "0.5px solid var(--bdr)", background: "var(--elev)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ width: 32, height: 32, borderRadius: 999, background: "var(--Bs)", border: "0.5px solid var(--Bb)", color: "var(--B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 850, flexShrink: 0 }}>✦</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Tư vấn AI danh mục</div>
              <div style={{ fontSize: 10, color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Hỏi về danh mục, sóng ngành, chiến lược</div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "0.5px solid var(--bdr)", background: "var(--surf)", color: "var(--t2)", cursor: "pointer", fontSize: 15, flexShrink: 0 }}>
            ×
          </button>
        </div>

        {hasAnalysis && (
          <div style={{ margin: narrow ? "10px 14px 0" : "12px 16px 0", background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 9, padding: "10px 12px", flexShrink: 0, minWidth: 0, overflow: "hidden" }}>
            <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 7, fontWeight: 750, textTransform: "uppercase", letterSpacing: ".05em" }}>Danh mục đang phân tích</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {analyzed.map((row) => {
                const cat = cats.find((item) => item.key === row.cat);
                return (
                  <span key={row.ticker} style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 5, background: `${cat?.color || "var(--t3)"}20`, color: cat?.color || "var(--t3)", border: `0.5px solid ${cat?.color || "var(--bdr)"}44` }}>
                    {row.ticker}
                  </span>
                );
              })}
            </div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
              <span style={{ fontSize: 18, fontWeight: 850, color: score >= 70 ? "#0ca30c" : score >= 50 ? "#eda100" : "#e34948", ...mono }}>{score}/100</span>
              <span style={{ flex: "1 1 180px", minWidth: 0, fontSize: 10, color: "var(--t3)", overflowWrap: "anywhere" }}>{counts.dd} đúng sóng đúng ngành · {counts.ss} sai sóng sai ngành</span>
            </div>
          </div>
        )}

        <div ref={msgListRef} data-portfolio-chat-scroll="true" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 10, padding: narrow ? "12px 14px" : "14px 16px", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", touchAction: narrow ? "pan-y" : undefined }}>
          {msgs.map((msg, index) => (
            <PortfolioMsgBubble key={`panel-${msg.role}-${index}-${msg.text}`} role={msg.role} text={msg.text} panel />
          ))}
        </div>

        <div style={{ flexShrink: 0, background: "var(--surf)" }}>
          <div style={{ padding: narrow ? "9px 14px" : "10px 16px", display: "flex", gap: 6, flexWrap: "wrap", borderTop: "0.5px solid var(--bdr)", minWidth: 0 }}>
            {QUICK_QUESTIONS.map((text) => (
              <button key={text} type="button" onClick={() => onSend(text)} disabled={loading} style={{ border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t2)", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 650, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.55 : 1 }}>
                {text}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, padding: narrow ? "10px 14px calc(10px + env(safe-area-inset-bottom, 0px))" : "12px 16px", borderTop: "0.5px solid var(--bdr)", alignItems: "flex-end", minWidth: 0 }}>
            <textarea
              autoFocus={!narrow}
              rows={1}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSend(value);
                }
              }}
              placeholder="Hỏi bất cứ điều gì về danh mục..."
              style={{ flex: 1, minWidth: 0, minHeight: 36, maxHeight: 90, resize: "none", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--bdr)", background: "var(--elev)", color: "var(--t1)", fontSize: narrow ? 16 : 12, lineHeight: 1.5, outline: "none", fontFamily: "inherit" }}
            />
            <button type="button" onClick={() => onSend(value)} disabled={loading || !value.trim()} style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "var(--B)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: loading || !value.trim() ? "not-allowed" : "pointer", opacity: loading || !value.trim() ? 0.55 : 1, flexShrink: 0 }}>
              ➤
            </button>
          </div>
        </div>
      </aside>
    </>,
    document.body
  );
}
