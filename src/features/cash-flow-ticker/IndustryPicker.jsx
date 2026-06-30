import { useEffect, useRef, useState } from "react";
import { CfBadge } from "./CfBadge";

const CORE_INDUSTRY_GROUPS = [
  ["Môi giới chứng khoán", "Chứng khoán"],
  ["Ngân hàng thương mại truyền thống", "Ngân hàng"],
  ["Bất động sản dân cư", "BĐS Dân cư", "Bất động sản"],
  ["Sản xuất, chế biến thép", "Thép"],
  ["Xây dựng"],
  ["Sóng ngành Vin", "Vin", "Vingroup"],
];

const CORE_INDUSTRY_KEYS = new Set(CORE_INDUSTRY_GROUPS.flat().map(normalizeIndustryName));

function normalizeIndustryName(name) {
  return String(name || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getCoreRank(industry) {
  const normalized = normalizeIndustryName(industry);
  const index = CORE_INDUSTRY_GROUPS.findIndex((group) => group.some((item) => normalizeIndustryName(item) === normalized));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function splitIndustries(industries) {
  const core = [];
  const sub = [];
  for (const industry of industries) {
    if (CORE_INDUSTRY_KEYS.has(normalizeIndustryName(industry))) core.push(industry);
    else sub.push(industry);
  }
  core.sort((a, b) => getCoreRank(a) - getCoreRank(b) || a.localeCompare(b, "vi"));
  sub.sort((a, b) => {
    if (a === "Khác") return 1;
    if (b === "Khác") return -1;
    return a.localeCompare(b, "vi");
  });
  return [
    { id: "core", title: "Chủ lực", icon: "ti ti-star-filled", items: core },
    { id: "sub", title: "Ngành phụ", icon: null, items: sub },
  ].filter((section) => section.items.length > 0);
}

const pickerActionStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  font: "inherit",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  textTransform: "none",
  letterSpacing: 0,
};

export function IndustryPicker({ industries, hidden, industrySig, onToggle, onAll, onNone, onShowIndustries, onHideIndustries, style, buttonStyle }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const selected = industries.filter((i) => !hidden.has(i)).length;
  const sections = splitIndustries(industries);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0, ...style }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ minHeight: 30, display: "inline-flex", alignItems: "center", gap: 7, padding: "0 14px", borderRadius: 15, background: open ? "var(--Bs)" : "var(--surf)", border: `1px solid ${open ? "var(--Bb)" : "var(--bdr)"}`, color: "var(--B)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", ...buttonStyle }}
      >
        <i className="ti ti-stack-2" style={{ fontSize: 14 }} />
        {selected} / {industries.length} ngành
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: 13 }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 60, width: 360, maxWidth: "calc(100vw - 28px)", maxHeight: 480, overflowY: "auto", background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 12, padding: "0 10px 10px", boxShadow: "0 16px 42px rgba(15,23,42,.18)" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 10px", background: "var(--surf)", borderBottom: "1px solid var(--bdr)" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em" }}>Chọn ngành</span>
            <span style={{ display: "inline-flex", gap: 12 }}>
              <button onClick={onAll} style={{ ...pickerActionStyle, color: "var(--B)" }}>Tất cả</button>
              <button onClick={onNone} style={{ ...pickerActionStyle, color: "var(--R)" }}>Bỏ hết</button>
            </span>
          </div>
          {sections.map((section, sectionIndex) => (
            <div key={section.id} style={{ paddingTop: sectionIndex === 0 ? 12 : 16, borderTop: sectionIndex === 0 ? "none" : "1px solid var(--bdr)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 6px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--t3)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em" }}>
                  {section.icon && <i className={section.icon} style={{ fontSize: 13, color: "#ffd166" }} />}
                  {section.title}
                  <span style={{ minWidth: 24, height: 18, padding: "0 7px", borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--elev)", color: "var(--t3)", fontSize: 11, fontWeight: 800 }}>{section.items.length}</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                  <button onClick={() => onShowIndustries?.(section.items)} style={{ ...pickerActionStyle, color: "var(--B)" }}>Tất cả</button>
                  <button onClick={() => onHideIndustries?.(section.items)} style={{ ...pickerActionStyle, color: "var(--t4)" }}>Bỏ</button>
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {section.items.map((ind) => {
                  const on = !hidden.has(ind);
                  return (
                    <button
                      key={ind}
                      onClick={() => onToggle(ind)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 8px", borderRadius: 8, background: on ? "var(--Bs)" : "transparent", border: "none", borderLeft: `2px solid ${on ? "var(--B)" : "transparent"}`, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                        <span style={{ width: 18, height: 18, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "var(--B)" : "transparent", border: `1.5px solid ${on ? "var(--B)" : "var(--bdr)"}`, color: "#fff", flexShrink: 0 }}>
                          {on && <i className="ti ti-check" style={{ fontSize: 12 }} />}
                        </span>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, color: on ? "var(--t1)" : "var(--t2)", textAlign: "left" }}>{ind}</span>
                      </span>
                      <CfBadge sig={industrySig[ind]} small />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
