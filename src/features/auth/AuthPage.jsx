import { useEffect, useState } from "react";
import { useMarketIndices } from "../../data/useMarketIndices";
import { mono } from "../../styles/tokens";
import { useTheme } from "../../theme";

const NAV_ITEMS = [
  { icon: "ti-layout-dashboard", label: "Dashboard", dim: false },
  { icon: "ti-chart-line", label: "Thị trường", dim: false },
  { icon: "ti-briefcase", label: "Ngành", dim: true },
  { icon: "ti-building-store", label: "Cổ phiếu", dim: true },
  { icon: "ti-binoculars", label: "Dò sóng thị trường", dim: true },
  { icon: "ti-file-report", label: "Báo cáo", dim: true },
  { icon: "ti-book", label: "Kiến thức", dim: false },
  { icon: "ti-users", label: "Cộng đồng", dim: false },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return now;
}

function AuthTopbar({ isMobile }) {
  const { t, dark, toggle } = useTheme();
  const { indices } = useMarketIndices();
  const now = useClock();
  const stamp = `${now.toLocaleDateString("vi-VN")} · ${now.toLocaleTimeString("vi-VN")}`;

  return (
    <header style={styles.topbar}>
      <div style={styles.brandWrap}>
        <div style={styles.logo}>
          <i className="ti ti-chart-candle" style={{ color: "#fff", fontSize: 17 }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={styles.brandTitle}>StockTraders AI</div>
          <div style={styles.brandSub}>Đăng nhập để tiếp tục</div>
        </div>
      </div>

      {!isMobile && (
        <div style={styles.indexWrap}>
          {indices.slice(0, 3).map((idx) => (
            <div key={idx.name} style={styles.indexPill}>
              <span style={styles.indexName}>{idx.name}</span>
              <span style={{ ...styles.indexValue, ...mono }}>
                {idx.val}
                <span style={{ ...styles.indexPct, color: idx.rawPct == null ? "var(--t3)" : idx.rawPct >= 0 ? t.G : t.R }}>
                  {idx.pct}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={styles.topbarActions}>
        {!isMobile && (
          <div style={styles.liveStamp}>
            <span style={{ ...styles.liveDot, background: t.G }} />
            {stamp}
          </div>
        )}
        {!isMobile && (
          <>
            <div style={styles.iconBtn}>
              <i className="ti ti-calendar" />
            </div>
            <div style={{ ...styles.iconBtn, position: "relative" }}>
              <i className="ti ti-bell" />
              <span style={{ ...styles.ping, background: t.R }} />
            </div>
            <div style={styles.iconBtn}>
              <i className="ti ti-help" />
            </div>
          </>
        )}
        <button type="button" onClick={toggle} title="Đổi Sáng/Tối" style={styles.iconBtn}>
          <i className={`ti ${dark ? "ti-sun" : "ti-moon"}`} />
        </button>
        <div style={{ ...styles.avatar, background: t.Bs, borderColor: t.Bb, color: t.B }}>--</div>
      </div>
    </header>
  );
}

function AuthSidebar() {
  const { t, dark } = useTheme();

  return (
    <aside style={styles.sidebar}>
      {NAV_ITEMS.map((item) => (
        <div key={item.label} style={{ ...styles.navItem, opacity: item.dim ? 0.42 : 1 }}>
          <i className={`ti ${item.icon}`} style={styles.navIcon} />
          <span>{item.label}</span>
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <div style={{ ...styles.lockCard, background: dark ? "linear-gradient(135deg,#1A1430,#12172A)" : t.Bs, borderColor: t.Bb }}>
        <div style={{ ...styles.lockTitle, color: dark ? t.P : t.B }}>
          <i className="ti ti-lock-star" />
          Đăng nhập để tiếp tục
        </div>
        <div style={styles.lockBody}>
          Vào hệ thống để xem dữ liệu SMDT, dòng tiền theo ngành và mã cổ phiếu.
        </div>
      </div>
    </aside>
  );
}

function TextField({ label, ...props }) {
  return (
    <label style={styles.fieldGroup}>
      <span style={styles.fieldLabel}>{label}</span>
      <input {...props} style={styles.fieldInput} />
    </label>
  );
}

function LoginForm({ onSubmit }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit?.({ identifier, password, remember });
    }}>
      <button type="button" style={styles.socialBtn}>
        <i className="ti ti-brand-google" />
        Tiếp tục với Google
      </button>
      <div style={styles.divider}><span>hoặc</span></div>

      <TextField label="Email hoặc số điện thoại" type="text" placeholder="name@congty.com hoặc 0912345678" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
      <TextField label="Mật khẩu" type="password" placeholder="Nhập mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} />

      <div style={styles.helperRow}>
        <label style={styles.checkboxLabel}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Ghi nhớ đăng nhập
        </label>
        <button type="button" style={styles.linkBtn}>Quên mật khẩu?</button>
      </div>

      <button type="submit" style={styles.submitBtn}>Đăng nhập</button>
    </form>
  );
}

function RegisterForm({ onSubmit }) {
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit?.({ fullName, identifier, password });
    }}>
      <button type="button" style={styles.socialBtn}>
        <i className="ti ti-brand-google" />
        Đăng ký với Google
      </button>
      <div style={styles.divider}><span>hoặc</span></div>

      <TextField label="Họ và tên" type="text" placeholder="Nguyễn Văn A" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <TextField label="Email hoặc số điện thoại" type="text" placeholder="name@congty.com hoặc 0912345678" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
      <TextField label="Mật khẩu" type="password" placeholder="Tối thiểu 8 ký tự" value={password} onChange={(e) => setPassword(e.target.value)} />

      <button type="submit" style={styles.submitBtn}>Tạo tài khoản</button>
      <div style={styles.note}>
        <i className="ti ti-info-circle" style={{ fontSize: 14 }} />
        Tài khoản mới mặc định non-paid. Nâng cấp Premium để xem đầy đủ dữ liệu SMDT, dòng tiền và lịch sử không giới hạn.
      </div>
    </form>
  );
}

function AuthCard({ onLogin, onRegister }) {
  const { t } = useTheme();
  const [tab, setTab] = useState("login");
  const isLogin = tab === "login";

  return (
    <section style={styles.card}>
      <div style={styles.tabs} role="tablist" aria-label="Chọn hình thức xác thực">
        <button
          type="button"
          onClick={() => setTab("login")}
          style={{ ...styles.tab, ...(isLogin ? { background: t.B, color: "#fff" } : null) }}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          onClick={() => setTab("register")}
          style={{ ...styles.tab, ...(!isLogin ? { background: t.B, color: "#fff" } : null) }}
        >
          Đăng ký
        </button>
      </div>

      {isLogin ? <LoginForm onSubmit={onLogin} /> : <RegisterForm onSubmit={onRegister} />}
    </section>
  );
}

export function AuthPage({ onLogin, onRegister }) {
  const [width, setWidth] = useState(() => window.innerWidth);
  const isMobile = width < 768;

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div style={styles.shell}>
      <AuthTopbar isMobile={isMobile} />
      <div style={styles.content}>
        {!isMobile && <AuthSidebar />}
        <main style={{ ...styles.main, padding: isMobile ? "24px 14px" : "40px 24px" }}>
          <AuthCard onLogin={onLogin} onRegister={onRegister} />
        </main>
      </div>
    </div>
  );
}

const styles = {
  shell: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg)",
    color: "var(--t1)",
    overflow: "hidden",
  },
  topbar: {
    height: 52,
    flexShrink: 0,
    background: "var(--surf)",
    borderBottom: "0.5px solid var(--bdr)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    gap: 16,
  },
  brandWrap: { display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexShrink: 0 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg,#7C3AED,#4F46E5)",
    flexShrink: 0,
  },
  brandTitle: { fontSize: 14, fontWeight: 800, color: "var(--t1)", letterSpacing: "-.2px", whiteSpace: "nowrap" },
  brandSub: { fontSize: 10.5, color: "var(--t3)", marginTop: 1, whiteSpace: "nowrap" },
  indexWrap: { display: "flex", gap: 7, minWidth: 0, flex: 1 },
  indexPill: {
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    background: "var(--elev)",
    border: "0.5px solid var(--bdr)",
    borderRadius: 7,
    padding: "5px 10px",
    minWidth: 0,
  },
  indexName: { fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" },
  indexValue: { fontSize: 13, color: "var(--t1)" },
  indexPct: { fontSize: 10, marginLeft: 5, fontWeight: 700 },
  topbarActions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  liveStamp: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap" },
  liveDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block", animation: "pulse 2s infinite" },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--elev)",
    border: "0.5px solid var(--bdr)",
    color: "var(--t3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  },
  ping: { position: "absolute", top: 5, right: 5, width: 6, height: 6, borderRadius: "50%", border: "1.5px solid var(--surf)" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "0.5px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 800,
  },
  content: { flex: 1, minHeight: 0, display: "flex" },
  sidebar: {
    width: 224,
    background: "var(--surf)",
    borderRight: "0.5px solid var(--bdr)",
    display: "flex",
    flexDirection: "column",
    padding: "14px 12px",
    overflow: "hidden",
    flexShrink: 0,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 10px",
    borderRadius: 8,
    color: "var(--t2)",
    fontSize: 13,
    fontWeight: 550,
  },
  navIcon: { width: 16, color: "var(--t3)", fontSize: 16, flexShrink: 0 },
  lockCard: {
    border: "0.5px solid",
    borderRadius: 10,
    padding: 12,
  },
  lockTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10,
    fontWeight: 850,
    textTransform: "uppercase",
    letterSpacing: ".08em",
    marginBottom: 6,
  },
  lockBody: { color: "var(--t2)", fontSize: 11, lineHeight: 1.5 },
  main: {
    flex: 1,
    minWidth: 0,
    overflow: "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 374,
    background: "var(--surf)",
    border: "0.5px solid var(--bdr)",
    borderRadius: 12,
    padding: "28px 28px 30px",
    boxShadow: "0 18px 60px rgba(0,0,0,.14)",
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 4,
    background: "var(--elev)",
    borderRadius: 9,
    padding: 4,
    marginBottom: 22,
  },
  tab: {
    height: 34,
    border: "none",
    borderRadius: 7,
    background: "transparent",
    color: "var(--t3)",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  socialBtn: {
    width: "100%",
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "var(--elev)",
    border: "0.5px solid var(--bdr)",
    borderRadius: 8,
    color: "var(--t1)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "16px 0",
    color: "var(--t4)",
    fontSize: 11,
  },
  fieldGroup: { display: "block", marginBottom: 14 },
  fieldLabel: { display: "block", marginBottom: 6, color: "var(--t2)", fontSize: 12, fontWeight: 600 },
  fieldInput: {
    width: "100%",
    height: 38,
    background: "var(--bg)",
    border: "0.5px solid var(--bdr)",
    borderRadius: 8,
    color: "var(--t1)",
    outline: "none",
    padding: "0 11px",
    fontSize: 13,
  },
  helperRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 7, fontSize: 11, color: "var(--t3)" },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 },
  linkBtn: { border: "none", background: "transparent", color: "var(--B)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  submitBtn: {
    width: "100%",
    height: 42,
    marginTop: 18,
    background: "var(--B)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 850,
    cursor: "pointer",
  },
  note: {
    display: "flex",
    gap: 7,
    alignItems: "flex-start",
    marginTop: 16,
    background: "var(--bg)",
    border: "0.5px solid var(--bdr)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "var(--t2)",
    fontSize: 11,
    lineHeight: 1.5,
  },
};
