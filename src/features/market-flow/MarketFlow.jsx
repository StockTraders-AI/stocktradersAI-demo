import { useTheme } from "../../theme";
import { useNarrow } from "../../app/useNarrow";
import { Card, StatCard } from "../../components/ui";

export function ModDongTienTT() {
  const { t } = useTheme();
  const narrow = useNarrow();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
        <StatCard label="Tổng GTGD" val={<span style={{ fontSize: 22 }}>18,250 tỷ</span>} sub="+2.3% so hôm qua" colorKey="G" />
        <StatCard label="Khối ngoại mua ròng" val={<span style={{ fontSize: 22 }}>+342 tỷ</span>} sub="3 phiên mua liên tiếp" colorKey="B" />
        <StatCard label="Tự doanh" val={<span style={{ fontSize: 22 }}>-128 tỷ</span>} sub="Bán ròng nhẹ" colorKey="A" />
        <StatCard label="Margin toàn TT" val={<span style={{ fontSize: 22 }}>~95K tỷ</span>} sub="Ổn định" colorKey="R" />
      </div>
      <Card style={{ padding: 60, textAlign: "center" }}>
        <i className="ti ti-trending-up" style={{ fontSize: 52, color: t.t4 }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t2)", marginTop: 12 }}>Biểu đồ dòng tiền thị trường</div>
        <div style={{ fontSize: 12, color: "var(--t4)", marginTop: 6 }}>Kết nối API để hiển thị chart GTGD, khối ngoại, tự doanh realtime</div>
      </Card>
    </div>
  );
}
