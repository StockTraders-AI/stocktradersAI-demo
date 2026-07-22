import { useEffect, useRef, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useMarketIndices } from "../../data/useMarketIndices";
import { mono } from "../../styles/tokens";
import { useTheme } from "../../theme";
import {
  AccessDeniedError,
  changePassword,
  getAccessRights,
  loginUser,
  loginWithSocial,
  registerUser,
  requestOtp,
  verifyOtp,
} from "./authApi";

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

const SOCIAL_PROVIDERS = [
  { id: "2", key: "google", icon: "ti-brand-google", label: "Google" },
];
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
let turnstileScriptPromise = null;

async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Không thể lấy thông tin tài khoản Google.");
  }

  return response.json();
}

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

function TextField({ label, placeholder, onFocus, onBlur, groupStyle, ...props }) {
  const [focused, setFocused] = useState(false);

  return (
    <label style={{ ...styles.fieldGroup, ...groupStyle }}>
      <span style={styles.fieldLabel}>{label}</span>
      <input
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        placeholder={focused ? "" : placeholder}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
        style={styles.fieldInput}
      />
    </label>
  );
}

function SocialButtons({ onSelect, disabled, prefix = "Tiếp tục với" }) {
  const provider = SOCIAL_PROVIDERS[0];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(provider)}
      disabled={disabled}
      title={`${prefix} ${provider.label}`}
      style={{ ...styles.socialBtn, ...(disabled ? styles.disabledBtn : null) }}
    >
      <i className={`ti ${provider.icon}`} />
      <span>{prefix} {provider.label}</span>
    </button>
  );
}

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("Turnstile chỉ chạy trên browser."));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-turnstile-script]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = "true";
    script.onload = () => resolve(window.turnstile);
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

function TurnstileWidget({ siteKey, resetKey, disabled, onToken }) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    if (!siteKey || disabled) return undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetRef.current) return;
        widgetRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken?.(token),
          "expired-callback": () => onToken?.(""),
          "error-callback": () => onToken?.(""),
        });
      })
      .catch(() => onToken?.(""));

    return () => {
      cancelled = true;
      if (window.turnstile && widgetRef.current) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
  }, [siteKey, disabled, onToken]);

  useEffect(() => {
    onToken?.("");
    if (window.turnstile && widgetRef.current) {
      window.turnstile.reset(widgetRef.current);
    }
  }, [resetKey, onToken]);

  if (!siteKey) return null;
  return <div ref={containerRef} style={styles.turnstileBox} />;
}

function OtpControls({ phoneNumber, purpose, disabled, onVerified }) {
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    setOtp("");
    setChallengeToken("");
    setError("");
    setMessage("");
    setVerified(false);
    setTurnstileToken("");
    setTurnstileResetKey((key) => key + 1);
    onVerified?.("");
  }, [phoneNumber, purpose, onVerified]);

  const handleSendOtp = async () => {
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Vui lòng xác minh CAPTCHA trước khi gửi OTP.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    setVerified(false);
    onVerified?.("");
    try {
      const result = await requestOtp({ phoneNumber, purpose, turnstileToken });
      setChallengeToken(result.challengeToken);
      setOtp("");
      setMessage(result.debugOtp ? `Đã gửi OTP. Mã test: ${result.debugOtp}` : "Đã gửi OTP đến số điện thoại của bạn.");
    } catch (err) {
      setError(err?.message || "Không thể gửi OTP.");
    } finally {
      setBusy(false);
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
    }
  };

  const handleVerifyOtp = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await verifyOtp({ phoneNumber, purpose, otp, challengeToken });
      setVerified(true);
      setMessage("Xác thực OTP thành công.");
      onVerified?.(result.verificationToken);
    } catch (err) {
      setVerified(false);
      onVerified?.("");
      setError(err?.message || "Không thể xác thực OTP.");
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy;
  const canVerify = Boolean(challengeToken && otp.trim().length === 6);
  const canSend = Boolean(phoneNumber && (!TURNSTILE_SITE_KEY || turnstileToken));

  return (
    <div style={styles.otpBox}>
      <TurnstileWidget
        siteKey={TURNSTILE_SITE_KEY}
        resetKey={`${phoneNumber}-${purpose}-${turnstileResetKey}`}
        disabled={isDisabled}
        onToken={setTurnstileToken}
      />
      <div style={styles.otpGrid}>
        <label style={styles.otpField}>
          <span style={styles.fieldLabel}>Mã OTP</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={isDisabled || verified}
            style={styles.fieldInput}
          />
        </label>
        <button type="button" onClick={handleSendOtp} disabled={isDisabled || !canSend} style={{ ...styles.otpBtn, ...(isDisabled || !canSend ? styles.disabledBtn : null) }}>
          {busy ? "..." : "Gửi OTP"}
        </button>
        <button type="button" onClick={handleVerifyOtp} disabled={isDisabled || !canVerify || verified} style={{ ...styles.otpBtn, ...(isDisabled || !canVerify || verified ? styles.disabledBtn : null) }}>
          {verified ? "Đã xác thực" : "Xác thực"}
        </button>
      </div>
      <StatusMessage type="error">{error}</StatusMessage>
      <StatusMessage>{message}</StatusMessage>
    </div>
  );
}

