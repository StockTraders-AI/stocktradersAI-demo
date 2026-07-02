export function Card({ children, style, noPad }) {
  return (
    <div
      style={{
        background: "var(--surf)",
        border: "0.5px solid var(--bdr)",
        borderRadius: 12,
        padding: noPad ? 0 : "12px 14px",
        overflow: noPad ? "hidden" : undefined,
        transition: "background .2s",
        ...style,
      }}
    >
      {children}
    </div>
  );
}



export function CardHeader({ icon, title, meta, right, mb = 13 }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: mb,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          minWidth: 0,
          flex: "1 1 180px",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--t1)",
        }}
      >
        <i
          className={`ti ${icon}`}
          style={{ fontSize: 15, color: "var(--t3)" }}
        />
        {title}
        {meta && (
          <span style={{ fontSize: 10, color: "var(--t4)", fontWeight: 400 }}>
            {meta}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}



export function Clink({ children, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        fontSize: 12,
        color: "var(--B)",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}



export function FilterChips({ options, active, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        marginBottom: 13,
        flexWrap: "wrap",
      }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            background: active === o.id ? "var(--Bs)" : "var(--surf)",
            border: `0.5px solid ${active === o.id ? "var(--Bb)" : "var(--bdr)"}`,
            borderRadius: 20,
            padding: "6px 13px",
            fontSize: 12,
            fontWeight: active === o.id ? 700 : 500,
            color: active === o.id ? "var(--B)" : "var(--t2)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontFamily: "inherit",
            transition: "all .12s",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}



export function SearchBox({ placeholder }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: "var(--surf)",
        border: "0.5px solid var(--bdr)",
        borderRadius: 8,
        padding: "6px 11px",
        minWidth: 175,
      }}
    >
      <i
        className="ti ti-search"
        style={{ fontSize: 13, color: "var(--t4)" }}
      />
      <input
        placeholder={placeholder}
        style={{
          background: "none",
          border: "none",
          outline: "none",
          fontSize: 12,
          color: "var(--t2)",
          width: "100%",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}



export function TableWrap({ children, minWidth = 600 }) {
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth,
          tableLayout: "fixed",
        }}
      >
        {children}
      </table>
    </div>
  );
}



export function THead({ cols }) {
  return (
    <thead>
      <tr>
        {cols.map((c, i) => (
          <th
            key={i}
            style={{
              width: c.width,
              fontSize: 10,
              fontWeight: 700,
              color: "var(--t3)",
              textTransform: "uppercase",
              letterSpacing: ".07em",
              padding: "8px 10px",
              borderBottom: "0.5px solid var(--bdr)",
              textAlign: c.right ? "right" : c.center ? "center" : "left",
              whiteSpace: "nowrap",
              background: "var(--elev)",
            }}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}



export function Pagination({ current = 1, total = 5, t }) {
  const pages = [
    1,
    2,
    3,
    total > 4 ? "..." : null,
    total > 3 ? total : null,
  ].filter(Boolean);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {["‹", ...pages, "›"].map((p, i) => (
        <div
          key={i}
          style={{
            width: 30,
            height: 30,
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            cursor: "pointer",
            background: p === current ? "var(--B)" : "var(--elev)",
            border: `0.5px solid ${p === current ? "var(--B)" : "var(--bdr)"}`,
            color: p === current ? "#fff" : "var(--t3)",
            transition: "all .12s",
          }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}



export function StatCard({ label, val, sub, colorKey, t }) {
  const colors = {
    G: [t.Gs, t.Gb, t.G],
    MU: [t.MUs, t.MUb, t.MU],
    B: [t.Bs, t.Bb, t.B],
    A: [t.As, t.Ab, t.A],
    R: [t.Rs, t.Rb, t.R],
    P: [t.Ps, t.Pb, t.P],
  };
  const [bg, border, color] = colors[colorKey];
  return (
    <div
      style={{
        background: bg,
        border: `0.5px solid ${border}`,
        borderRadius: 12,
        padding: "13px 15px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: ".07em",
          marginBottom: 5,
          fontWeight: 700,
          color,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "-.5px",
          lineHeight: 1.1,
          color,
        }}
      >
        {val}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}



export function DistRow({ label, width, val, color }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}
    >
      <span
        style={{ fontSize: 12, color: "var(--t2)", width: 100, flexShrink: 0 }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 5,
          background: "var(--bdr)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${width}%`,
            background: color,
            borderRadius: 3,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          width: 80,
          textAlign: "right",
          color: "var(--t1)",
        }}
      >
        {val}
      </span>
    </div>
  );
}
