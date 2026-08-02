import { useEffect, useState } from "react";

const DEFAULT_SIGNAL_KEY = "waitbuy_over_threshold";
const BUY_SIGNAL_KEY = "buy_over_threshold";
const EMPTY_SIGNAL = { title: "", response: "", recommendation: "" };
const LAST_SIGNAL_STORAGE_KEY = "stocktraders:last-do-song-advice";

function hasSignalContent(signal) {
  return Boolean(String(signal?.response || "").trim());
}
function readLastSignal() {
  if (typeof window === "undefined") return EMPTY_SIGNAL;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LAST_SIGNAL_STORAGE_KEY) || "null");
    return hasSignalContent(parsed) ? {
      title: String(parsed.title || "").trim(),
      response: String(parsed.response || "").trim(),
      recommendation: String(parsed.recommendation || "").trim(),
    } : EMPTY_SIGNAL;
  } catch {
    return EMPTY_SIGNAL;
  }
}

function cacheLastSignal(signal) {
  if (typeof window === "undefined" || !hasSignalContent(signal)) return;
  try {
    window.localStorage.setItem(LAST_SIGNAL_STORAGE_KEY, JSON.stringify({
      title: String(signal.title || "").trim(),
      response: String(signal.response || "").trim(),
      recommendation: String(signal.recommendation || "").trim(),
    }));
  } catch {
    // localStorage may be unavailable in private mode; keeping in-memory state is enough.
  }
}


function buildDoSongAdviceKey(advice) {
  if (!advice?.engine) return "";
  const wave = advice.wave || {};
  const engine = advice.engine || {};
  return JSON.stringify({
    date: advice.check_date || wave.date || "",
    signal_keys: advice.signal_keys || [],
    maTrangThai: engine.maTrangThai || "",
    pha: engine.pha || "",
    choMua: wave.choMua,
    mua: wave.mua,
    choBan: wave.choBan,
    ban: wave.ban,
    tong: wave.tong,
  });
}

function getSignalCandidates(signalKey, currentBuy) {
  const keys = [];
  if (signalKey && signalKey !== DEFAULT_SIGNAL_KEY) keys.push(signalKey);
  if (Number.isFinite(currentBuy)) keys.push(BUY_SIGNAL_KEY);
  keys.push(DEFAULT_SIGNAL_KEY);
  return [...new Set(keys)];
}

function getAdviceSignalCandidates(adviceMode, signalKey, currentBuy) {
  if (adviceMode === "buy") return [BUY_SIGNAL_KEY];
  if (adviceMode === "waitbuy") return [DEFAULT_SIGNAL_KEY];
  return getSignalCandidates(signalKey || DEFAULT_SIGNAL_KEY, currentBuy);
}

