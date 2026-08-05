import { danhGiaDoSong } from "./src/utils/doSongEngine.js";
import {
  getAllStockWaveRowsFromDb,
  getAllStockWaveSummaryRowsFromDb,
  getWaveBottomRowsFromDb,
  getRecommendationDailyFromDb,
  getRecommendationTemplateFromDb,
  getRecommendationTemplatesFromDb,
  hashStockDataValue,
  initStockDataDb,
  upsertRecommendationDaily,
  upsertRecommendationTemplate,
} from "./stockDataDb.js";
import { sendJson } from "./stockWaveHistoryCache.js";

export const RECOMMENDATION_PROMPT_VERSION = "dosong-template-v1";
export const RECOMMENDATION_STATES = ["S0", "S1", "S4", "S5", "S6", "S7", "SN", "WAITBUY", "BUY"];
const DISABLED_DOSONG_STATES = new Set(["s2", "s3"]);
const CHATWEB_API_BASE_URL = (process.env.CHATWEB_API_BASE_URL || "http://112.213.91.235:8000").replace(/\/$/, "");
const recommendationBuildRequests = new Map();

const DEFAULT_TEMPLATES = {
  S0: {
    title: "Thị trường đang trong nhịp điều chỉnh.",
    body: "Áp lực bán đang chiếm ưu thế với {ban} mã báo Bán và {cho_ban} mã Chờ bán. Trong khi đó lực Chờ mua ở mức {cho_mua} mã và Mua ở mức {mua} mã, cho thấy dòng tiền chưa đủ mạnh để xác nhận nhịp hồi bền vững.",
    action: "Ưu tiên giữ tiền mặt, hạn chế mua mới và chờ lực bán hạ nhiệt rõ hơn.",
  },
  S1: {
    title: "Áp lực bán suy giảm, dòng tiền chờ mua nhen nhóm.",
    body: "Chờ mua ghi nhận {cho_mua} mã, cao hơn tương quan với nhóm Chờ bán {cho_ban} mã. Mua hiện có {mua} mã và Bán có {ban} mã, cho thấy thị trường đang nghiêng về vùng tích lũy nhưng chưa đủ xác nhận sóng tăng.",
    action: "Theo dõi sát, chuẩn bị vốn cho nhịp giải ngân thăm dò và ưu tiên mã có nền tích lũy tốt.",
  },
  S4: {
    title: "Sóng tăng đang duy trì.",
    body: "Lực mua hiện có {mua} mã, Chờ mua duy trì ở mức {cho_mua} mã. Áp lực bán chưa đáng kể với Chờ bán {cho_ban} mã và Bán {ban} mã, cho thấy sóng tăng vẫn chưa bị phá vỡ.",
    action: "Giữ tỷ trọng, ưu tiên mã mạnh trong ngành dẫn sóng và hạn chế mua đuổi ở vùng giá tăng nóng.",
  },
  S5: {
    title: "Đà tăng chững lại, xuất hiện phân hóa.",
    body: "Số mã Mua còn {mua}, trong khi Chờ bán tăng lên {cho_ban} mã. Chờ mua ở mức {cho_mua} mã và Bán ở mức {ban} mã, cho thấy dòng tiền có dấu hiệu phân hóa sau nhịp tăng.",
    action: "Chốt lời từng phần ở mã đạt kỳ vọng, siết kỷ luật nắm giữ và hạn chế mở vị thế mới.",
  },
  S6: {
    title: "Cảnh báo phân phối, dòng tiền chờ bán tăng cao.",
    body: "Chờ bán ghi nhận {cho_ban} mã, trong khi Mua còn {mua} mã và Chờ mua ở mức {cho_mua} mã. Bán hiện có {ban} mã, cho thấy rủi ro phòng thủ đang tăng dần.",
    action: "Chủ động hạ tỷ trọng, bảo toàn lợi nhuận và quan sát phản ứng cung cầu trước khi giải ngân lại.",
  },
  S7: {
    title: "Xác nhận thị trường tạo đỉnh.",
    body: "Hệ thống ghi nhận {ban} mã báo Bán, cho thấy áp lực bán lan rộng. Chờ bán ở mức {cho_ban} mã, trong khi Mua chỉ còn {mua} mã và Chờ mua {cho_mua} mã, rủi ro điều chỉnh đang tăng lên.",
    action: "Bán quyết liệt các vị thế yếu, đưa danh mục về tiền mặt cao và chờ nhịp sóng mới.",
  },
  SN: {
    title: "Thị trường chưa rõ xu hướng.",
    body: "Tín hiệu đang cân bằng với Chờ mua {cho_mua} mã, Mua {mua} mã, Chờ bán {cho_ban} mã và Bán {ban} mã. Dòng tiền chưa tạo ưu thế đủ rõ để xác nhận hướng đi kế tiếp.",
    action: "Giữ trạng thái quan sát, chỉ xử lý các vị thế có tín hiệu riêng rõ ràng và chưa nên tăng tỷ trọng mạnh.",
  },
  WAITBUY: {
    title: "Tín hiệu chờ mua trước xác nhận chân sóng.",
    body: "Ngày này nằm trong vùng dò/chờ mua trước nhịp xác nhận chân sóng. Chờ mua đạt {cho_mua} mã, Mua {mua} mã, Chờ bán {cho_ban} mã và Bán {ban} mã, cho thấy lực cầu đang bắt đầu quay lại nhưng cần thêm xác nhận.",
    action: "Có thể chuẩn bị danh mục và giải ngân thăm dò tỷ trọng nhỏ, ưu tiên mã khỏe hơn thị trường.",
  },
  BUY: {
    title: "Xác nhận chân sóng, ưu tiên hành động mua.",
    body: "Ngày này trùng phiên xác nhận chân sóng. Mua ghi nhận {mua} mã, Chờ mua {cho_mua} mã, trong khi Chờ bán {cho_ban} mã và Bán {ban} mã, cho thấy xác suất mở nhịp tăng mới cải thiện rõ.",
    action: "Ưu tiên giải ngân theo kế hoạch, tập trung vào nhóm dẫn sóng và quản trị tỷ trọng theo độ tin cậy hiện tại.",
  },
};