function GoogleLoginBridge({ requestKey, onSuccess, onError, onNonOAuthError }) {
  const handledRequestRef = useRef(0);
  const googleLogin = useGoogleLogin({
    scope: "openid email profile",
    prompt: "select_account",
    onSuccess,
    onError,
    onNonOAuthError,
  });

  useEffect(() => {
    if (!requestKey) return;
    if (handledRequestRef.current === requestKey) return;
    handledRequestRef.current = requestKey;
    googleLogin();
  }, [googleLogin, requestKey]);

  return null;
}

function StatusMessage({ type = "notice", children }) {
  if (!children) return null;
  const isError = type === "error";
  return (
    <div role={isError ? "alert" : "status"} style={isError ? styles.errorBox : styles.noticeBox}>
      <i className={`ti ${isError ? "ti-alert-circle" : "ti-info-circle"}`} />
      <span>{children}</span>
    </div>
  );
}

function AccessLockedNotice({ notice }) {
  if (!notice) return null;

  return (
    <div role="status" style={styles.accessLockedBox}>
      <div style={styles.accessLockedTitle}>
        <i className="ti ti-lock-star" />
        Chưa thuộc diện trải nghiệm Web
      </div>
      <div style={styles.accessLockedBody}>
        Bạn không thuộc diện được trải nghiệm phiên bản Web đợt này, hiện chỉ dành cho khách đang sử dụng gói Premium.
      </div>
    </div>
  );
}

function LoginForm({ onSubmit, onForgotPassword, onSocialLogin, isSubmitting, error, accessNotice }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit?.({ identifier, password, remember });
    }}>
      <SocialButtons onSelect={onSocialLogin} disabled={isSubmitting} />
      <div style={styles.divider}><span>hoặc</span></div>

      <TextField label="Email hoặc số điện thoại" type="text" autoComplete="new-password" placeholder="name@congty.com hoặc 0912345678" value={identifier} onChange={(e) => setIdentifier(e.target.value)} disabled={isSubmitting} />
      <TextField label="Mật khẩu" type="password" autoComplete="new-password" placeholder="Nhập mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} />

      <div style={styles.helperRow}>
        <label style={styles.checkboxLabel}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={isSubmitting} />
          Ghi nhớ đăng nhập
        </label>
        <button type="button" onClick={onForgotPassword} disabled={isSubmitting} style={styles.linkBtn}>Quên mật khẩu?</button>
      </div>

      <StatusMessage type="error">{error}</StatusMessage>
      <AccessLockedNotice notice={accessNotice} />

      <button type="submit" disabled={isSubmitting} style={{ ...styles.submitBtn, ...(isSubmitting ? styles.disabledBtn : null) }}>
        {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
      <div style={styles.note}>
        <i className="ti ti-info-circle" style={{ fontSize: 14 }} />
        Tài khoản mới mặc định non-paid. Nâng cấp Premium để xem đầy đủ dữ liệu không giới hạn.
      </div>
    </form>
  );
}

