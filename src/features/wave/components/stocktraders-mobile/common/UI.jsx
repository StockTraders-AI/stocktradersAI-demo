// Chứa các khối UI tái sử dụng:
// - Card, CardHeader
// - FilterChips
// - StatCard
// - Pagination
// - TableWrap

export function Card({ children, style }) {
  return (
    <div
      style={{
        background: "var(--surf)",
        border: "1px solid var(--bdr)",
        borderRadius: 14,
        padding: "14px 15px",
        marginBottom: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ icon, title, meta, right }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 14,
          fontWeight: 700,
          color: "var(--t1)",
        }}
      >
        <i className={`ti ${icon}`} style={{ fontSize: 16 }} />
        {title}
        {meta && (
          <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 400 }}>
            {meta}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

export function FilterChips({ options, active, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        overflowX: "auto",
        scrollbarWidth: "none",
        marginBottom: 12,
        paddingBottom: 2,
      }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            background: active === o.id ? "var(--Bs)" : "var(--surf)",
            border: `1px solid ${active === o.id ? "var(--Bb)" : "var(--bdr)"}`,
            borderRadius: 20,
            padding: "8px 15px",
            fontSize: 13,
            fontWeight: active === o.id ? 700 : 500,
            color: active === o.id ? "var(--B)" : "var(--t2)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, sub, colorKey }) {
  const colors = {
    G: ["var(--Gs)", "var(--Gb)", "var(--G)"],
    B: ["var(--Bs)", "var(--Bb)", "var(--B)"],
    A: ["var(--As)", "var(--Ab)", "var(--A)"],
    R: ["var(--Rs)", "var(--Rb)", "var(--R)"],
    P: ["var(--Ps)", "var(--Pb)", "var(--P)"],
  };
  const [bg, border, color] = colors[colorKey];
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: "13px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          textTransform: "uppercase",
          letterSpacing: ".06em",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 800,
          color,
          letterSpacing: "-.5px",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function Pagination({ current = 1, total = 5 }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        marginTop: 12,
      }}
    >
      {[
        "‹",
        ...Array.from({ length: Math.min(total, 4) }, (_, i) => i + 1),
        total > 4 ? "..." : null,
        total > 4 ? total : null,
        "›",
      ]
        .filter(Boolean)
        .map((p, i) => (
          <div
            key={i}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              cursor: "pointer",
              background: p === current ? "var(--B)" : "var(--elev)",
              border: `1px solid ${p === current ? "var(--B)" : "var(--bdr)"}`,
              color: p === current ? "#fff" : "var(--t3)",
            }}
          >
            {p}
          </div>
        ))}
    </div>
  );
}

export function TableWrap({ children, minWidth = 500 }) {
  return (
    <div
      style={{
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        margin: "0 -14px",
        padding: "0 14px",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth }}>
        {children}
      </table>
    </div>
  );
}

