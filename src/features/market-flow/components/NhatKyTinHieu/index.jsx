import { useEffect, useState } from "react";
import { formatStockNotiDate, NHAT_KY_CAP, NHAT_KY_DARK_COLORS, NHAT_KY_LIGHT_COLORS, NHAT_KY_TABS } from "./helpers.js";
function getNhatKyKind(row) {
  if (row?.k) return row.k;
  if (row?.tone === "R") return "down";
  if (row?.tone === "A") return "warn";
  if (row?.channel === "wave" || row?.tone === "B") return "wave";
  return "up";
}

function getSmdtBand(value, mode = "dark") {
  const number = Number(value);
  if (mode === "light") {
    if (Number.isFinite(number) && number >= 100) return { bg:"#DCFCE7", bd:"#86EFAC", sk:"#059669" };
    if (Number.isFinite(number) && number >= 70) return { bg:"#EAF8EF", bd:"#BFEACF", sk:"#16A05D" };
    if (Number.isFinite(number) && number >= 20) return { bg:"#FFF7E6", bd:"#F3CE8B", sk:"#D97706" };
    return { bg:"#FFECEF", bd:"#F5B8C3", sk:"#E11D48" };
  }
  if (Number.isFinite(number) && number >= 100) return { bg:"#0A2A1C", bd:"#124A30", sk:"#3DE8A8" };
  if (Number.isFinite(number) && number >= 70) return { bg:"#0A2318", bd:"#0F3D22", sk:"#3DD68C" };
  if (Number.isFinite(number) && number >= 20) return { bg:"#2B1B08", bd:"#4A3010", sk:"#E89A3C" };
  return { bg:"#2A0E12", bd:"#4A1820", sk:"#F0555B" };
}

function NhatKyIcon({ k, smdtValue, colors = NHAT_KY_DARK_COLORS }) {
  const C = colors;
  const iconKey = k === "smdt" ? "smdt" : k;
  const smdtBand = iconKey === "smdt" ? getSmdtBand(smdtValue, C.mode) : null;
  const sk = smdtBand?.sk || (iconKey === "down" ? C.bac : iconKey === "warn" ? C.cbc : iconKey === "wave" ? C.B : C.cmc);
  const bg = smdtBand?.bg || (iconKey === "down" ? C.bab : iconKey === "warn" ? C.cbb : iconKey === "wave" ? C.pb : C.cmb);
  const bd = smdtBand?.bd || (iconKey === "down" ? C.bad : iconKey === "warn" ? C.cbd : iconKey === "wave" ? C.pd : C.cmd);
  const paths = {
    up:(
      <>
        <polyline points="3,17 9,11 13,15 21,7" stroke={sk} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="15,7 21,7 21,13" stroke={sk} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    down:(
      <>
        <polyline points="3,7 9,13 13,9 21,17" stroke={sk} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="15,17 21,17 21,11" stroke={sk} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    warn:(
      <>
        <circle cx="12" cy="12" r="9" stroke={sk} strokeWidth="2.2" />
        <line x1="12" y1="7.5" x2="12" y2="13" stroke={sk} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="16.6" r="1.3" fill={sk} />
      </>
    ),
    wave:<path d="M3 12h3l2.5-6 4 12 2.5-6h6" stroke={sk} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    smdt:<path d="M12 3c3.2 3 4.5 5.4 4.5 8.2a4.5 4.5 0 0 1-9 0c0-1.3.6-2.4 1.7-3.3.1 1.2.6 1.9 1.2 2.4-.2-2.4-1-4.6 1.6-7.3Z" stroke={sk} strokeWidth="1.9" strokeLinejoin="round" fill={`${sk}22`} />,
  };

  return (
    <span style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, marginTop:1, display:"flex", alignItems:"center", justifyContent:"center", background:bg, border:`1px solid ${bd}` }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">{paths[iconKey]}</svg>
    </span>
  );
}

function toNhatKyRow(row) {
  return {
    id:row.id,
    t:row.t || row.time,
    date:row.date,
    rawDate:row.rawDate,
    sortKey:row.sortKey,
    cap:row.cap,
    k:getNhatKyKind(row),
    smdtValue:row.smdtValue,
    x:row.x || row.txt || row.content,
    title:row.title || row.tieuDe || "Tín hiệu",
    capTag:row.capTag || NHAT_KY_CAP[row.cap] || "Thị trường",
  };
}

function getNhatKyTagColor(tag) {
  if (tag === "Cổ phiếu") return "#22D3EE";
  if (tag === "Ngành") return "#3DD68C";
  return "#A78BFA";
}

function NhatKyRows({ rows, colors = NHAT_KY_DARK_COLORS }) {
  const C = colors;
  return rows.map((r, i) => {
    const tagColor = getNhatKyTagColor(r.capTag);
    return (
      <div key={r.id || i} style={{ display:"flex", gap:10, padding:"11px 0", borderBottom:i < rows.length - 1 ? `.5px solid ${C.bdrs}` : "none" }}>
        <NhatKyIcon k={r.k} smdtValue={r.smdtValue} colors={C} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2, minWidth:0 }}>
            <span style={{ fontSize:13.5, fontWeight:600, color:C.t1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.title}</span>
            <span style={{ fontSize:10, fontWeight:600, color:tagColor, background:`${tagColor}1A`, borderRadius:6, padding:"1px 7px", flexShrink:0 }}>{r.capTag}</span>
            <span style={{ fontSize:11, color:C.t4, marginLeft:"auto", flexShrink:0 }}>{r.t}</span>
          </div>
          <div style={{ fontSize:13, lineHeight:1.5, color:C.t2 }}>{r.x}</div>
        </div>
      </div>
    );
  });
}

