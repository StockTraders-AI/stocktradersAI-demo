export const CAU_HINH = {
  NGUONG_XAC_NHAN: 25,
  CHO_MUA_CAO: 0.26,
  CHO_BAN_CAO: 0.20,
  BAN_CAO: 0.10,
  BIEN_NGHIENG: 0.05,
  TC_MANH: 80,
};

export const PHA = {
  DIEU_CHINH: "\u0110i\u1ec1u ch\u1ec9nh",
  TICH_LUY: "T\u00edch l\u0169y",
  CHAN_SONG: "Ch\u00e2n s\u00f3ng",
  SONG_TANG: "S\u00f3ng t\u0103ng",
  PHAN_PHOI: "Ph\u00e2n ph\u1ed1i",
};

export const BANG_TRANG_THAI = {
  S0: {
    pha: PHA.DIEU_CHINH,
    tieuDe: "Th\u1ecb tr\u01b0\u1eddng \u0111ang trong nh\u1ecbp \u0111i\u1ec1u ch\u1ec9nh",
    dienGiai: (f) => `\u00c1p l\u1ef1c b\u00e1n chi\u1ebfm \u01b0u th\u1ebf v\u1edbi ${f.ban} m\u00e3 b\u00e1o B\u00e1n v\u00e0 ${f.choBan} m\u00e3 Ch\u1edd b\u00e1n. D\u00f2ng ti\u1ec1n \u0111ang r\u00fat ra, ch\u01b0a xu\u1ea5t hi\u1ec7n l\u1ef1c c\u1ea7u \u0111\u1ee1 gi\u00e1.`,
    hanhDong: "\u01afu ti\u00ean gi\u1eef ti\u1ec1n m\u1eb7t, \u0111\u1ee9ng ngo\u00e0i th\u1ecb tr\u01b0\u1eddng, ch\u1edd t\u00edn hi\u1ec7u c\u1ea1n cung.",
    canTinCay: false,
  },
  S1: {
    pha: PHA.TICH_LUY,
    tieuDe: "\u00c1p l\u1ef1c b\u00e1n suy gi\u1ea3m, d\u00f2ng ti\u1ec1n ch\u1edd mua nhen nh\u00f3m",
    dienGiai: (f) => `S\u1ed1 m\u00e3 b\u00e1o B\u00e1n gi\u1ea3m c\u00f2n ${f.ban}, trong khi Ch\u1edd mua nh\u00edch l\u00ean ${f.choMua}. Cung gi\u00e1 th\u1ea5p \u0111ang c\u1ea1n d\u1ea7n, th\u1ecb tr\u01b0\u1eddng b\u01b0\u1edbc v\u00e0o v\u00f9ng t\u00edch l\u0169y.`,
    hanhDong: "Theo d\u00f5i s\u00e1t, chu\u1ea9n b\u1ecb v\u1ed1n cho nh\u1ecbp gi\u1ea3i ng\u00e2n th\u0103m d\u00f2.",
    canTinCay: false,
  },
  S2: {
    pha: PHA.CHAN_SONG,
    tieuDe: "T\u00edn hi\u1ec7u ch\u1edd mua t\u0103ng cao",
    dienGiai: (f) => `Ch\u1edd mua \u0111\u1ea1t m\u1ee9c ${f.choMua}, cho th\u1ea5y l\u1ef1c b\u00e1n suy y\u1ebfu v\u00e0 d\u00f2ng ti\u1ec1n b\u1eaft \u0111\u1ea7u quay l\u1ea1i. Th\u1ecb tr\u01b0\u1eddng c\u00f3 kh\u1ea3 n\u0103ng b\u01b0\u1edbc v\u00e0o v\u00f9ng t\u1ea1o \u0111\u00e1y s\u1edbm.`,
    hanhDong: "C\u00e2n nh\u1eafc gi\u1ea3i ng\u00e2n th\u0103m d\u00f2 30%, \u01b0u ti\u00ean m\u00e3 n\u1ec1n t\u1ea3ng t\u1ed1t v\u00e0 ch\u1edd x\u00e1c nh\u1eadn s\u00f3ng.",
    canTinCay: false,
  },
  S3: {
    pha: PHA.CHAN_SONG,
    tieuDe: "X\u00e1c nh\u1eadn \u0111\u00e1y th\u1ecb tr\u01b0\u1eddng \u0111\u00e3 xu\u1ea5t hi\u1ec7n",
    dienGiai: (f) => `H\u1ec7 th\u1ed1ng ghi nh\u1eadn ${f.mua} m\u00e3 c\u1ed5 phi\u1ebfu b\u00e1o Mua, cho th\u1ea5y d\u00f2ng ti\u1ec1n x\u00e1c nh\u1eadn m\u1ea1nh h\u01a1n sau giai \u0111o\u1ea1n d\u00f2 \u0111\u00e1y. T\u00e2m l\u00fd th\u1ecb tr\u01b0\u1eddng \u0111ang c\u1ea3i thi\u1ec7n r\u00f5 r\u1ec7t.`,
    hanhDong: "C\u00f3 th\u1ec3 t\u0103ng t\u1ef7 tr\u1ecdng theo k\u1ebf ho\u1ea1ch, \u01b0u ti\u00ean c\u1ed5 phi\u1ebfu \u0111\u00fang s\u00f3ng \u0111\u00fang ng\u00e0nh.",
    canTinCay: true,
  },
  S4: {
    pha: PHA.SONG_TANG,
    tieuDe: "S\u00f3ng t\u0103ng \u0111ang duy tr\u00ec",
    dienGiai: (f) => {
      const lead = f.mua >= CAU_HINH.NGUONG_XAC_NHAN
        ? `D\u00f2ng ti\u1ec1n ti\u1ebfp t\u1ee5c \u0111\u1ed5 v\u00e0o m\u1ea1nh v\u1edbi ${f.mua} m\u00e3 b\u00e1o Mua`
        : `L\u1ef1c mua h\u1ea1 nhi\u1ec7t c\u00f2n ${f.mua} m\u00e3 nh\u01b0ng Ch\u1edd mua v\u1eabn duy tr\u00ec \u1edf m\u1ee9c ${f.choMua}`;
      return `${lead}. \u00c1p l\u1ef1c b\u00e1n ch\u01b0a \u0111\u00e1ng k\u1ec3 v\u1edbi Ch\u1edd b\u00e1n ${f.choBan} v\u00e0 B\u00e1n ${f.ban}, cho th\u1ea5y s\u00f3ng t\u0103ng v\u1eabn ch\u01b0a g\u00e3y.`;
    },
    hanhDong: "Gi\u1eef t\u1ef7 tr\u1ecdng, \u01b0u ti\u00ean m\u00e3 m\u1ea1nh trong ng\u00e0nh d\u1eabn s\u00f3ng, h\u1ea1n ch\u1ebf mua \u0111u\u1ed5i.",
    canTinCay: true,
  },
  S5: {
    pha: PHA.SONG_TANG,
    tieuDe: "\u0110\u00e0 t\u0103ng ch\u1eefng l\u1ea1i, xu\u1ea5t hi\u1ec7n ph\u00e2n h\u00f3a",
    dienGiai: (f) => `S\u1ed1 m\u00e3 b\u00e1o Mua gi\u1ea3m c\u00f2n ${f.mua}, l\u1ef1c c\u1ea7u m\u1edbi suy y\u1ebfu trong khi Ch\u1edd b\u00e1n t\u0103ng l\u00ean ${f.choBan}. D\u00f2ng ti\u1ec1n c\u00f3 d\u1ea5u hi\u1ec7u ph\u00e2n h\u00f3a sau nh\u1ecbp t\u0103ng.`,
    hanhDong: "Ch\u1ed1t l\u1eddi t\u1eebng ph\u1ea7n \u1edf m\u00e3 \u0111\u1ea1t k\u1ef3 v\u1ecdng, si\u1ebft k\u1ef7 lu\u1eadt v\u00e0 ng\u1eebng mua m\u1edbi.",
    canTinCay: false,
  },
  S6: {
    pha: PHA.PHAN_PHOI,
    tieuDe: "C\u1ea3nh b\u00e1o ph\u00e2n ph\u1ed1i, d\u00f2ng ti\u1ec1n ch\u1edd b\u00e1n t\u0103ng cao",
    dienGiai: (f) => `S\u1ed1 m\u00e3 Ch\u1edd b\u00e1n t\u0103ng l\u00ean ${f.choBan}, trong khi l\u1ef1c Mua suy y\u1ebfu c\u00f2n ${f.mua}. \u0110\u00e2y l\u00e0 t\u00edn hi\u1ec7u d\u00f2ng ti\u1ec1n b\u1eaft \u0111\u1ea7u chuy\u1ec3n sang tr\u1ea1ng th\u00e1i ph\u00f2ng th\u1ee7.`,
    hanhDong: "Ch\u1ee7 \u0111\u1ed9ng h\u1ea1 t\u1ef7 tr\u1ecdng, \u01b0u ti\u00ean b\u1ea3o to\u00e0n l\u1ee3i nhu\u1eadn v\u00e0 quan s\u00e1t ph\u1ea3n \u1ee9ng cung c\u1ea7u.",
    canTinCay: false,
  },
  S7: {
    pha: PHA.PHAN_PHOI,
    tieuDe: "X\u00e1c nh\u1eadn th\u1ecb tr\u01b0\u1eddng t\u1ea1o \u0111\u1ec9nh",
    dienGiai: (f) => `H\u1ec7 th\u1ed1ng ghi nh\u1eadn ${f.ban} m\u00e3 b\u00e1o B\u00e1n, cho th\u1ea5y \u00e1p l\u1ef1c b\u00e1n lan r\u1ed9ng v\u00e0 s\u00f3ng t\u0103ng c\u00f3 d\u1ea5u hi\u1ec7u k\u1ebft th\u00fac. R\u1ee7i ro \u0111i\u1ec1u ch\u1ec9nh \u0111ang t\u0103ng l\u00ean.`,
    hanhDong: "B\u00e1n quy\u1ebft li\u1ec7t, \u0111\u01b0a danh m\u1ee5c v\u1ec1 ti\u1ec1n m\u1eb7t v\u00e0 ch\u1edd nh\u1ecbp s\u00f3ng m\u1edbi.",
    canTinCay: true,
  },
  SN: {
    pha: null,
    tieuDe: "Th\u1ecb tr\u01b0\u1eddng trung t\u00ednh",
    dienGiai: (f) => `C\u00e1c t\u00edn hi\u1ec7u \u0111ang c\u00e2n b\u1eb1ng v\u1edbi Ch\u1edd mua \u1edf m\u1ee9c ${f.choMua}, Mua ${f.mua}, Ch\u1edd b\u00e1n ${f.choBan}, B\u00e1n ${f.ban}. D\u00f2ng ti\u1ec1n ch\u01b0a h\u00ecnh th\u00e0nh xu h\u01b0\u1edbng r\u00f5 r\u00e0ng.`,
    hanhDong: "Gi\u1eef nguy\u00ean tr\u1ea1ng th\u00e1i, theo d\u00f5i di\u1ec5n bi\u1ebfn c\u00e1c phi\u00ean t\u1edbi.",
    canTinCay: false,
  },
};