function normalizeDateKey(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return "";
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getFirstDateField(row, keys) {
  for (const key of keys) {
    const value = normalizeDateKey(row?.[key]);
    if (value) return value;
  }
  return "";
}

function getRowDate(row) {
  return normalizeDateKey(row?.rawDate || row?.date || row?.tradingDate || row?.ngay || row?.tradeDate);
}

function getFirstWaveRow(value) {
  const root = value?.StockWaveRequest ?? value;
  const waves = root?.stockWaves ?? root?.data?.stockWaves ?? root?.data ?? root;
  const rows = value?.allRows ?? waves?.waveDatas ?? waves?.waveData ?? waves?.rows ?? waves?.history ?? waves?.stockWaves?.waveDatas ?? waves;
  if (Array.isArray(rows)) return rows.find(Boolean) || null;
  if (rows && typeof rows === "object" && (rows.date || rows.tradingDate || rows.ngay || rows.buy !== undefined || rows.waitbuy !== undefined)) return rows;
  if (value && typeof value === "object" && (value.date || value.tradingDate || value.ngay || value.buy !== undefined || value.waitbuy !== undefined)) return value;
  return null;
}

function toDoSongInput(row) {
  const date = getRowDate(row);
  const choMua = toNumber(row?.cm ?? row?.waitbuy ?? row?.waitBuy ?? row?.wait_buy);
  const mua = toNumber(row?.mu ?? row?.buy);
  const choBan = toNumber(row?.cb ?? row?.waitsell ?? row?.waitSell ?? row?.wait_sell);
  const ban = toNumber(row?.b ?? row?.sell);
  if (!date) return null;
  return {
    date,
    choMua,
    mua,
    choBan,
    ban,
    tinCay: toNumber(row?.tc ?? row?.reliability),
    tong: toNumber(row?.total) || choMua + mua + choBan + ban,
  };
}

function getSpecialState(selectedDate, bottomRows, waveDates) {
  const confirmRows = (Array.isArray(bottomRows) ? bottomRows : [])
    .map((row) => ({ row, confirmDate: getFirstDateField(row, ["confirm_wave_date", "confirmDate", "date"]) }))
    .filter((item) => item.confirmDate);

  if (confirmRows.some((item) => item.confirmDate === selectedDate)) return "BUY";

  const explicitProbeKeys = [
    "probe_wave_date",
    "waitbuy_wave_date",
    "prepare_wave_date",
    "bottom_wave_date",
    "detect_wave_date",
    "scan_wave_date",
    "early_wave_date",
    "pre_confirm_wave_date",
  ];
  if (confirmRows.some((item) => getFirstDateField(item.row, explicitProbeKeys) === selectedDate)) return "WAITBUY";

  const sortedWaveDates = [...new Set((waveDates || []).filter(Boolean))].sort();
  const selectedIsPreviousConfirmSession = confirmRows.some((item) => {
    const previousDate = sortedWaveDates.filter((date) => date < item.confirmDate).pop() || "";
    return previousDate === selectedDate;
  });

  return selectedIsPreviousConfirmSession ? "WAITBUY" : "";
}

function doSongSignalKeys(engine) {
  const keys = [];
  const state = String(engine?.maTrangThai || "").toLowerCase();
  if (DISABLED_DOSONG_STATES.has(state)) return ["do_song_engine"];
  if (state) keys.push(`do_song_state_${state}`);
  const phaseKey = {
    "Điều chỉnh":"dieu_chinh",
    "Tích lũy":"tich_luy",
    "Chân sóng":"chan_song",
    "Sóng tăng":"song_tang",
    "Phân phối":"phan_phoi",
  }[engine?.pha];
  if (phaseKey) keys.push(`do_song_phase_${phaseKey}`);
  keys.push("do_song_engine");
  return [...new Set(keys)];
}

function renderTemplate(template, values) {
  const dict = {
    date: values.dateKey || "",
    state: values.effectiveState || "",
    pha: values.pha || "",
    cho_mua: values.choMua,
    mua: values.mua,
    cho_ban: values.choBan,
    ban: values.ban,
    tc: values.tc ?? "",
    total: values.total,
  };
  const replace = (text) => String(text || "").replace(/\{(date|state|pha|cho_mua|mua|cho_ban|ban|tc|total)\}/g, (_, key) => String(dict[key] ?? ""));
  return {
    title: replace(template.titleTemplate || template.title || ""),
    body: replace(template.bodyTemplate || template.body || ""),
    action: replace(template.actionTemplate || template.action || ""),
  };
}

function sourceHashForState(state) {
  return hashStockDataValue({
    promptVersion: RECOMMENDATION_PROMPT_VERSION,
    dateKey: state.dateKey,
    rawState: state.rawState,
    effectiveState: state.effectiveState,
    pha: state.pha,
    overrideReason: state.overrideReason,
    wave: state.wave,
    specialState: state.specialState,
  });
}

export async function seedDefaultRecommendationTemplates({ overwrite = false, source = "system" } = {}) {
  await initStockDataDb();
  let saved = 0;
  for (const state of RECOMMENDATION_STATES) {
    const existing = await getRecommendationTemplateFromDb(state, RECOMMENDATION_PROMPT_VERSION);
    if (existing && !overwrite) continue;
    const template = DEFAULT_TEMPLATES[state];
    await upsertRecommendationTemplate({
      state,
      promptVersion: RECOMMENDATION_PROMPT_VERSION,
      titleTemplate: template.title,
      bodyTemplate: template.body,
      actionTemplate: template.action,
      source,
      raw: template,
    });
    saved += 1;
  }
  return saved;
}

function normalizeTemplateFromSignal(signal, fallback, sampleValues = {}) {
  const title = String(signal?.title || fallback.title || "").trim();
  const body = String(signal?.response || signal?.body || fallback.body || "").trim();
  const action = String(signal?.recommendation || signal?.action || fallback.action || "").trim();
  const placeholders = {
    date: sampleValues.date || "2025-01-02",
    cho_mua: sampleValues.choMua,
    mua: sampleValues.mua,
    cho_ban: sampleValues.choBan,
    ban: sampleValues.ban,
    tc: sampleValues.tinCay,
    total: sampleValues.total,
  };
  const placeholderize = (value) => {
    let output = String(value || "");
    for (const [key, sample] of Object.entries(placeholders)) {
      if (sample === undefined || sample === null || sample === "") continue;
      const escaped = String(sample).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`\b${escaped}\b`, "g"), `{${key}}`);
    }
    return output;
  };
  return {
    title: placeholderize(title || fallback.title),
    body: placeholderize(body || fallback.body),
    action: placeholderize(action || fallback.action),
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(`ChatAI failed ${response.status}: ${data?.error || response.statusText}`);
  return data;
}

