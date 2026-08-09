import { useEffect, useState } from "react";

const EMPTY_SIGNAL = { title: "", response: "", recommendation: "" };

function hasSignalContent(signal) {
  return Boolean(String(signal?.response || "").trim());
}

function normalizeSignal(data) {
  return {
    title: String(data?.title || "").trim(),
    response: String(data?.response || data?.body || "").trim(),
    recommendation: String(data?.recommendation || data?.action || "").trim(),
  };
}

export default function KhuyenNghiTuVanAI({ refreshKey = 0, checkDate = "", theme = "dark", realtime = false, waitbuy = 0, buy = 0, doSongAdvice = null }) {
  const [conditionSignal, setConditionSignal] = useState(EMPTY_SIGNAL);

  useEffect(() => {
    let cancelled = false;
    const retryTimers = [];
    const retryDelays = realtime ? [0, 350, 900, 1800, 3500, 6500, 10000] : [0, 350, 1000, 2200];
    const dateKey = String(checkDate || "").slice(0, 10);
    const realtimeWave = doSongAdvice?.wave || null;

    if (!dateKey) {
      setConditionSignal(EMPTY_SIGNAL);
      return () => {
        cancelled = true;
        retryTimers.forEach((timer) => window.clearTimeout(timer));
      };
    }

    function sameNumber(a, b) {
      if (b === undefined || b === null || b === "") return true;
      return Number(a) === Number(b);
    }

    function matchesRealtimeCounts(data) {
      if (!realtime) return true;
      return sameNumber(data?.cho_mua, realtimeWave?.choMua ?? waitbuy) &&
        sameNumber(data?.mua, realtimeWave?.mua ?? buy) &&
        sameNumber(data?.cho_ban, realtimeWave?.choBan) &&
        sameNumber(data?.ban, realtimeWave?.ban) &&
        sameNumber(data?.total, realtimeWave?.tong);
    }

    function scheduleLoad(attempt) {
      const delay = retryDelays[attempt] ?? 0;
      const timer = window.setTimeout(() => loadRecommendation(attempt), delay);
      retryTimers.push(timer);
    }

    async function loadRecommendation(attempt = 0) {
      try {
        const params = new URLSearchParams({ date: dateKey });
        const res = await fetch(`/thi-truong/api/do-song-recommendation?${params.toString()}`, { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        const nextSignal = normalizeSignal(data || {});

        if (cancelled) return;
        if (hasSignalContent(nextSignal)) {
          setConditionSignal(nextSignal);
          if (matchesRealtimeCounts(data)) return;
        }

        if (attempt + 1 < retryDelays.length) {
          scheduleLoad(attempt + 1);
        } else if (!realtime) {
          setConditionSignal(EMPTY_SIGNAL);
        }
      } catch {
        if (cancelled) return;
        if (attempt + 1 < retryDelays.length) {
          scheduleLoad(attempt + 1);
        } else if (!realtime) {
          setConditionSignal(EMPTY_SIGNAL);
        }
      }
    }

    scheduleLoad(0);

    return () => {
      cancelled = true;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [buy, checkDate, doSongAdvice, realtime, refreshKey, waitbuy]);

  const { title, response, recommendation } = conditionSignal;
  const visibleTitle = title || "\u00a0";
  const visibleResponse = response || "\u00a0";
  const visibleRecommendation = recommendation || "\u00a0";
  const textReady = hasSignalContent(conditionSignal);
  const isLight = theme === "light";
  const pulseIconStyle = isLight ? {
    background: "rgba(224, 247, 242, .88)",
    border: "1px solid rgba(61,214,140,.26)",
    boxShadow: "0 0 0 1px rgba(124,58,237,.10), inset 0 0 12px rgba(61,214,140,.08)",
    color: "#3BAE5F",
  } : {
    background: "rgba(31, 55, 68, .78)",
    border: "1px solid rgba(61,214,140,.32)",
    boxShadow: "0 0 0 1px rgba(124,58,237,.18), inset 0 0 12px rgba(61,214,140,.10)",
    color: "#6EE7B7",
  };

  return (
    <div style={{ background: "linear-gradient(0deg, rgba(124,58,237,.12), rgba(124,58,237,.12)), var(--surf, #111520)", border: "1px solid #5B21B6", borderRadius: 16, padding: "16px 17px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg,#7C3AED,#4F46E5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="10" stroke="rgba(255,255,255,.25)" strokeWidth="1" />
              <circle cx="11" cy="11" r="5.5" fill="white" opacity="0.95" />
              <line x1="11" y1="5.5" x2="11" y2="2" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="11" y1="16.5" x2="11" y2="20" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="5.5" y1="11" x2="2" y2="11" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="16.5" y1="11" x2="20" y2="11" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="7.1" y1="7.1" x2="4.5" y2="4.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="14.9" y1="7.1" x2="17.5" y2="4.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="7.1" y1="14.9" x2="4.5" y2="17.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="14.9" y1="14.9" x2="17.5" y2="17.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="11" cy="11" r="2.5" fill="#7C3AED" />
            </svg>
          </div>
          <span style={{ fontFamily: "'Be Vietnam Pro', Inter, sans-serif", fontSize: 13, fontWeight: 600, lineHeight: 1.3, letterSpacing: ".5px", color: "var(--text-muted, #A0A6B0)", textTransform: "uppercase" }}>
            Khuyến nghị từ AI
          </span>
        </div>
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: pulseIconStyle.background,
            border: pulseIconStyle.border,
            boxShadow: pulseIconStyle.boxShadow,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: pulseIconStyle.color,
            flexShrink: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              d="M4 17h5l2.8-8 5.1 15 3.1-9 2.6 4H28"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <div style={{ fontFamily: "'Be Vietnam Pro', Inter, sans-serif", fontSize: 16, fontWeight: 600, lineHeight: 1.3, letterSpacing: 0, color: "var(--t1, #F0F4FF)", margin: "0 0 6px" }}>
        {visibleTitle}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--t2, #A8B8D0)" }}>
        {visibleResponse}
      </div>
      <div
        style={{
          marginTop: 10,
          border: "1px solid #5B21B6",
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 12.5,
          fontWeight: 400,
          color: "var(--t1, #0A0A0A)",
          background: "rgba(124,58,237,.14)",
          opacity: textReady ? 1 : 0,
        }}
      >
        {visibleRecommendation}
      </div>
    </div>
  );
}
