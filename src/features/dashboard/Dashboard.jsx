import { useMemo } from "react";
import { useTheme } from "../../theme";
import { mono, valToHmCls } from "../../styles/tokens";
import { useNarrow } from "../../app/useNarrow";
import { fmtFull, fmtNum } from "../../app/formatters";
import { useSMDT, useRealtimeFeed as useRealtimeSMDTBranchFeed } from "../../data/useSMDT";
import { useCashFlowBranch, useRealtimeCashFlowFeed, contentToSig } from "../../data/useCashFlowBranch";
import { useSMDTTicker, useRealtimeSMDTTickerFeed } from "../../data/useSMDTTicker";
import { useCashFlowTicker, useRealtimeCashFlowTickerFeed, tickerContentToSig } from "../../data/useCashFlowTicker";
import { useBranchPath } from "../../data/useBranchPath";
import { Card, CardHeader, Clink, HM, LiveFooter, StatCard } from "../../components/ui";
import { CfBadge } from "../cash-flow-ticker/CfBadge";

const SIG_ORDER = ["si", "sn", "so", "st"];
const TOP_LIMIT = 5;

function nav(id) {
  window.dispatchEvent(new CustomEvent("st-nav", { detail: id }));
}

function topDate(datesAsc) {
  return datesAsc[datesAsc.length - 1] || "";
}

function tickerScore(smdt, sig, branchSmdt) {
  const sigBonus = { si: 18, sn: 9, so: -6, st: -14 }[sig] || 0;
  return smdt + sigBonus + (Number.isFinite(branchSmdt) ? branchSmdt * 0.18 : 0);
}

function StatMini({ label, value, sub, color }) {
  return (
    <div style={{ background: "var(--elev)", border: "0.5px solid var(--bdr)", borderRadius: 9, padding: "10px 11px" }}>
      <div style={{ color, fontSize: 22, fontWeight: 850, lineHeight: 1, ...mono }}>{value}</div>
      <div style={{ marginTop: 5, color: "var(--t3)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      {sub && <div style={{ color: "var(--t4)", fontSize: 10 }}>{sub}</div>}
    </div>
  );
}

function EmptyHint({ children = "Đang tải…" }) {
  return <div style={{ padding: 22, textAlign: "center", color: "var(--t3)", fontSize: 12 }}>{children}</div>;
}

function SmdtCell({ value }) {
  const cls = valToHmCls(value);
  if (!cls || !Number.isFinite(value)) return <span style={{ color: "var(--t4)" }}>—</span>;
  return <HM cls={cls} val={value.toFixed(1)} />;
}

function ProgressRow({ label, value, total, color, right }) {
  const width = total ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ width: 92, color: "var(--t2)", fontSize: 12, fontWeight: 650 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--elev)", overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
      <span style={{ width: 76, textAlign: "right", color: "var(--t1)", fontSize: 12, ...mono }}>{right ?? fmtNum(value)}</span>
    </div>
  );
}