function RegisterForm({ onSubmit, onSocialLogin, isSubmitting, error, message }) {
  const [fullName, setFullName] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [otpVerificationToken, setOtpVerificationToken] = useState("");

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit?.({ fullName, userName, email, phoneNumber, password, otpVerificationToken });
    }}>
      <SocialButtons onSelect={onSocialLogin} disabled={isSubmitting} prefix="Đăng ký với" />
      <div style={styles.divider}><span>hoặc</span></div>

      <div style={styles.registerGrid}>
        <TextField label="Họ và tên" type="text" autoComplete="new-password" placeholder="Nguyễn Văn A" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={isSubmitting} groupStyle={styles.compactField} />
        <TextField label="Tài khoản" type="text" autoComplete="new-password" placeholder="admindemo" value={userName} onChange={(e) => setUserName(e.target.value)} disabled={isSubmitting} groupStyle={styles.compactField} />
        <TextField label="Email" type="email" autoComplete="new-password" placeholder="admin@yahoo.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} groupStyle={styles.compactField} />
        <TextField label="Số điện thoại" type="tel" autoComplete="new-password" placeholder="0989000005" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} disabled={isSubmitting} groupStyle={styles.compactField} />
      </div>
      <OtpControls phoneNumber={phoneNumber} purpose="register" disabled={isSubmitting} onVerified={setOtpVerificationToken} />
      <TextField label="Mật khẩu" type="password" autoComplete="new-password" placeholder="Tối thiểu 6 ký tự" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} groupStyle={styles.registerPasswordField} />

      <StatusMessage type="error">{error}</StatusMessage>
      <StatusMessage>{message}</StatusMessage>

      <button type="submit" disabled={isSubmitting || !otpVerificationToken} style={{ ...styles.submitBtn, ...(isSubmitting || !otpVerificationToken ? styles.disabledBtn : null) }}>
        {isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
      </button>
      <div style={styles.note}>
        <i className="ti ti-info-circle" style={{ fontSize: 14 }} />
        Tài khoản mới mặc định non-paid. Nâng cấp Premium để xem đầy đủ dữ liệu không giới hạn.
      </div>
    </form>
  );
}

function ForgotPasswordForm({ onBack, onSubmit, isSubmitting, error, message }) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [otpVerificationToken, setOtpVerificationToken] = useState("");

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      onSubmit?.({ phoneNumber, password, otpVerificationToken });
    }}>
      <div style={styles.formHead}>
        <button type="button" onClick={onBack} disabled={isSubmitting} style={styles.backBtn} title="Quay lại">
          <i className="ti ti-arrow-left" />
        </button>
        <div>
          <div style={styles.formTitle}>Quên mật khẩu</div>
          <div style={styles.formSub}>Cập nhật mật khẩu theo số điện thoại.</div>
        </div>
      </div>

      <TextField label="Số điện thoại" type="tel" placeholder="0989000005" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} disabled={isSubmitting} />
      <OtpControls phoneNumber={phoneNumber} purpose="change-password" disabled={isSubmitting} onVerified={setOtpVerificationToken} />
      <TextField label="Mật khẩu mới" type="password" placeholder="123456" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} />

      <StatusMessage type="error">{error}</StatusMessage>
      <StatusMessage>{message}</StatusMessage>

      <button type="submit" disabled={isSubmitting || !otpVerificationToken} style={{ ...styles.submitBtn, ...(isSubmitting || !otpVerificationToken ? styles.disabledBtn : null) }}>
        {isSubmitting ? "Đang cập nhật..." : "Đổi mật khẩu"}
      </button>
    </form>
  );
}

