import { ModDashboard } from "../features/dashboard/Dashboard";
import { ModSMDTNganh } from "../features/smdt-branch/SMDTBranch";
import { ModDongTienNganh } from "../features/cash-flow-branch/CashFlowBranch";
import { ModDongTienCP } from "../features/cash-flow-ticker/CashFlowTicker";
import { ModSMDTMa } from "../features/smdt-ticker/SMDTTicker";
import { ModTopMaManh } from "../features/top-strong-tickers/TopStrongTickers";
import { ModDongTienTT } from "../features/market-flow/MarketFlow";
import { ModPhanTichDanhMuc } from "../features/portfolio-analysis/PortfolioAnalysis";
import { ModLoTrinhDanSong } from "../features/wave-path/WavePath";
import { ModDoSong } from "../features/stock-wave/StockWave";

/* ─────────────────────────── MODULE REGISTRY ───────────────────────────
 * Mỗi module: tiêu đề + phụ đề cho topbar, render qua <ModuleView>.
 * Dữ liệu thật: "smdt-nganh" (useSMDT).
 * Các module còn lại dùng dữ liệu mẫu theo bản thiết kế tham khảo.
 * ─────────────────────────────────────────────────────────────────────── */
export const MODULES = {
  "dashboard":       { title: "Dashboard",          sub: "Tổng quan thị trường hôm nay" },
  "do-song":         { title: "Dò sóng",             sub: "Dữ liệu thật · getStockWave API" },
  "dong-tien-tt":    { title: "Thị trường",          sub: "Tổng hợp GTGD · Khối ngoại · Tự doanh" },
  "dong-tien-nganh": { title: "Dòng tiền ngành",     sub: "Chủ lực 6 ngành — theo dõi vào/ra theo ngày" },
  "smdt-nganh":      { title: "SMDT ngành",          sub: "Sức mạnh dòng tiền theo ngành · Heatmap" },
  "lo-trinh-dan-song": { title: "Lộ trình dẫn sóng", sub: "Timeline ngành vượt ngưỡng SMDT · dữ liệu thật" },
  "dong-tien-cp":    { title: "Dòng tiền cổ phiếu",  sub: "Tín hiệu từng mã — theo dõi nhiều phiên" },
  "smdt-ma":         { title: "SMDT cổ phiếu",       sub: "SMDT từng cổ phiếu theo ngày · realtime" },
  "top-ma-manh":     { title: "Top mã mạnh",         sub: "Xếp hạng mã theo SMDT · dòng tiền mã/ngành" },
  "portfolio-analysis": { title: "Phân tích danh mục", sub: "Dữ liệu thật · StockTraders API" },
};

export const SIDEBAR_GROUPS = {
  industry: ["dong-tien-nganh", "smdt-nganh", "lo-trinh-dan-song"],
  stocks: ["dong-tien-cp", "smdt-ma", "top-ma-manh"],
  portfolio: ["portfolio-analysis"],
};

export const BOTTOM_TABS = [
  { id: "dashboard", icon: "ti-layout-grid", label: "Dashboard" },
  { id: "dong-tien-tt", icon: "ti-chart-line", label: "Thị trường" },
  { id: "smdt-nganh", icon: "ti-table", label: "SMDT" },
];

export function ModuleView({ id }) {
  switch (id) {
    case "dashboard":       return <ModDashboard />;
    case "do-song":         return <ModDoSong />;
    case "smdt-nganh":      return <ModSMDTNganh />;
    case "lo-trinh-dan-song": return <ModLoTrinhDanSong />;
    case "dong-tien-nganh": return <ModDongTienNganh />;
    case "dong-tien-cp":    return <ModDongTienCP />;
    case "smdt-ma":         return <ModSMDTMa />;
    case "top-ma-manh":     return <ModTopMaManh />;
    case "portfolio-analysis": return <ModPhanTichDanhMuc />;
    case "dong-tien-tt":    return <ModDongTienTT />;
    default:                return <ModDashboard />;
  }
}