export async function seedRecommendationTemplatesFromChatAi({ overwrite = false } = {}) {
  await initStockDataDb();
  const samples = {
    S0: { choMua: 42, mua: 6, choBan: 94, ban: 35, total: 304, tinCay: 44 },
    S1: { choMua: 108, mua: 7, choBan: 44, ban: 8, total: 304, tinCay: 55 },
    S4: { choMua: 107, mua: 5, choBan: 9, ban: 18, total: 304, tinCay: 78 },
    S5: { choMua: 70, mua: 12, choBan: 63, ban: 15, total: 304, tinCay: 64 },
    S6: { choMua: 51, mua: 8, choBan: 86, ban: 22, total: 304, tinCay: 50 },
    S7: { choMua: 31, mua: 4, choBan: 80, ban: 91, total: 304, tinCay: 82 },
    SN: { choMua: 68, mua: 11, choBan: 65, ban: 12, total: 304, tinCay: 50 },
  };
  let saved = 0;

  for (const state of RECOMMENDATION_STATES) {
    const existing = await getRecommendationTemplateFromDb(state, RECOMMENDATION_PROMPT_VERSION);
    if (existing && !overwrite) continue;
    const fallback = DEFAULT_TEMPLATES[state];
    let signal = null;

    if (state === "BUY" || state === "WAITBUY") {
      const params = new URLSearchParams({
        signal_key: state === "BUY" ? "buy_over_threshold" : "waitbuy_over_threshold",
        waitbuy: "107",
        buy: state === "BUY" ? "62" : "7",
        check_date: "2025-01-02",
      });
      signal = await fetchJson(`${CHATWEB_API_BASE_URL}/public/condition-signals/latest?${params.toString()}`);
    } else {
      const sample = samples[state];
      signal = await fetchJson(`${CHATWEB_API_BASE_URL}/public/do-song-advice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          check_date: "2025-01-02",
          signal_keys: [`do_song_state_${state.toLowerCase()}`, "do_song_engine"],
          wave: { date: "2025-01-02", ...sample, tong: sample.total },
          engine: { maTrangThai: state, pha: state === "S0" ? "Điều chỉnh" : state === "S1" ? "Tích lũy" : state === "S6" || state === "S7" ? "Phân phối" : "Sóng tăng" },
        }),
      });
    }

    const sampleForState = state === "BUY"
      ? { date: "2025-01-02", choMua: 107, mua: 62, choBan: 13, ban: 4, total: 304, tinCay: 86 }
      : state === "WAITBUY"
        ? { date: "2025-01-02", choMua: 107, mua: 7, choBan: 62, ban: 3, total: 304, tinCay: 55 }
        : { date: "2025-01-02", ...samples[state] };
    const normalized = normalizeTemplateFromSignal(signal, fallback, sampleForState);
    await upsertRecommendationTemplate({
      state,
      promptVersion: RECOMMENDATION_PROMPT_VERSION,
      titleTemplate: fallback.title,
      bodyTemplate: fallback.body,
      actionTemplate: fallback.action,
      source: "chatai",
      raw: {
        signal,
        normalized,
        note: "ChatAI output is kept for audit; placeholder-safe fallback template is used to render daily stored recommendations.",
      },
    });
    saved += 1;
  }

  return saved;
}

export async function buildRecommendationDailyStates({ from = "2025-01-01", to = "" } = {}) {
  const [waveRows, bottomRows] = await Promise.all([
    getAllStockWaveRowsFromDb(),
    getWaveBottomRowsFromDb(),
  ]);
  const waveInputs = (Array.isArray(waveRows) ? waveRows : [])
    .map((row) => ({ row, input: toDoSongInput(row) }))
    .filter((item) => item.input)
    .sort((a, b) => String(a.input.date).localeCompare(String(b.input.date)));
  const waveDates = waveInputs.map((item) => item.input.date);

  const states = [];
  let phienTruoc = null;
  let phaTruoc = null;
  let nearestEnabledEngine = null;
  let nearestEnabledDate = "";

  for (const item of waveInputs) {
    const dateKey = item.input.date;
    const engine = danhGiaDoSong({ hienTai: item.input, phienTruoc, phaTruoc });
    const specialState = getSpecialState(dateKey, bottomRows || [], waveDates);
    const rawState = String(engine?.maTrangThai || "SN").toUpperCase();
    const disabled = DISABLED_DOSONG_STATES.has(rawState.toLowerCase());
    const usedEngine = disabled && nearestEnabledEngine ? nearestEnabledEngine : engine;
    const effectiveState = specialState || String(usedEngine?.maTrangThai || "SN").toUpperCase();
    const overrideReason = specialState
      ? `special_${specialState.toLowerCase()}`
      : disabled && nearestEnabledEngine
        ? `disabled_${rawState.toLowerCase()}_use_nearest_previous_state`
        : "";

    if ((!from || dateKey >= from) && (!to || dateKey <= to)) {
      states.push({
        dateKey,
        rawState,
        effectiveState,
        pha: specialState ? usedEngine?.pha || engine?.pha || null : usedEngine?.pha || null,
        overrideReason,
        nearestEnabledDate,
        previousDate: phienTruoc?.date || "",
        sourceDates: waveDates,
        specialState,
        signalKeys: doSongSignalKeys(usedEngine),
        wave: item.input,
        engine: usedEngine,
        rawEngine: engine,
        nearestEngine: nearestEnabledEngine,
      });
    }

    if (!DISABLED_DOSONG_STATES.has(rawState.toLowerCase())) {
      nearestEnabledEngine = engine;
      nearestEnabledDate = dateKey;
    }
    phienTruoc = item.input;
    phaTruoc = engine?.pha || null;
  }

  return states;
}

function buildRealtimeRecommendationState(currentRow, summaryRows, bottomRows) {
  const currentInput = toDoSongInput(currentRow);
  if (!currentInput?.date) return null;
  const dateKey = currentInput.date;
  const byDate = new Map();
  for (const row of Array.isArray(summaryRows) ? summaryRows : []) {
    const input = toDoSongInput(row);
    if (input?.date && input.date <= dateKey) byDate.set(input.date, row);
  }
  byDate.set(dateKey, currentRow);

  const waveRows = [...byDate.values()].sort((a, b) => String(getRowDate(a)).localeCompare(String(getRowDate(b))));
  const waveDates = waveRows.map((row) => getRowDate(row)).filter(Boolean);
  let phienTruoc = null;
  let phaTruoc = null;
  let nearestEnabledEngine = null;
  let nearestEnabledDate = "";

  for (const row of waveRows) {
    const hienTai = toDoSongInput(row);
    if (!hienTai) continue;
    const engine = danhGiaDoSong({ hienTai, phienTruoc, phaTruoc });
    const specialState = getSpecialState(hienTai.date, bottomRows || [], waveDates);
    const rawState = String(engine?.maTrangThai || "SN").toUpperCase();
    const disabled = DISABLED_DOSONG_STATES.has(rawState.toLowerCase());
    const usedEngine = disabled && nearestEnabledEngine ? nearestEnabledEngine : engine;

    if (hienTai.date === dateKey) {
      const effectiveState = specialState || String(usedEngine?.maTrangThai || "SN").toUpperCase();
      const overrideReason = specialState
        ? `special_${specialState.toLowerCase()}`
        : disabled && nearestEnabledEngine
          ? `disabled_${rawState.toLowerCase()}_use_nearest_previous_state`
          : "";
      return {
        dateKey,
        rawState,
        effectiveState,
        pha: specialState ? usedEngine?.pha || engine?.pha || null : usedEngine?.pha || null,
        overrideReason,
        nearestEnabledDate,
        previousDate: phienTruoc?.date || "",
        sourceDates: waveDates,
        specialState,
        signalKeys: doSongSignalKeys(usedEngine),
        wave: hienTai,
        engine: usedEngine,
        rawEngine: engine,
        nearestEngine: nearestEnabledEngine,
      };
    }

    if (!DISABLED_DOSONG_STATES.has(rawState.toLowerCase())) {
      nearestEnabledEngine = engine;
      nearestEnabledDate = hienTai.date;
    }
    phienTruoc = hienTai;
    phaTruoc = engine?.pha || null;
  }

  return null;
}

async function fetchRealtimeChatAiSignal(state) {
  if (state.effectiveState === "BUY" || state.effectiveState === "WAITBUY") {
    const params = new URLSearchParams({
      signal_key: state.effectiveState === "BUY" ? "buy_over_threshold" : "waitbuy_over_threshold",
      check_date: state.dateKey,
      waitbuy: String(state.wave.choMua ?? 0),
      buy: String(state.wave.mua ?? 0),
    });
    return fetchJson(`${CHATWEB_API_BASE_URL}/public/condition-signals/latest?${params.toString()}`);
  }

  return fetchJson(`${CHATWEB_API_BASE_URL}/public/do-song-advice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      check_date: state.dateKey,
      signal_keys: state.signalKeys,
      source_dates: state.sourceDates || [],
      previous_date: state.previousDate || "",
      nearest_enabled_date: state.nearestEnabledDate,
      wave: state.wave,
      engine: state.engine,
      raw_engine: state.rawEngine,
      nearest_engine: state.nearestEngine,
    }),
  });
}