export function ModDashboard() {
  const { t } = useTheme();
  const narrow = useNarrow();
  const smdt = useSMDT();
  const cashBranch = useCashFlowBranch();
  const smdtTicker = useSMDTTicker();
  const cashTicker = useCashFlowTicker();
  const branchPath = useBranchPath();

  const liveSmdtBranch = useRealtimeSMDTBranchFeed(smdt.applyTick);
  const liveCashBranch = useRealtimeCashFlowFeed(cashBranch.applyTick);
  const liveSmdtTicker = useRealtimeSMDTTickerFeed(smdtTicker.applyTick);
  const liveCashTicker = useRealtimeCashFlowTickerFeed(cashTicker.applyTick);

  const smdtBranchDate = topDate(smdt.datesAsc);
  const cashBranchDate = topDate(cashBranch.datesAsc);
  const smdtTickerDate = topDate(smdtTicker.datesAsc);
  const cashTickerDate = cashTicker.latest?.date || "";
  const updatedAt = smdt.updatedAt || cashBranch.updatedAt || smdtTicker.updatedAt || cashTicker.updatedAt;
  const live = liveSmdtBranch.connected || liveCashBranch.connected || liveSmdtTicker.connected || liveCashTicker.connected;

  const branchSmdtRows = useMemo(() => {
    return smdt.branches
      .map((branch) => ({ key: branch.key, label: branch.label, value: smdt.matrix[branch.key]?.[smdtBranchDate] }))
      .filter((row) => Number.isFinite(row.value))
      .sort((a, b) => b.value - a.value);
  }, [smdt.branches, smdt.matrix, smdtBranchDate]);

  const branchCashRows = useMemo(() => {
    return cashBranch.branches
      .map((branch) => ({ key: branch.key, label: branch.label, sig: contentToSig(cashBranch.matrix[branch.key]?.[cashBranchDate]) }))
      .filter((row) => row.sig)
      .sort((a, b) => SIG_ORDER.indexOf(a.sig) - SIG_ORDER.indexOf(b.sig));
  }, [cashBranch.branches, cashBranch.matrix, cashBranchDate]);

  const cashTickerRows = cashTicker.latest?.rows || [];
  const cashTickerCounts = useMemo(() => {
    const counts = { si: 0, sn: 0, so: 0, st: 0 };
    for (const row of cashTickerRows) {
      const sig = tickerContentToSig(row.content);
      if (sig) counts[sig] += 1;
    }
    return counts;
  }, [cashTickerRows]);

  const branchValueByName = useMemo(() => {
    const map = new Map();
    for (const row of branchSmdtRows) map.set(row.label, row.value);
    return map;
  }, [branchSmdtRows]);

  const cashByTicker = useMemo(() => {
    const map = new Map();
    for (const row of cashTickerRows) map.set(row.ticker, row);
    return map;
  }, [cashTickerRows]);

  const topTickers = useMemo(() => {
    const rows = smdtTicker.tickers.flatMap((tk) => {
      const smdtValue = smdtTicker.matrix[tk.key]?.[smdtTickerDate];
      if (!Number.isFinite(smdtValue)) return [];
      const cash = cashByTicker.get(tk.key);
      const industry = branchPath.tickerToBranch[tk.key] || "Khác";
      const branchSmdt = branchValueByName.get(industry);
      const sig = tickerContentToSig(cash?.content || "");
      return [{
        ticker: tk.key,
        name: tk.name || tk.key,
        industry,
        smdt: smdtValue,
        sig,
        price: cash?.price,
        score: tickerScore(smdtValue, sig, branchSmdt),
      }];
    });
    return rows.sort((a, b) => b.score - a.score || b.smdt - a.smdt).slice(0, TOP_LIMIT);
  }, [branchPath.tickerToBranch, branchValueByName, cashByTicker, smdtTicker.matrix, smdtTicker.tickers, smdtTickerDate]);

  const strongBranchCount = branchSmdtRows.filter((row) => row.value >= 70).length;
  const veryStrongBranch = branchSmdtRows.filter((row) => row.value >= 100).length;
  const strongTickerCount = smdtTicker.tickers.filter((tk) => smdtTicker.matrix[tk.key]?.[smdtTickerDate] >= 70).length;
  const hotTickerCount = smdtTicker.tickers.filter((tk) => smdtTicker.matrix[tk.key]?.[smdtTickerDate] >= 100).length;
  const inflowBranchCount = branchCashRows.filter((row) => row.sig === "si" || row.sig === "sn").length;
  const inflowTickerCount = cashTickerCounts.si + cashTickerCounts.sn;
  const outflowTickerCount = cashTickerCounts.so + cashTickerCounts.st;
  const tickerTotal = Math.max(cashTickerRows.length, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
        <StatCard label="Ngành mạnh" val={fmtNum(strongBranchCount)} sub={`${fmtNum(veryStrongBranch)} ngành SMDT > 100`} colorKey="G" />
        <StatCard label="Mã mạnh" val={fmtNum(strongTickerCount)} sub={`${fmtNum(hotTickerCount)} mã SMDT > 100`} colorKey="B" />
        <StatCard label="Dòng tiền vào" val={fmtNum(inflowTickerCount)} sub={`${fmtNum(inflowBranchCount)} ngành ủng hộ`} colorKey="MU" />
        <StatCard label="Dòng tiền ra" val={fmtNum(outflowTickerCount)} sub={`${fmtNum(cashTickerRows.length)} mã có tín hiệu`} colorKey="R" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1.35fr) minmax(320px,.85fr)", gap: 12, alignItems: "start" }}>
        <Card>
          <CardHeader
            icon="ti-award"
            title="Top mã mạnh"
            meta={smdtTickerDate ? `· ${fmtFull(smdtTickerDate)}` : ""}
            right={<Clink onClick={() => nav("top-ma-manh")}>Chi tiết →</Clink>}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topTickers.length ? topTickers.map((row, index) => (
              <div key={row.ticker} style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr) auto auto", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: index === topTickers.length - 1 ? "none" : "0.5px solid var(--bdrs)" }}>
                <span style={{ color: index < 3 ? "var(--B)" : "var(--t4)", fontSize: 12, fontWeight: 850, ...mono }}>#{index + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ color: "var(--t1)", fontSize: 14, fontWeight: 850 }}>{row.ticker}</span>
                    <span style={{ color: "var(--t4)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.industry}</span>
                  </div>
                  <div style={{ color: "var(--t4)", fontSize: 10, ...mono }}>{row.price ? fmtNum(row.price) : "—"}</div>
                </div>
                <SmdtCell value={row.smdt} />
                <CfBadge sig={row.sig} small />
              </div>
            )) : <EmptyHint />}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon="ti-table"
            title="SMDT ngành"
            meta={smdtBranchDate ? `· ${fmtFull(smdtBranchDate)}` : ""}
            right={<Clink onClick={() => nav("smdt-nganh")}>Chi tiết →</Clink>}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {branchSmdtRows.slice(0, 7).map((row, index) => (
              <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 18, color: "var(--t4)", fontSize: 11, ...mono }}>{index + 1}</span>
                <span style={{ flex: 1, minWidth: 0, color: "var(--t2)", fontSize: 12, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                <SmdtCell value={row.value} />
              </div>
            ))}
            {!branchSmdtRows.length && <EmptyHint />}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(2,1fr)", gap: 12 }}>
        <Card>
          <CardHeader
            icon="ti-trending-up"
            title="Dòng tiền cổ phiếu"
            meta={cashTickerDate ? `· ${fmtFull(cashTickerDate)}` : ""}
            right={<Clink onClick={() => nav("dong-tien-cp")}>Chi tiết →</Clink>}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <ProgressRow label="Đổ vào" value={cashTickerCounts.si} total={tickerTotal} color={t.MU} right={`${fmtNum(cashTickerCounts.si)} mã`} />
            <ProgressRow label="Nhen nhóm" value={cashTickerCounts.sn} total={tickerTotal} color={t.G} right={`${fmtNum(cashTickerCounts.sn)} mã`} />
            <ProgressRow label="Đang thoát" value={cashTickerCounts.so} total={tickerTotal} color={t.A} right={`${fmtNum(cashTickerCounts.so)} mã`} />
            <ProgressRow label="Thoát ra" value={cashTickerCounts.st} total={tickerTotal} color={t.R} right={`${fmtNum(cashTickerCounts.st)} mã`} />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon="ti-building-community"
            title="Dòng tiền ngành"
            meta={cashBranchDate ? `· ${fmtFull(cashBranchDate)}` : ""}
            right={<Clink onClick={() => nav("dong-tien-nganh")}>Chi tiết →</Clink>}
          />
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: "8px 12px" }}>
            {branchCashRows.slice(0, 10).map((row) => (
              <div key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--t2)", fontSize: 12, fontWeight: 650 }}>{row.label}</span>
                <CfBadge sig={row.sig} small />
              </div>
            ))}
            {!branchCashRows.length && <EmptyHint />}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3,1fr)", gap: 10 }}>
        <StatMini label="Ngày ngành" value={smdtBranchDate ? fmtFull(smdtBranchDate) : "—"} sub="SMDT ngành" color="var(--G)" />
        <StatMini label="Ngày mã" value={smdtTickerDate ? fmtFull(smdtTickerDate) : "—"} sub="SMDT cổ phiếu" color="var(--B)" />
        <StatMini label="Dữ liệu ngành" value={fmtNum(branchPath.branches.length)} sub="Nhóm ngành đang map mã" color="var(--A)" />
      </div>

      <LiveFooter live={live} updatedAt={updatedAt} extra="Dashboard tổng hợp" />
    </div>
  );
}
