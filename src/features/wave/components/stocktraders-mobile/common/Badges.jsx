import { hmColor } from "../utils/styleHelpers";

export function HM({ cls, val, t }) {
  const c = hmColor(cls, t);
  return (
    <span
      style={{
        borderRadius: 6,
        padding: "5px 8px",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 700,
        display: "inline-block",
        minWidth: 54,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.color,
      }}
    >
      {val}
    </span>
  );
}

export function Sig({ type, t }) {
  const map = {
    si: { bg: t.Gs, color: t.G, label: "Tiếp tục đổ vào" },
    sn: { bg: t.Bs, color: t.B, label: "Nhen nhóm đổ vào" },
    so: { bg: t.As, color: t.A, label: "Đang thoát ra" },
    st: { bg: t.Rs, color: t.R, label: "Tiếp tục thoát ra" },
  };
  const s = map[type];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 9px",
        borderRadius: 6,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "currentColor",
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  );
}

export function Tag({ cls, children, t }) {
  const map = {
    tg: { bg: t.Gs, border: t.Gb, color: t.G },
    tb: { bg: t.Bs, border: t.Bb, color: t.B },
    ta: { bg: t.As, border: t.Ab, color: t.A },
    tr: { bg: t.Rs, border: t.Rb, color: t.R },
  };
  const c = map[cls] || map.tg;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        padding: "3px 9px",
        borderRadius: 20,
        border: `1px solid ${c.border}`,
        fontWeight: 500,
        background: c.bg,
        color: c.color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