export async function upsertRealtimeChatAiRecommendation(wavePayload, { promptVersion = RECOMMENDATION_PROMPT_VERSION } = {}) {
  const currentRow = getFirstWaveRow(wavePayload);
  const dateKey = getRowDate(currentRow);
  if (!dateKey) return { saved: false, reason: "date_missing" };

  const [summaryRows, bottomRows] = await Promise.all([
    getAllStockWaveSummaryRowsFromDb(),
    getWaveBottomRowsFromDb(),
  ]);
  const state = buildRealtimeRecommendationState(currentRow, summaryRows, bottomRows);
  if (!state) return { saved: false, reason: "state_missing", dateKey };

  const signal = await fetchRealtimeChatAiSignal(state);
  const title = String(signal?.title || "").trim();
  const body = String(signal?.response || signal?.body || "").trim();
  const action = String(signal?.recommendation || signal?.action || "").trim();
  if (!body) return { saved: false, reason: "empty_signal", dateKey, state: state.effectiveState };

  const source = { ...state, promptVersion, templateSource: "chatai_realtime", realtime: true, signal };
  await upsertRecommendationDaily({
    dateKey: state.dateKey,
    promptVersion,
    rawState: state.rawState,
    effectiveState: state.effectiveState,
    pha: state.pha,
    overrideReason: state.overrideReason,
    choMua: state.wave.choMua,
    mua: state.wave.mua,
    choBan: state.wave.choBan,
    ban: state.wave.ban,
    tc: state.wave.tinCay,
    total: state.wave.tong,
    title,
    body,
    action,
    sourceHash: hashStockDataValue({ promptVersion, realtime: true, state, signal }),
    source,
  });

  return { saved: true, dateKey, state: state.effectiveState };
}

