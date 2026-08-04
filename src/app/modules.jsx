import { ModDashboard } from "../features/dashboard/Dashboard";
import { ModSMDTNganh } from "../features/smdt-branch/SMDTBranch";
import { ModDongTienNganh } from "../features/cash-flow-branch/CashFlowBranch";
import { ModDongTienCP } from "../features/cash-flow-ticker/CashFlowTicker";
import { ModSMDTMa } from "../features/smdt-ticker/SMDTTicker";
import { ModTopMaManh } from "../features/top-strong-tickers/TopStrongTickers";
import { ModDongTienTT } from "../features/market-flow/MarketFlow";
import { ModPhanTichDanhMuc } from "../features/portfolio-analysis/PortfolioAnalysis";
import { ModLoTrinhDanSong } from "../features/wave-path/WavePath";

export const DEFAULT_MODULE_ID = "dashboard";

/* ─────────────────────────── MODULE REGISTRY ───────────────────────────
 * Mỗi module: tiêu đề + phụ đề + path tiếng Việt, render qua <ModuleView>.
 * Dữ liệu thật: "smdt-nganh" (useSMDT).
 * Các module còn lại dùng dữ liệu mẫu theo bản thiết kế tham khảo.
 * ─────────────────────────────────────────────────────────────────────── */
export const MODULES = {
  dashboard: {
    title: "Dashboard",
    sub: "Tổng quan thị trường hôm nay",
    path: "/dashboard",
  },
  "do-song": {
    title: "Dò sóng thị trường",
    sub: "Nhận diện sớm chu kỳ · đi trước dòng tiền",
    path: "/do-song-thi-truong",
  },
  "dong-tien-tt": {
    title: "Thị trường",
    sub: "Tổng hợp GTGD · Khối ngoại · Tự doanh",
    path: "/thi-truong",
  },
  "dong-tien-nganh": {
    title: "Dòng tiền ngành",
    sub: "Chủ lực 6 ngành — theo dõi vào/ra theo ngày",
    path: "/nganh/dong-tien-nganh",
  },
  "smdt-nganh": {
    title: "SMDT ngành",
    sub: "Sức mạnh dòng tiền theo ngành · Heatmap",
    path: "/nganh/suc-manh-dong-tien",
  },
  "lo-trinh-dan-song": {
    title: "Lộ trình dẫn sóng",
    sub: "Timeline ngành vượt ngưỡng SMDT · dữ liệu thật",
    path: "/nganh/lo-trinh-dan-song",
  },
  "dong-tien-cp": {
    title: "Dòng tiền cổ phiếu",
    sub: "Tín hiệu từng mã — theo dõi nhiều phiên",
    path: "/co-phieu/dong-tien-co-phieu",
  },
  "smdt-ma": {
    title: "SMDT cổ phiếu",
    sub: "SMDT từng cổ phiếu theo ngày · realtime",
    path: "/co-phieu/suc-manh-dong-tien",
  },
  "top-ma-manh": {
    title: "Top mã mạnh",
    sub: "Xếp hạng mã theo SMDT · dòng tiền mã/ngành",
    path: "/co-phieu/top-ma-manh",
  },
  "portfolio-analysis": {
    title: "Phân tích danh mục",
    sub: "Dữ liệu thật · StockTraders API",
    path: "/danh-muc/phan-tich-danh-muc",
  },
};

const PATH_TO_MODULE = Object.fromEntries(
  Object.entries(MODULES).map(([id, mod]) => [
    normalizeModulePath(mod.path),
    id,
  ]),
);

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

export function normalizeModulePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "/";
  const [pathname] = raw.split(/[?#]/);
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

export function getModulePath(id) {
  return MODULES[id]?.path || MODULES[DEFAULT_MODULE_ID].path;
}

export function resolveModuleId(value) {
  if (MODULES[value]) return value;
  const pathId = PATH_TO_MODULE[normalizeModulePath(value)];
  return pathId || null;
}

export function getInitialModuleId() {
  if (typeof window === "undefined") return DEFAULT_MODULE_ID;
  return resolveModuleId(window.location.pathname) || DEFAULT_MODULE_ID;
}

export function writeModulePath(id, { replace = false } = {}) {
  if (typeof window === "undefined") return;
  const path = getModulePath(id);
  if (
    normalizeModulePath(window.location.pathname) === normalizeModulePath(path)
  )
    return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({ moduleId: id }, "", path);
}

export function ModuleView({ id, tradingDate }) {
  switch (id) {
    case "dashboard":
      return <ModDashboard tradingDate={tradingDate} />;
    case "smdt-nganh":
      return <ModSMDTNganh />;
    case "lo-trinh-dan-song":
      return <ModLoTrinhDanSong />;
    case "dong-tien-nganh":
      return <ModDongTienNganh />;
    case "dong-tien-cp":
      return <ModDongTienCP />;
    case "smdt-ma":
      return <ModSMDTMa />;
    case "top-ma-manh":
      return <ModTopMaManh />;
    case "portfolio-analysis":
      return <ModPhanTichDanhMuc />;
    case "dong-tien-tt":
      return <ModDongTienTT />;
    default:
      return <ModDashboard />;
  }
}
