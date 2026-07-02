const LOGIN_API_URL = import.meta.env.VITE_LOGIN_API_URL || "/service/data/getUserLogin";
const SUCCESS_CODE = "S0000";

function readReply(data) {
  return data?.UserLoginReply || data?.UserLoginRequest || data || {};
}

function readCode(reply) {
  return reply?.codeReply?.codeID || reply?.codeID || reply?.code || reply?.statusCode;
}

function readMessage(reply) {
  return (
    reply?.codeReply?.codeName ||
    reply?.codeReply?.message ||
    reply?.message ||
    reply?.error ||
    reply?.description
  );
}

export async function loginUser({ identifier, password }) {
  const userName = String(identifier || "").trim();

  if (!userName || !password) {
    throw new Error("Vui lòng nhập tài khoản và mật khẩu.");
  }

  const response = await fetch(LOGIN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UserLoginRequest: {
        user_name: userName,
        password,
      },
    }),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Đăng nhập thất bại (HTTP ${response.status}).`);
  }

  const reply = readReply(data);
  const code = readCode(reply);
  if (code && code !== SUCCESS_CODE) {
    throw new Error(readMessage(reply) || "Sai tài khoản hoặc mật khẩu.");
  }

  return {
    userName,
    reply,
    raw: data,
    loggedAt: new Date().toISOString(),
  };
}
