// Icon AI và panel khuyến nghị dùng ở nhiều module.

export function AIIcon() {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg,#7C3AED,#4F46E5)",
        boxShadow: "0 4px 16px rgba(124,58,237,.55)",
        marginTop: 6,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle
          cx="11"
          cy="11"
          r="10"
          stroke="rgba(255,255,255,.25)"
          strokeWidth="1"
        />
        <circle cx="11" cy="11" r="5.5" fill="white" opacity="0.95" />
        {[
          [11, 5.5, 11, 2],
          [11, 16.5, 11, 20],
          [5.5, 11, 2, 11],
          [16.5, 11, 20, 11],
        ].map(([x1, y1, x2, y2], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="white"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        ))}
        {[
          [7.1, 7.1, 4.5, 4.5],
          [14.9, 7.1, 17.5, 4.5],
          [7.1, 14.9, 4.5, 17.5],
          [14.9, 14.9, 17.5, 17.5],
        ].map(([x1, y1, x2, y2], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="white"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        ))}
        <circle cx="11" cy="11" r="2.5" fill="#7C3AED" />
      </svg>
    </div>
  );
}

export function AIPanel({
  title = "Khuyến nghị từ AI",
  headline,
  body,
  rec,
  dark,
}) {
  return (
    <div
      style={{
        background: dark ? "#1C1040" : "#F5F0FF",
        border: `1px solid ${dark ? "#5B21B6" : "#7C3AED"}`,
        borderRadius: 12,
        padding: 15,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <AIIcon />
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: dark ? "#C4B5FD" : "#6D28D9",
              textTransform: "uppercase",
              letterSpacing: ".07em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 10,
              color: dark ? "rgba(196,181,253,.7)" : "#9333EA",
              marginTop: 2,
              fontWeight: 500,
            }}
          >
            StockTraders AI · 19/06/2026
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: dark ? "#fff" : "#3B0764",
          marginBottom: 8,
          lineHeight: 1.35,
        }}
      >
        {headline}
      </div>
      <div
        style={{
          fontSize: 13,
          color: dark ? "#E9D5FF" : "#4C1D95",
          lineHeight: 1.65,
          textAlign: "left",
        }}
      >
        {body}
      </div>
      {rec && (
        <div
          style={{
            background: dark ? "rgba(0,0,0,.25)" : "rgba(109,40,217,.10)",
            border: `1px solid ${dark ? "rgba(255,255,255,.15)" : "rgba(109,40,217,.30)"}`,
            borderRadius: 9,
            padding: "9px 12px",
            marginTop: 10,
            fontSize: 12,
            fontWeight: 600,
            color: dark ? "#DDD6FE" : "#5B21B6",
            display: "flex",
            gap: 7,
            alignItems: "flex-start",
            lineHeight: 1.5,
          }}
        >
          <i
            className="ti ti-info-circle"
            style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}
          />
          {rec}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HIST DONUT NAVIGATOR
// ─────────────────────────────────────────────────────────────
