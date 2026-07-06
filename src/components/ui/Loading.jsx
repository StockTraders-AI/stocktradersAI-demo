/* ─────────────────────────── LOADING ───────────────────────────────────
 * Skeleton loading dùng chung cho mọi page/card: các pill shimmer + spinner
 * kèm nhãn. Khung dùng CSS var (var(--elev)…) nên tự đổi theo theme.
 *
 *   <Loading label="Đang tải dữ liệu SMDT…" />          // skeleton + spinner
 *   <Loading label="Đang tải danh sách ngành…" compact /> // chỉ spinner + nhãn
 * ─────────────────────────────────────────────────────────────────────── */

const SKELETON_ROWS = [
  { width: "97%", pills: [1, 1.05, 1.1] },
  { width: "91%", pills: [1.1, 0.82, 1.18] },
  { width: "66%", pills: [1, 1.2] },
];

const keyframes = `
@keyframes ui-loading-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes ui-loading-spin { to { transform: rotate(360deg); } }
`;

function Spinner({ size = 16 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        boxSizing: "border-box",
        border: "2.5px solid var(--bdr)",
        borderTopColor: "#7C3AED",
        animation: "ui-loading-spin .8s linear infinite",
        display: "inline-block",
      }}
    />
  );
}

export function Loading({ label = "Đang tải dữ liệu…", rows = 3, pillHeight = 46, compact = false, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <style>{keyframes}</style>
      {!compact && (
        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          {SKELETON_ROWS.slice(0, rows).map((row, ri) => (
            <div key={ri} style={{ display: "flex", gap: 13, width: row.width }}>
              {row.pills.map((flex, pi) => (
                <div
                  key={pi}
                  style={{
                    flex,
                    height: pillHeight,
                    borderRadius: Math.min(pillHeight / 2, 23),
                    background: "linear-gradient(100deg, var(--elev) 40%, var(--bdr) 50%, var(--elev) 60%)",
                    backgroundSize: "200% 100%",
                    animation: "ui-loading-shimmer 1.6s linear infinite",
                    animationDelay: `${ri * 0.12}s`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Spinner />
        <span style={{ fontSize: 13, color: "var(--t2)", fontWeight: 500 }}>{label}</span>
      </div>
    </div>
  );
}
