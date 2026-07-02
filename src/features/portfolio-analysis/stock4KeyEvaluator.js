/**
 * JavaScript port of stock_4key_evaluator.py.
 *
 * The core 4-key rule matches the Python module:
 * - "Đúng sóng" means ticker SMDT momentum is positive over N sessions.
 * - "Đúng ngành" means industry SMDT momentum is positive over N sessions.
 */

export const FOUR_KEY_LOOKBACK_SESSIONS = 3;

export const Nhom4Key = Object.freeze({
  DUNG_SONG_DUNG_NGANH: "Đúng sóng - Đúng ngành",
  DUNG_SONG_SAI_NGANH: "Đúng sóng - Sai ngành",
  DUNG_NGANH_SAI_SONG: "Đúng ngành - Sai sóng",
  SAI_SONG_SAI_NGANH: "Sai sóng - Sai ngành",
});

export const KHUYEN_NGHI = Object.freeze({
  [Nhom4Key.DUNG_SONG_DUNG_NGANH]: "MUA - tín hiệu thuận cả 2 chiều",
  [Nhom4Key.DUNG_SONG_SAI_NGANH]: "CÂN NHẮC - mã mạnh riêng lẻ, ngược dòng ngành",
  [Nhom4Key.DUNG_NGANH_SAI_SONG]: "THEO DÕI - ngành thuận nhưng mã chưa xác nhận",
  [Nhom4Key.SAI_SONG_SAI_NGANH]: "TRÁNH - cả 2 chiều bất lợi",
});

export const EVAL_KEY_BY_GROUP = Object.freeze({
  [Nhom4Key.DUNG_SONG_DUNG_NGANH]: "DS_DN",
  [Nhom4Key.DUNG_SONG_SAI_NGANH]: "DS_SN",
  [Nhom4Key.DUNG_NGANH_SAI_SONG]: "DN_SS",
  [Nhom4Key.SAI_SONG_SAI_NGANH]: "SS",
});

export const GROUP_BY_EVAL_KEY = Object.freeze(
  Object.fromEntries(Object.entries(EVAL_KEY_BY_GROUP).map(([group, key]) => [key, group]))
);

export const FOUR_KEY_META = {
  DS_DN: {
    group: Nhom4Key.DUNG_SONG_DUNG_NGANH,
    label: Nhom4Key.DUNG_SONG_DUNG_NGANH,
    recommendation: KHUYEN_NGHI[Nhom4Key.DUNG_SONG_DUNG_NGANH],
    score: 85,
  },
  DS_SN: {
    group: Nhom4Key.DUNG_SONG_SAI_NGANH,
    label: Nhom4Key.DUNG_SONG_SAI_NGANH,
    recommendation: KHUYEN_NGHI[Nhom4Key.DUNG_SONG_SAI_NGANH],
    score: 55,
  },
  DN_SS: {
    group: Nhom4Key.DUNG_NGANH_SAI_SONG,
    label: Nhom4Key.DUNG_NGANH_SAI_SONG,
    recommendation: KHUYEN_NGHI[Nhom4Key.DUNG_NGANH_SAI_SONG],
    score: 38,
  },
  SS: {
    group: Nhom4Key.SAI_SONG_SAI_NGANH,
    label: Nhom4Key.SAI_SONG_SAI_NGANH,
    recommendation: KHUYEN_NGHI[Nhom4Key.SAI_SONG_SAI_NGANH],
    score: 15,
  },
};

export const DEFAULT_TICKER_INDUSTRY_MAP = Object.freeze({
  HPG: "Thép",
  HSG: "Thép",
  NKG: "Thép",
  TLH: "Thép",
  VGS: "Thép",
  TCB: "Ngân hàng",
  VCB: "Ngân hàng",
  MBB: "Ngân hàng",
  ACB: "Ngân hàng",
  BID: "Ngân hàng",
  CTG: "Ngân hàng",
});

export const TRONG_SO_V2 = Object.freeze({
  smdtVsNganh: 32,
  smdtDelta: 30,
  smdtRank: 18,
  giaDongLuong: 10,
  dongTien: 10,
});

export const BONUS_PHAN_KY_TOI_DA = 8;
export const NGUONG_GIA_KHONG_TANG = 0.005;

