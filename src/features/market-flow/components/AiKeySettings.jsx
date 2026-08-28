import { useEffect, useState } from "react";
import { fetchDataPostWithClientCache } from "../../../data/requestCache";

const AI_KEY_SAVE_URL = "/api/market/ai-key";
const AI_KEY_STATUS_URL = "/api/market/ai-key-status";
const AI_KEY_DELETE_URL = "/api/market/ai-key-delete";

const PROVIDERS = [
  { id: "anthropic", label: "Claude (Anthropic)", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI (GPT)", placeholder: "sk-..." },
];

function KeyRow({ userId, provider, label, placeholder }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("checking"); // checking | has_key | no_key
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDataPostWithClientCache(
          AI_KEY_STATUS_URL,
          { user_id: userId, provider },
          { force: true },
        );
        if (!cancelled) setStatus(data?.has_key ? "has_key" : "no_key");
      } catch {
        if (!cancelled) setStatus("no_key");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, provider]);

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await fetchDataPostWithClientCache(
        AI_KEY_SAVE_URL,
        { user_id: userId, provider, api_key: value.trim() },
        { force: true },
      );
      setStatus("has_key");
      setValue("");
      setMessage("Đã lưu.");
    } catch (error) {
      setMessage(error.message || "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setMessage("");
    try {
      await fetchDataPostWithClientCache(
        AI_KEY_DELETE_URL,
        { user_id: userId, provider },
        { force: true },
      );
      setStatus("no_key");
      setValue("");
      setMessage("Đã xóa.");
    } catch (error) {
      setMessage(error.message || "Xóa thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--t1,#F0F4FF)" }}>{label}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 7px",
            borderRadius: 999,
            color: status === "has_key" ? "#3DD68C" : "#A8B8D0",
            background: status === "has_key" ? "rgba(61,214,140,.12)" : "rgba(168,184,208,.10)",
          }}
        >
          {status === "checking" ? "Đang kiểm tra..." : status === "has_key" ? "Đã có key" : "Chưa có key"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: 8,
            border: ".5px solid var(--bdr,#242E42)",
            background: "var(--elev,#171D2E)",
            color: "var(--t1,#F0F4FF)",
            fontSize: 12,
            outline: "none",
          }}
        />
        <button
          onClick={save}
          disabled={saving || !value.trim()}
          style={{
            padding: "0 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--B,#7C3AED)",
            color: "white",
            fontSize: 12,
            fontWeight: 700,
            cursor: saving || !value.trim() ? "not-allowed" : "pointer",
            opacity: saving || !value.trim() ? 0.6 : 1,
          }}
        >
          Lưu
        </button>
        <button
          onClick={remove}
          disabled={saving || status !== "has_key"}
          title="Xóa key đã lưu"
          style={{
            padding: "0 12px",
            borderRadius: 8,
            border: ".5px solid var(--bdr,#242E42)",
            background: "var(--elev,#171D2E)",
            color: status === "has_key" ? "#F87171" : "var(--t3,#5B6478)",
            fontSize: 12,
            fontWeight: 700,
            cursor: saving || status !== "has_key" ? "not-allowed" : "pointer",
            opacity: saving || status !== "has_key" ? 0.5 : 1,
          }}
        >
          Xóa
        </button>
      </div>
      {message && (
        <div style={{ fontSize: 11, marginTop: 4, color: message.startsWith("Đã") ? "#3DD68C" : "#F87171" }}>
          {message}
        </div>
      )}
    </div>
  );
}

export default function AiKeySettings({ userId, onClose }) {
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 950, backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 380,
          maxWidth: "90vw",
          background: "var(--surf,#111520)",
          border: ".5px solid var(--bdr,#242E42)",
          borderRadius: 14,
          zIndex: 951,
          padding: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1,#F0F4FF)" }}>Cài đặt API key</div>
          <button
            onClick={onClose}
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              border: ".5px solid var(--bdr,#242E42)",
              background: "var(--elev,#171D2E)",
              color: "var(--t2,#C7D2E6)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--t3,#7C879C)", marginBottom: 14 }}>
          Key của bạn được mã hóa và chỉ dùng cho chính bạn khi chat - không dùng chung với người khác.
        </div>
        {PROVIDERS.map((p) => (
          <KeyRow key={p.id} userId={userId} provider={p.id} label={p.label} placeholder={p.placeholder} />
        ))}
      </div>
    </>
  );
}