function AuthCard({ onLogin }) {
  const { t } = useTheme();
  const [tab, setTab] = useState("login");
  const [state, setState] = useState({ loading: false, error: "", message: "", accessNotice: null });
  const [googleLoginRequest, setGoogleLoginRequest] = useState(0);
  const isLogin = tab === "login";
  const isRegister = tab === "register";

  const resetState = () => setState({ loading: false, error: "", message: "", accessNotice: null });

  const openTab = (nextTab) => {
    resetState();
    setTab(nextTab);
  };

  const completeLogin = async (session, remember = true) => {
    const account = session.accessAccount || session.account || session.userName;
    const accessRights = await getAccessRights({ account });
    onLogin?.({ ...session, accessRights, remember });
  };

  const showAccessNotice = (error, account) => {
    setState({
      loading: false,
      error: "",
      message: "",
      accessNotice: {
        account: error?.account || account,
        detail: error?.message,
      },
    });
  };

  const submitGoogleProfile = async (tokenResponse) => {
    try {
      const profile = await fetchGoogleUserInfo(tokenResponse.access_token);
      const session = await loginWithSocial({
        provider: "2",
        socialId: profile.sub,
        phoneNumber: "",
        userName: profile.email || profile.sub,
        email: profile.email || "",
        fullName: profile.name || "",
        avatar: profile.picture || "",
      });
      await completeLogin(session, true);
    } catch (error) {
      if (error instanceof AccessDeniedError || error?.code === "ACCESS_DENIED") {
        showAccessNotice(error, error?.account);
        return;
      }
      setState({ loading: false, error: error?.message || "Không thể đăng nhập Google.", message: "", accessNotice: null });
    }
  };

  const handleLogin = async (credentials) => {
    setState({ loading: true, error: "", message: "", accessNotice: null });
    try {
      const session = await loginUser(credentials);
      await completeLogin(session, credentials.remember);
    } catch (error) {
      if (error instanceof AccessDeniedError || error?.code === "ACCESS_DENIED") {
        showAccessNotice(error, credentials.identifier);
        return;
      }
      setState({ loading: false, error: error?.message || "Không thể đăng nhập. Vui lòng thử lại.", message: "", accessNotice: null });
    }
  };

  const handleSocialLogin = async () => {
    setState({ loading: true, error: "", message: "", accessNotice: null });
    if (!GOOGLE_CLIENT_ID) {
      setState({
        loading: false,
        error: "Thiếu VITE_GOOGLE_CLIENT_ID để đăng nhập Google.",
        message: "",
        accessNotice: null,
      });
      return;
    }
    setGoogleLoginRequest((request) => request + 1);
  };

  const handleRegister = async (payload) => {
    setState({ loading: true, error: "", message: "", accessNotice: null });
    try {
      await registerUser(payload);
      setState({
        loading: false,
        error: "",
        message: "Tạo tài khoản thành công. Vui lòng đăng nhập để kiểm tra quyền truy cập.",
        accessNotice: null,
      });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Không thể tạo tài khoản.", message: "", accessNotice: null });
    }
  };

  const handleChangePassword = async (payload) => {
    setState({ loading: true, error: "", message: "", accessNotice: null });
    try {
      await changePassword(payload);
      setState({ loading: false, error: "", message: "Đổi mật khẩu thành công. Bạn có thể quay lại đăng nhập.", accessNotice: null });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Không thể đổi mật khẩu.", message: "", accessNotice: null });
    }
  };

  return (
    <section className={isRegister ? "auth-register-card" : undefined} style={{ ...styles.card, ...(isRegister ? styles.registerCard : null) }}>
      {GOOGLE_CLIENT_ID && (
        <GoogleLoginBridge
          requestKey={googleLoginRequest}
          onSuccess={submitGoogleProfile}
          onError={(error) => {
            setState({
              loading: false,
              error: error?.error_description || error?.error || "Không thể đăng nhập Google.",
              message: "",
              accessNotice: null,
            });
          }}
          onNonOAuthError={() => {
            setState({
              loading: false,
              error: "Cửa sổ đăng nhập Google đã bị đóng hoặc bị trình duyệt chặn.",
              message: "",
              accessNotice: null,
            });
          }}
        />
      )}
      {tab !== "forgot" && (
        <div style={styles.tabs} role="tablist" aria-label="Chọn hình thức xác thực">
        <button
          type="button"
          onClick={() => openTab("login")}
          style={{ ...styles.tab, ...(isLogin ? { background: t.B, color: "#fff" } : null) }}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          onClick={() => openTab("register")}
          style={{ ...styles.tab, ...(isRegister ? { background: t.B, color: "#fff" } : null) }}
        >
          Đăng ký
        </button>
        </div>
      )}

      {tab === "login" && (
        <LoginForm
          onSubmit={handleLogin}
          onForgotPassword={() => openTab("forgot")}
          onSocialLogin={handleSocialLogin}
          isSubmitting={state.loading}
          error={state.error}
          accessNotice={state.accessNotice}
        />
      )}
      {tab === "register" && (
        <RegisterForm
          onSubmit={handleRegister}
          onSocialLogin={handleSocialLogin}
          isSubmitting={state.loading}
          error={state.error}
          message={state.message}
        />
      )}
      {tab === "forgot" && (
        <ForgotPasswordForm
          onBack={() => openTab("login")}
          onSubmit={handleChangePassword}
          isSubmitting={state.loading}
          error={state.error}
          message={state.message}
        />
      )}
    </section>
  );
}

