// hmColor():
// - Quy đổi class heatmap như hm100/hm70/hm50 thành màu.
// - Các component HM dùng hàm này để đồng nhất màu bảng.

export function hmColor(cls, t) {
  const map = {
    hm100: { bg: t.Gs, border: t.Gb, color: t.G },
    hm70: {
      bg: "rgba(29,184,122,.07)",
      border: "rgba(29,184,122,.18)",
      color: t.G,
    },
    hm50: { bg: t.As, border: t.Ab, color: t.A },
    hm20: { bg: t.Rs, border: t.Rb, color: t.R },
    hmneg: { bg: "rgba(239,68,68,.20)", border: t.Rb, color: t.R },
  };
  return map[cls] || map.hm50;
}