export default function KhuyenNghiTuVanAI({ signalKey = DEFAULT_SIGNAL_KEY, waitbuy = 0, buy = 0, refreshKey = 0, checkDate = "", doSongAdvice, adviceMode = "engine", theme = "dark" }) {
  const [conditionSignal, setConditionSignal] = useState(() => readLastSignal());
  const doSongAdviceKey = buildDoSongAdviceKey(doSongAdvice);

  useEffect(() => {
    let cancelled = false;
    const retryTimers = [];
    const shouldUseConditionAdvice = adviceMode === "buy" || adviceMode === "waitbuy";

    if (shouldUseConditionAdvice) {
      setConditionSignal(EMPTY_SIGNAL);
    }
    const currentWaitbuy = Number(waitbuy) || 0;
    const currentBuy = Number(buy) || 0;
    const retryDelays = [0, 2000, 6000, 12000];

    function scheduleLoad(attempt) {
      const delay = retryDelays[attempt] ?? 0;
      const timer = window.setTimeout(() => loadConditionResponse(attempt), delay);
      retryTimers.push(timer);
    }

    async function loadConditionResponse(attempt = 1) {
      try {
        if (doSongAdvice === null) {
          if (!cancelled && attempt + 1 < retryDelays.length) scheduleLoad(attempt + 1);
        }
        if (shouldUseConditionAdvice) {
          const candidates = getAdviceSignalCandidates(adviceMode, signalKey || DEFAULT_SIGNAL_KEY, currentBuy);
          let nextSignal = EMPTY_SIGNAL;

          for (const candidateKey of candidates) {
            const params = new URLSearchParams({
              signal_key: candidateKey,
              waitbuy: String(currentWaitbuy),
              buy: String(currentBuy),
              refresh_key: String(refreshKey),
              _: String(Date.now()),
            });
            if (checkDate) params.set("check_date", checkDate);

            const res = await fetch(`/api/condition-signal-latest?${params.toString()}`, {
              cache: "no-store",
            });
            if (!res.ok) continue;

            const data = await res.json();
            const candidateSignal = {
              title: String(data?.title || "").trim(),
              response: String(data?.response || "").trim(),
              recommendation: String(data?.recommendation || "").trim(),
            };

            if (hasSignalContent(candidateSignal)) {
              nextSignal = candidateSignal;
              break;
            }
          }

          if (!cancelled) {
            if (hasSignalContent(nextSignal)) {
              cacheLastSignal(nextSignal);
              setConditionSignal(nextSignal);
            } else if (attempt + 1 < retryDelays.length) {
              scheduleLoad(attempt + 1);
            } else {
              setConditionSignal(EMPTY_SIGNAL);
            }
          }
          return;
        }

        if (doSongAdvice?.engine) {
          const res = await fetch("/api/do-song-advice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              check_date: checkDate || doSongAdvice.check_date || "",
              signal_keys: doSongAdvice.signal_keys || [],
              wave: doSongAdvice.wave || {},
              engine: doSongAdvice.engine || {},
              raw_engine: doSongAdvice.raw_engine || {},
              nearest_engine: doSongAdvice.nearest_engine || {},
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const engineSignal = {
              title: String(data?.title || "").trim(),
              response: String(data?.response || "").trim(),
              recommendation: String(data?.recommendation || "").trim(),
            };
            if (hasSignalContent(engineSignal)) {
              if (!cancelled) {
                cacheLastSignal(engineSignal);
                setConditionSignal(engineSignal);
              }
              return;
            }
          }
          if (!cancelled && attempt + 1 < retryDelays.length) scheduleLoad(attempt + 1);
          return;
        }

        const candidates = getAdviceSignalCandidates(adviceMode, signalKey || DEFAULT_SIGNAL_KEY, currentBuy);
        let nextSignal = EMPTY_SIGNAL;

        for (const candidateKey of candidates) {
          const params = new URLSearchParams({
            signal_key: candidateKey,
            waitbuy: String(currentWaitbuy),
            buy: String(currentBuy),
            refresh_key: String(refreshKey),
            _: String(Date.now()),
          });
          if (checkDate) params.set("check_date", checkDate);

          const res = await fetch(`/api/condition-signal-latest?${params.toString()}`, {
            cache: "no-store",
          });
          if (!res.ok) continue;

          const data = await res.json();
          const candidateSignal = {
            title: String(data?.title || "").trim(),
            response: String(data?.response || "").trim(),
            recommendation: String(data?.recommendation || "").trim(),
          };

          if (hasSignalContent(candidateSignal)) {
            nextSignal = candidateSignal;
            break;
          }
        }

        if (!cancelled) {
          if (hasSignalContent(nextSignal)) {
            cacheLastSignal(nextSignal);
            setConditionSignal(nextSignal);
          } else if (attempt + 1 < retryDelays.length) {
            scheduleLoad(attempt + 1);
          }
        }
      } catch {
        if (!cancelled && attempt + 1 < retryDelays.length) {
          scheduleLoad(attempt + 1);
        }
      }
    }

    loadConditionResponse(0);

    return () => {
      cancelled = true;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [signalKey, waitbuy, buy, refreshKey, checkDate, doSongAdvice, doSongAdviceKey, adviceMode]);

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
          Khuy{"\u1ebfn"} ngh{"\u1ecb"} t{"\u1eeb"} AI
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