export function tinhDacTrung(p, truoc) {
  const tong = p.tong || (p.choMua + p.mua + p.choBan + p.ban);
  const delta = (key) => (truoc ? p[key] - truoc[key] : 0);
  return {
    choMua: p.choMua,
    mua: p.mua,
    choBan: p.choBan,
    ban: p.ban,
    tinCay: p.tinCay,
    tong,
    tlChoMua: p.choMua / tong,
    tlMua: p.mua / tong,
    tlChoBan: p.choBan / tong,
    tlBan: p.ban / tong,
    dChoMua: delta("choMua"),
    dMua: delta("mua"),
    dChoBan: delta("choBan"),
    dBan: delta("ban"),
  };
}

export function phanLoai(f, phaTruoc) {
  const N = CAU_HINH;
  if (f.ban >= N.NGUONG_XAC_NHAN) return "S7";
  if (f.mua >= N.NGUONG_XAC_NHAN) return "S4";
  if (f.tlChoBan >= N.CHO_BAN_CAO) return [PHA.SONG_TANG, PHA.PHAN_PHOI].includes(phaTruoc) ? "S6" : "S0";
  if (phaTruoc === PHA.SONG_TANG && f.dChoBan > 0 && f.dMua < 0 && f.tlChoBan < N.CHO_BAN_CAO) return "S5";
  if ([PHA.CHAN_SONG, PHA.SONG_TANG].includes(phaTruoc) && f.ban < N.NGUONG_XAC_NHAN && f.tlBan < N.BAN_CAO && f.tlChoBan < N.CHO_BAN_CAO) return "S4";
  const chenhLech = f.tlChoMua - f.tlChoBan;
  if (chenhLech <= -N.BIEN_NGHIENG) return "S0";
  if (chenhLech >= N.BIEN_NGHIENG) return "S1";
  return "SN";
}

export function danhGiaDoSong({ hienTai, phienTruoc = null, phaTruoc = null }) {
  const f = tinhDacTrung(hienTai, phienTruoc);
  const ma = phanLoai(f, phaTruoc);
  const state = BANG_TRANG_THAI[ma];
  const tcDuDieuKien = f.mua >= CAU_HINH.NGUONG_XAC_NHAN || f.ban >= CAU_HINH.NGUONG_XAC_NHAN;
  return {
    maTrangThai: ma,
    pha: state.pha,
    tieuDe: state.tieuDe,
    dienGiai: state.dienGiai(f),
    hanhDong: state.hanhDong,
    tinCay: {
      giaTri: f.tinCay,
      duDieuKien: tcDuDieuKien,
      ghiChu: tcDuDieuKien ? null : "\u0110\u1ed9 tin c\u1eady ch\u01b0a \u0111\u1ee7 \u0111i\u1ec1u ki\u1ec7n di\u1ec5n gi\u1ea3i khi Mua ho\u1eb7c B\u00e1n ch\u01b0a \u0111\u1ea1t ng\u01b0\u1ee1ng x\u00e1c nh\u1eadn.",
    },
    dacTrung: f,
  };
}
