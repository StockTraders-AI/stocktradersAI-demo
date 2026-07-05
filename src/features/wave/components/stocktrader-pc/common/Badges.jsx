// Các nhãn màu dùng trong bảng: HM, Sig, Tag.

import { hmStyle, sigStyle, tagStyle } from "../utils/styleHelpers";

export function HM({ cls, val, t }) {
  const s = hmStyle(cls, t);
  return (
    <span
      style={{
        borderRadius: 6,
        padding: "5px 9px",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 700,
        display: "inline-block",
        minWidth: 62,
        background: s.bg,
        border: `0.5px solid ${s.border}`,
        color: s.color,
      }}
    >
      {val}
    </span>
  );
}



export function Sig({ type, t }) {
  const s = sigStyle(type, t);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        background: s.bg,
        color: s.color,
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
  const s = tagStyle(cls, t);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        padding: "3px 9px",
        borderRadius: 20,
        border: `0.5px solid ${s.border}`,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: s.bg,
        color: s.color,
      }}
    >
      {children}
    </span>
  );
}