export async function backfillRecommendationDaily({ from = "2025-01-01", to = "", promptVersion = RECOMMENDATION_PROMPT_VERSION, seedTemplates = true } = {}) {
  if (seedTemplates) await seedDefaultRecommendationTemplates();
  const templates = await getRecommendationTemplatesFromDb(promptVersion);
  const byState = new Map(templates.map((template) => [template.state, template]));
  const states = await buildRecommendationDailyStates({ from, to });
  let saved = 0;
  let missingTemplates = 0;

  for (const state of states) {
    const template = byState.get(state.effectiveState);
    if (!template) {
      missingTemplates += 1;
      continue;
    }
    const values = {
      dateKey: state.dateKey,
      rawState: state.rawState,
      effectiveState: state.effectiveState,
      pha: state.pha,
      choMua: state.wave.choMua,
      mua: state.wave.mua,
      choBan: state.wave.choBan,
      ban: state.wave.ban,
      tc: state.wave.tinCay,
      total: state.wave.tong,
    };
    const rendered = renderTemplate(template, values);
    const source = { ...state, promptVersion, templateSource: template.source };
    await upsertRecommendationDaily({
      dateKey: state.dateKey,
      promptVersion,
      rawState: state.rawState,
      effectiveState: state.effectiveState,
      pha: state.pha,
      overrideReason: state.overrideReason,
      choMua: state.wave.choMua,
      mua: state.wave.mua,
      choBan: state.wave.choBan,
      ban: state.wave.ban,
      tc: state.wave.tinCay,
      total: state.wave.tong,
      title: rendered.title,
      body: rendered.body,
      action: rendered.action,
      sourceHash: sourceHashForState(state),
      source,
    });
    saved += 1;
  }

  return { from, to, promptVersion, states: states.length, saved, missingTemplates };
}