export default function NhatKyTinHieu({
  logs = [],
  rows,
  onXemTatCa,
  onViewAll,
  theme = "dark",
  dateKey = "",
  collapsedLimit = 6,
  colors,
}) {
  const [tab, setTab] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const data = (rows || logs).map(toNhatKyRow);
  const date = data[0]?.date || (dateKey ? formatStockNotiDate(dateKey) : new Intl.DateTimeFormat("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" }).format(new Date()));
  const count = (id) => (id === "all" ? data.length : data.filter((d) => d.cap === id).length);
  const list = data.filter((d) => tab === "all" || d.cap === tab);
  const displayList = expanded ? list : list.slice(0, collapsedLimit);
  const hasMore = list.length > collapsedLimit;
  const C = colors || (theme === "light" ? NHAT_KY_LIGHT_COLORS : NHAT_KY_DARK_COLORS);

  const toggleExpanded = () => {
    setExpanded((value) => !value);
    if (!expanded) (onViewAll || onXemTatCa)?.();
  };

  useEffect(() => {
    setExpanded(false);
  }, [tab]);

  return (
    <div style={{ background:C.surf, borderRadius:14, overflow:"hidden", border:`0.5px solid ${C.cbdr}`, fontFamily:"-apple-system, Inter, sans-serif", boxShadow:theme === "light" ? "0 10px 28px rgba(15,23,42,.08)" : "none" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"16px 18px", borderBottom:`0.5px solid ${C.cbdr}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
          <span style={{ fontFamily:"'Be Vietnam Pro', Inter, sans-serif", fontSize:16, fontWeight:600, lineHeight:1.3, letterSpacing:0, color:C.t1, whiteSpace:"nowrap", margin:0 }}>Nhật ký tín hiệu</span>
          <span style={{ fontSize:12, color:C.t4, flexShrink:0 }}>{date}</span>
        </div>
        {hasMore && (
          <button onClick={toggleExpanded} style={{ border:"none", background:"transparent", padding:0, fontSize:12, color:C.B, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
            {expanded ? "Thu gọn ↑" : "Xem tất cả →"}
          </button>
        )}
      </div>

      <div style={{ padding:"12px 16px", borderBottom:`0.5px solid ${C.bdrs}` }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {NHAT_KY_TABS.map(([id, label]) => {
            const on = id === tab;
            return (
              <button key={id} onClick={() => setTab(id)} style={{ cursor:"pointer", textAlign:"center", padding:"10px 4px", borderRadius:10, background:on ? "rgba(124,58,237,.14)" : C.elev, border:`.5px solid ${on ? C.pd : C.cbdr}` }}>
                <div style={{ fontSize:14, fontWeight:600, color:on ? C.B : C.t2 }}>{label}</div>
                <div style={{ fontSize:12, color:on ? C.B : C.t4, marginTop:1 }}>({count(id)})</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding:"2px 18px 14px" }}>
        {list.length === 0 ? (
          <div style={{ padding:"28px 0", textAlign:"center", color:C.t4, fontSize:12 }}>Chưa có tín hiệu ở cấp này trong phiên.</div>
        ) : (
          <>
            <NhatKyRows rows={displayList} colors={C} />
            {expanded && hasMore && (
              <div style={{ padding:"14px 0", textAlign:"center", fontSize:11, color:C.t4 }}>— đã hiển thị tất cả {list.length} dòng —</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