export function AuthPage({ onLogin }) {
  const [width, setWidth] = useState(() => window.innerWidth);
  const isMobile = width < 768;

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div style={styles.shell}>
      <style>{authScrollbarCss}</style>
      <AuthTopbar isMobile={isMobile} />
      <div style={styles.content}>
        {!isMobile && <AuthSidebar />}
        <main style={{ ...styles.main, padding: isMobile ? "20px 14px 28px" : "32px 24px 40px" }}>
          <AuthCard onLogin={onLogin} />
        </main>
      </div>
    </div>
  );
}

const authScrollbarCss = `
  .auth-register-card::-webkit-scrollbar {
    display: none;
  }
`;

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
    alignItems: "flex-start",
    justifyContent: "center",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: 374,
    background: "var(--surf)",
    border: "0.5px solid var(--bdr)",
    borderRadius: 12,
    padding: "28px 28px 30px",
    boxShadow: "0 18px 60px rgba(0,0,0,.14)",
    boxSizing: "border-box",
  },
  registerCard: {
    maxWidth: 390,
    maxHeight: "calc(100vh - 124px)",
    overflowY: "auto",
    padding: "22px 24px 24px",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
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
  socialGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  },
  socialIconBtn: {
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "var(--elev)",
    border: "0.5px solid var(--bdr)",
    borderRadius: 8,
    color: "var(--t1)",
    fontSize: 12,
    fontWeight: 750,
    cursor: "pointer",
    minWidth: 0,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "16px 0",
    color: "var(--t4)",
    fontSize: 11,
  },
  registerGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    rowGap: 11,
    marginBottom: 11,
  },
  fieldGroup: { display: "block", marginBottom: 14 },
  compactField: { marginBottom: 0 },
  registerPasswordField: { marginBottom: 0 },
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
  otpBox: {
    margin: "-2px 0 14px",
  },
  turnstileBox: {
    minHeight: 65,
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  otpGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 78px 88px",
    gap: 8,
    alignItems: "end",
  },
  otpField: {
    display: "block",
    minWidth: 0,
  },
  otpBtn: {
    height: 38,
    border: "0.5px solid var(--bdr)",
    borderRadius: 8,
    background: "var(--elev)",
    color: "var(--t1)",
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "normal",
    lineHeight: 1.1,
    padding: "0 8px",
  },
  formHead: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 18,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--elev)",
    border: "0.5px solid var(--bdr)",
    color: "var(--t2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  },
  formTitle: {
    color: "var(--t1)",
    fontSize: 16,
    fontWeight: 850,
    lineHeight: 1.2,
  },
  formSub: {
    color: "var(--t3)",
    fontSize: 11,
    lineHeight: 1.45,
    marginTop: 4,
  },
  helperRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 7, fontSize: 11, color: "var(--t3)" },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 },
  linkBtn: { border: "none", background: "transparent", color: "var(--B)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 14,
    padding: "9px 10px",
    borderRadius: 8,
    background: "rgba(239,68,68,.09)",
    border: "0.5px solid rgba(239,68,68,.32)",
    color: "var(--R)",
    fontSize: 11,
    lineHeight: 1.45,
  },
  noticeBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 14,
    padding: "9px 10px",
    borderRadius: 8,
    background: "rgba(59,130,246,.09)",
    border: "0.5px solid rgba(59,130,246,.3)",
    color: "var(--B)",
    fontSize: 11,
    lineHeight: 1.45,
  },
  accessLockedBox: {
    marginTop: 14,
    padding: "11px 12px",
    borderRadius: 8,
    background: "rgba(245,158,11,.1)",
    border: "0.5px solid rgba(245,158,11,.36)",
    color: "var(--t1)",
    fontSize: 11,
    lineHeight: 1.5,
  },
  accessLockedTitle: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#D97706",
    fontSize: 11,
    fontWeight: 850,
    textTransform: "uppercase",
    letterSpacing: ".04em",
    marginBottom: 5,
  },
  accessLockedBody: {
    color: "var(--t2)",
  },
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
  disabledBtn: {
    opacity: 0.68,
    cursor: "not-allowed",
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