export async function getDoSongRecommendationForDate(dateKey, { promptVersion = RECOMMENDATION_PROMPT_VERSION } = {}) {
  const normalizedDate = normalizeDateKey(dateKey);
  const row = await getRecommendationDailyFromDb(normalizedDate, promptVersion);
  if (row) return row;

  const requestKey = `${promptVersion}:${normalizedDate}`;
  if (!recommendationBuildRequests.has(requestKey)) {
    const request = backfillRecommendationDaily({
      from: normalizedDate,
      to: normalizedDate,
      promptVersion,
      seedTemplates: true,
    }).finally(() => {
      recommendationBuildRequests.delete(requestKey);
    });
    recommendationBuildRequests.set(requestKey, request);
  }

  await recommendationBuildRequests.get(requestKey);

  const generated = await getRecommendationDailyFromDb(normalizedDate, promptVersion);
  if (generated) return generated;

  return {
    ok: false,
    title: "",
    response: "",
    recommendation: "",
    date_key: normalizedDate,
    prompt_version: promptVersion,
    error: "recommendation_not_found",
  };
}

export async function handleDoSongRecommendation(req, res, rawUrl) {
  const url = new URL(rawUrl || req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method !== "GET" || url.pathname !== "/api/do-song-recommendation") return false;
  const dateKey = normalizeDateKey(url.searchParams.get("date") || url.searchParams.get("check_date"));
  const promptVersion = url.searchParams.get("prompt_version") || RECOMMENDATION_PROMPT_VERSION;
  if (!dateKey) {
    sendJson(res, 400, { ok: false, error: "date_required", title: "", response: "", recommendation: "" });
    return true;
  }
  const payload = await getDoSongRecommendationForDate(dateKey, { promptVersion });
  sendJson(res, payload.ok ? 200 : 404, payload);
  return true;
}
