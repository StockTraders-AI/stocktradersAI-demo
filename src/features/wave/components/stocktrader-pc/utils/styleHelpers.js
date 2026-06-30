// Map trạng thái dữ liệu sang màu nền, viền và chữ.

export function hmStyle(cls, t) {
  const m = {
    100: { bg: t.Gs, border: t.Gb, color: t.G },
    70: {
      bg: `rgba(61,214,140,.07)`,
      border: `rgba(61,214,140,.18)`,
      color: t.G,
    },
    50: { bg: t.As, border: t.Ab, color: t.A },
    20: { bg: t.Rs, border: t.Rb, color: t.R },
    neg: { bg: `rgba(255,45,85,.18)`, border: t.Rb, color: t.R },
  };
  return m[cls] || m["50"];
}


export function sigStyle(type, t) {
  return {
    si: { bg: t.Gs, color: t.G, label: "Tiếp tục đổ vào" },
    sn: { bg: t.Bs, color: t.B, label: "Nhen nhóm đổ vào" },
    so: { bg: t.As, color: t.A, label: "Đang thoát ra" },
    st: { bg: t.Rs, color: t.R, label: "Tiếp tục thoát ra" },
  }[type];
}


export function tagStyle(cls, t) {
  return {
    tg: { bg: t.Gs, border: t.Gb, color: t.G },
    tb: { bg: t.Bs, border: t.Bb, color: t.B },
    ta: { bg: t.As, border: t.Ab, color: t.A },
    tr: { bg: t.Rs, border: t.Rb, color: t.R },
  }[cls];
}

// ─────────────────────────────────────────────────────────────
// PRIMITIVE COMPONENTS
// ─────────────────────────────────────────────────────────────