export const CASHFLOW_SCORE_MAP = Object.freeze({
  "Tiếp tục đổ vào": 1.0,
  "Đang đổ vào": 1.0,
  "Nhen nhóm đổ vào": 0.5,
  "Tiếp tục thoát ra": -1.0,
  "Đang thoát ra": -1.0,
  "Bắt đầu thoát ra": -0.5,
});

export class KhongDuDuLieuError extends Error {
  constructor(message) {
    super(message);
    this.name = "KhongDuDuLieuError";
  }
}

function toDateSortKey(date) {
  if (!date || typeof date !== "string") return "";
  if (date.includes("/")) {
    const [d, m, y] = date.split("/");
    return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : date;
  }
  return date.slice(0, 10);
}

function addDays(dateValue, days) {
  const d = new Date(`${toDateSortKey(dateValue)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 2) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function sortByDate(records) {
  return [...(records || [])]
    .filter((item) => item?.date)
    .sort((a, b) => toDateSortKey(a.date).localeCompare(toDateSortKey(b.date)));
}

function uniqueByDate(records) {
  const map = new Map();
  for (const record of sortByDate(records)) map.set(toDateSortKey(record.date), { ...record, date: toDateSortKey(record.date) });
  return [...map.values()];
}

function indexOfDate(sortedRecords, date) {
  const key = toDateSortKey(date);
  return sortedRecords.findIndex((record) => toDateSortKey(record.date) === key);
}

function normalize0to100(values, target) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length || !Number.isFinite(target)) return 50;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  if (hi === lo) return 50;
  return ((target - lo) / (hi - lo)) * 100;
}

function normalizeSeries0to100(values) {
  const nums = values.map((v) => (Number.isFinite(v) ? v : 0));
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  if (hi === lo) return nums.map(() => 50);
  return nums.map((v) => ((v - lo) / (hi - lo)) * 100);
}

export function phanLoai4Key(dongLuongMa, dongLuongNganh) {
  const dungSong = dongLuongMa > 0;
  const dungNganh = dongLuongNganh > 0;
  if (dungSong && dungNganh) return Nhom4Key.DUNG_SONG_DUNG_NGANH;
  if (dungSong && !dungNganh) return Nhom4Key.DUNG_SONG_SAI_NGANH;
  if (!dungSong && dungNganh) return Nhom4Key.DUNG_NGANH_SAI_SONG;
  return Nhom4Key.SAI_SONG_SAI_NGANH;
}

export function xepHang(score) {
  if (score >= 70) return "MUA MẠNH";
  if (score >= 55) return "MUA";
  if (score >= 45) return "TRUNG LẬP";
  if (score >= 30) return "BÁN";
  return "BÁN MẠNH";
}

export function seriesFromMatrix(matrix, datesAsc, key, targetDate) {
  const row = matrix?.[key];
  if (!row || !targetDate) return [];
  const targetValue = toDateSortKey(targetDate);
  return datesAsc
    .filter((date) => toDateSortKey(date) <= targetValue)
    .map((date) => ({ date: toDateSortKey(date), smdt: toNumber(row[date]) }))
    .filter((point) => point.smdt != null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function momentumPoint(series, lookbackSessions) {
  if (!Array.isArray(series) || series.length <= lookbackSessions) return null;
  const current = series[series.length - 1];
  const previous = series[series.length - 1 - lookbackSessions];
  return {
    date: current.date,
    value: current.smdt,
    prevDate: previous.date,
    prev: previous.smdt,
    delta: current.smdt - previous.smdt,
  };
}

export function evaluateFourKey({
  ticker,
  industry,
  date,
  tickerSeries,
  industrySeries,
  lookbackSessions = FOUR_KEY_LOOKBACK_SESSIONS,
}) {
  const tickerMomentum = momentumPoint(tickerSeries, lookbackSessions);
  const industryMomentum = momentumPoint(industrySeries, lookbackSessions);
  if (!tickerMomentum || !industryMomentum) return null;

  const group = phanLoai4Key(tickerMomentum.delta, industryMomentum.delta);
  const evalKey = EVAL_KEY_BY_GROUP[group];
  const meta = FOUR_KEY_META[evalKey];

  return {
    ticker,
    industry,
    date,
    evalKey,
    group,
    recommendation: meta.recommendation,
    tickerMomentum,
    industryMomentum,
    reason: `Động lượng ${lookbackSessions} phiên: mã ${tickerMomentum.delta >= 0 ? "+" : ""}${tickerMomentum.delta.toFixed(2)}, ngành ${industryMomentum.delta >= 0 ? "+" : ""}${industryMomentum.delta.toFixed(2)}`,
  };
}

export function fallbackEvalKey({ tickerOk, industryOk }) {
  if (tickerOk && industryOk) return "DS_DN";
  if (tickerOk && !industryOk) return "DS_SN";
  if (!tickerOk && industryOk) return "DN_SS";
  return "SS";
}

export function scorePortfolio4Key(rows) {
  const n = rows.length || 1;
  const dn = rows.filter((row) => row.evalKey === "DS_DN").length;
  const sn = rows.filter((row) => row.evalKey === "DS_SN").length;
  const ns = rows.filter((row) => row.evalKey === "DN_SS").length;
  const ss = rows.filter((row) => row.evalKey === "SS").length;
  const score = Math.round(
    (dn / n) * FOUR_KEY_META.DS_DN.score
    + (sn / n) * FOUR_KEY_META.DS_SN.score
    + (ns / n) * FOUR_KEY_META.DN_SS.score
    + (ss / n) * FOUR_KEY_META.SS.score
  );
  return { dn, sn, ns, ss, score };
}

export class InMemorySMDTSource {
  constructor() {
    this._ticker = new Map();
    this._industry = new Map();
  }

  loadTicker(maCk, records) {
    this._ticker.set(maCk.toUpperCase(), uniqueByDate(records));
  }

  loadIndustry(tenNganh, records) {
    this._industry.set(tenNganh, uniqueByDate(records));
  }

  async getTickerSMDT(maCk, tuNgay) {
    const data = this._ticker.get(maCk.toUpperCase());
    if (!data) throw new KhongDuDuLieuError(`Chưa nạp dữ liệu SMDT cho mã ${maCk}`);
    return data.filter((row) => row.date >= tuNgay);
  }

  async getIndustrySMDT(tenNganh, tuNgay) {
    const data = this._industry.get(tenNganh);
    if (!data) throw new KhongDuDuLieuError(`Chưa nạp dữ liệu SMDT cho ngành ${tenNganh}`);
    return data.filter((row) => row.date >= tuNgay);
  }
}

export class InMemoryPriceSource {
  constructor() {
    this._data = new Map();
  }

  loadTicker(maCk, records) {
    this._data.set(maCk.toUpperCase(), uniqueByDate(records));
  }

  async getTickerPrice(maCk, tuNgay) {
    const data = this._data.get(maCk.toUpperCase());
    if (!data) throw new KhongDuDuLieuError(`Chưa nạp dữ liệu giá cho mã ${maCk}`);
    return data.filter((row) => row.date >= tuNgay);
  }
}

export class RestApiSMDTSource {
  constructor({ tickerUrl, industryUrl, fetchImpl = fetch, headers = {} }) {
    this.tickerUrl = tickerUrl;
    this.industryUrl = industryUrl;
    this.fetchImpl = fetchImpl;
    this.headers = headers;
  }

  async getTickerSMDT(maCk, tuNgay) {
    const res = await this.fetchImpl(this.tickerUrl(maCk, tuNgay), { headers: this.headers });
    if (!res.ok) throw new KhongDuDuLieuError(`Lỗi API SMDT cho ${maCk}: HTTP ${res.status}`);
    const data = await res.json();
    return data.lich_su ?? data;
  }

  async getIndustrySMDT(tenNganh, tuNgay) {
    const res = await this.fetchImpl(this.industryUrl(tenNganh, tuNgay), { headers: this.headers });
    if (!res.ok) throw new KhongDuDuLieuError(`Lỗi API SMDT ngành ${tenNganh}: HTTP ${res.status}`);
    const data = await res.json();
    return data.lich_su ?? data;
  }
}

export class FourKeyEvaluator {
  constructor({
    smdtSource,
    tickerIndustryMap = DEFAULT_TICKER_INDUSTRY_MAP,
    lookbackSessions = FOUR_KEY_LOOKBACK_SESSIONS,
    historyBufferDays = 30,
  }) {
    this.smdtSource = smdtSource;
    this.tickerIndustryMap = tickerIndustryMap;
    this.lookbackSessions = lookbackSessions;
    this.historyBufferDays = historyBufferDays;
  }

  _resolveIndustry(maCk, tenNganh) {
    if (tenNganh) return tenNganh;
    const nganh = this.tickerIndustryMap[maCk.toUpperCase()];
    if (!nganh) {
      throw new Error(`Không xác định được ngành cho mã ${maCk}. Truyền tenNganh trực tiếp hoặc bổ sung vào tickerIndustryMap.`);
    }
    return nganh;
  }

  _tuNgay(targetDate) {
    return addDays(targetDate, -this.historyBufferDays);
  }

  async evaluate(maCk, ngay, tenNganh) {
    const ma = maCk.toUpperCase();
    const nganh = this._resolveIndustry(ma, tenNganh);
    const tuNgay = this._tuNgay(ngay);

    const [maRecords, nganhRecords] = await Promise.all([
      this.smdtSource.getTickerSMDT(ma, tuNgay),
      this.smdtSource.getIndustrySMDT(nganh, tuNgay),
    ]);

    const maSorted = uniqueByDate(maRecords).map((row) => ({ date: row.date, smdt: toNumber(row.smdt) })).filter((row) => row.smdt != null);
    const nganhSorted = uniqueByDate(nganhRecords).map((row) => ({ date: row.date, smdt: toNumber(row.smdt) })).filter((row) => row.smdt != null);

    const maIdx = indexOfDate(maSorted, ngay);
    const nganhIdx = indexOfDate(nganhSorted, ngay);
    if (maIdx === -1) throw new KhongDuDuLieuError(`Không có dữ liệu SMDT của ${ma} ngày ${ngay}`);
    if (nganhIdx === -1) throw new KhongDuDuLieuError(`Không có dữ liệu SMDT ngành ${nganh} ngày ${ngay}`);
    if (maIdx < this.lookbackSessions || nganhIdx < this.lookbackSessions) {
      throw new KhongDuDuLieuError(`Không đủ ${this.lookbackSessions} phiên lịch sử trước ${ngay} để tính động lượng`);
    }

    const smdtMaNow = maSorted[maIdx].smdt;
    const smdtMaPrev = maSorted[maIdx - this.lookbackSessions].smdt;
    const dongLuongMa = smdtMaNow - smdtMaPrev;
    const smdtNganhNow = nganhSorted[nganhIdx].smdt;
    const smdtNganhPrev = nganhSorted[nganhIdx - this.lookbackSessions].smdt;
    const dongLuongNganh = smdtNganhNow - smdtNganhPrev;
    const nhom = phanLoai4Key(dongLuongMa, dongLuongNganh);

    return {
      maCk: ma,
      tenNganh: nganh,
      ngay,
      smdtMa: round(smdtMaNow),
      smdtMaTruoc: round(smdtMaPrev),
      dongLuongMa: round(dongLuongMa),
      smdtNganh: round(smdtNganhNow),
      smdtNganhTruoc: round(smdtNganhPrev),
      dongLuongNganh: round(dongLuongNganh),
      nhom,
      khuyenNghi: KHUYEN_NGHI[nhom],
      evalKey: EVAL_KEY_BY_GROUP[nhom],
    };
  }

  async evaluateBatch(danhSachMa, ngay) {
    return Promise.all(
      danhSachMa.map(async (maCk) => {
        try {
          return await this.evaluate(maCk, ngay);
        } catch (e) {
          return { maCk: maCk.toUpperCase(), ngay, loi: e.message };
        }
      })
    );
  }

  async evaluateHistory(maCk, tuNgay, tenNganh) {
    const ma = maCk.toUpperCase();
    const nganh = this._resolveIndustry(ma, tenNganh);
    const [maRecords, nganhRecords] = await Promise.all([
      this.smdtSource.getTickerSMDT(ma, tuNgay),
      this.smdtSource.getIndustrySMDT(nganh, tuNgay),
    ]);

    const maByDate = new Map(uniqueByDate(maRecords).map((row) => [row.date, toNumber(row.smdt)]));
    const nganhByDate = new Map(uniqueByDate(nganhRecords).map((row) => [row.date, toNumber(row.smdt)]));
    const merged = [...maByDate.entries()]
      .filter(([date, smdtMa]) => smdtMa != null && nganhByDate.get(date) != null)
      .map(([date, smdtMa]) => ({ date, smdtMa, smdtNganh: nganhByDate.get(date) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const out = [];
    for (let i = this.lookbackSessions; i < merged.length; i += 1) {
      const cur = merged[i];
      const prev = merged[i - this.lookbackSessions];
      const dongLuongMa = cur.smdtMa - prev.smdtMa;
      const dongLuongNganh = cur.smdtNganh - prev.smdtNganh;
      const nhom = phanLoai4Key(dongLuongMa, dongLuongNganh);
      out.push({
        maCk: ma,
        date: cur.date,
        dongLuongMa: round(dongLuongMa),
        dongLuongNganh: round(dongLuongNganh),
        nhom,
        evalKey: EVAL_KEY_BY_GROUP[nhom],
      });
    }
    return out;
  }
}

export class CompositeScoreCalculator {
  constructor({
    smdtSource,
    priceSource = null,
    getCashflowStatus = null,
    cashflowLookup = null,
    tickerIndustryMap = DEFAULT_TICKER_INDUSTRY_MAP,
    lookbackSessions = FOUR_KEY_LOOKBACK_SESSIONS,
    historyBufferDays = 45,
  }) {
    this.smdtSource = smdtSource;
    this.priceSource = priceSource;
    this.getCashflowStatus = getCashflowStatus;
    this.cashflowLookup = cashflowLookup || {};
    this.tickerIndustryMap = tickerIndustryMap;
    this.lookbackSessions = lookbackSessions;
    this.historyBufferDays = historyBufferDays;
  }

  _resolveIndustry(maCk, tenNganh) {
    if (tenNganh) return tenNganh;
    const nganh = this.tickerIndustryMap[maCk.toUpperCase()];
    if (!nganh) throw new Error(`Không xác định được ngành cho ${maCk}`);
    return nganh;
  }

  _tuNgay(targetDate) {
    return addDays(targetDate, -this.historyBufferDays);
  }

  async _cashflowStatus(ma, ngay) {
    if (this.getCashflowStatus) return this.getCashflowStatus(ma, ngay);
    return this.cashflowLookup?.[ma]?.[ngay];
  }

  async score(maCk, ngay, tenNganh) {
    const ma = maCk.toUpperCase();
    const nganh = this._resolveIndustry(ma, tenNganh);
    const tuNgay = this._tuNgay(ngay);
    const ghiChu = [];

    const [maRecords, nganhRecords] = await Promise.all([
      this.smdtSource.getTickerSMDT(ma, tuNgay),
      this.smdtSource.getIndustrySMDT(nganh, tuNgay),
    ]);

    const maByDate = new Map(uniqueByDate(maRecords).map((row) => [row.date, toNumber(row.smdt)]));
    const nganhByDate = new Map(uniqueByDate(nganhRecords).map((row) => [row.date, toNumber(row.smdt)]));
    const df = [...maByDate.entries()]
      .filter(([date, smdtMa]) => smdtMa != null && nganhByDate.get(date) != null)
      .map(([date, smdtMa]) => ({ date, smdtMa, smdtNganh: nganhByDate.get(date) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const idx = indexOfDate(df, ngay);
    if (idx === -1) throw new KhongDuDuLieuError(`Không có dữ liệu SMDT khớp ngày ${ngay} cho ${ma}`);

    const smdtVsNganh = df.map((row) => row.smdtMa - row.smdtNganh);
    const smdtDelta = df.map((row, i) => (i >= this.lookbackSessions ? row.smdtMa - df[i - this.lookbackSessions].smdtMa : null));
    const scoreSmdtVsNganh = normalizeSeries0to100(smdtVsNganh);
    const scoreSmdtDelta = normalizeSeries0to100(smdtDelta.map((v) => (v == null ? 0 : v)));
    const row = df[idx];
    const dongLuongMa = smdtDelta[idx] ?? 0;

    const cfContent = await this._cashflowStatus(ma, ngay);
    let scoreCashflow = 50;
    if (cfContent) {
      const cfScore = CASHFLOW_SCORE_MAP[cfContent] ?? 0;
      scoreCashflow = ((cfScore + 1) / 2) * 100;
    } else {
      ghiChu.push("Thiếu dữ liệu dòng tiền cho ngày này -> tính như trung lập (50 điểm)");
    }

    const activeWeights = { ...TRONG_SO_V2 };
    let giaScore = null;
    let bonusPhanKy = 0;
    let coPhanKy = false;

    if (!this.priceSource) {
      ghiChu.push("Không có PriceDataSource -> bỏ factor giá, dồn trọng số sang các factor còn lại");
      delete activeWeights.giaDongLuong;
    } else {
      try {
        const priceRecords = uniqueByDate(await this.priceSource.getTickerPrice(ma, tuNgay))
          .map((price) => ({ date: price.date, close: toNumber(price.close) }))
          .filter((price) => price.close != null);
        const pIdx = indexOfDate(priceRecords, ngay);
        if (pIdx === -1) throw new KhongDuDuLieuError("Thiếu giá đúng ngày mục tiêu");

        const ret1d = priceRecords.map((price, i) => (i > 0 ? price.close / priceRecords[i - 1].close - 1 : 0));
        const ret3dPast = pIdx >= this.lookbackSessions
          ? priceRecords[pIdx].close / priceRecords[pIdx - this.lookbackSessions].close - 1
          : 0;
        giaScore = normalizeSeries0to100(ret1d)[pIdx];

        if (dongLuongMa > 0 && ret3dPast <= NGUONG_GIA_KHONG_TANG) {
          coPhanKy = true;
          const maxDelta = Math.max(...smdtDelta.filter((v) => v != null).map((v) => Math.abs(v)), 1);
          const tyLe = Math.min(dongLuongMa / maxDelta, 1);
          bonusPhanKy = round(BONUS_PHAN_KY_TOI_DA * tyLe, 1);
          ghiChu.push(
            `PHÁT HIỆN PHÂN KỲ: SMDT +${dongLuongMa.toFixed(1)} nhưng giá ${(ret3dPast * 100).toFixed(1)}% trong ${this.lookbackSessions} phiên qua -> cộng bonus +${bonusPhanKy} điểm`
          );
        }
      } catch (e) {
        ghiChu.push(`Có PriceDataSource nhưng thiếu dữ liệu giá (${e.message}) -> bỏ factor giá`);
        delete activeWeights.giaDongLuong;
      }
    }

    let totalW = Object.values(activeWeights).reduce((sum, weight) => sum + weight, 0);
    let weightedSum =
      activeWeights.smdtVsNganh * scoreSmdtVsNganh[idx]
      + activeWeights.smdtDelta * scoreSmdtDelta[idx]
      + activeWeights.dongTien * scoreCashflow;

    if ("smdtRank" in activeWeights) {
      ghiChu.push("Chưa có dữ liệu peer để tính xếp hạng ngành -> bỏ factor này");
      delete activeWeights.smdtRank;
      totalW = Object.values(activeWeights).reduce((sum, weight) => sum + weight, 0);
    }

    if (giaScore != null && "giaDongLuong" in activeWeights) {
      weightedSum += activeWeights.giaDongLuong * giaScore;
    }

    const composite = weightedSum / totalW;
    const compositeFinal = Math.min(100, Math.max(0, composite + bonusPhanKy));
    const breakdown = {
      smdtVsNganh: round(scoreSmdtVsNganh[idx], 1),
      smdtDelta: round(scoreSmdtDelta[idx], 1),
      dongTien: round(scoreCashflow, 1),
    };
    if (giaScore != null && "giaDongLuong" in activeWeights) breakdown.giaDongLuong = round(giaScore, 1);

    return {
      maCk: ma,
      tenNganh: nganh,
      ngay,
      smdtMa: row.smdtMa,
      smdtNganh: row.smdtNganh,
      compositeScore: round(compositeFinal, 1),
      rating: xepHang(compositeFinal),
      bonusPhanKy,
      coPhanKy,
      breakdown,
      ghiChu,
    };
  }

  async scoreBatch(danhSachMa, ngay) {
    return Promise.all(
      danhSachMa.map(async (maCk) => {
        try {
          return await this.score(maCk, ngay);
        } catch (e) {
          return { maCk: maCk.toUpperCase(), ngay, loi: e.message };
        }
      })
    );
  }
}
