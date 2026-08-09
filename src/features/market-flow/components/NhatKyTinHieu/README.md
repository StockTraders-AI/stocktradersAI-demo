# NhatKyTinHieu

Component Nhật ký tín hiệu độc lập. Có thể copy nguyên folder `NhatKyTinHieu` sang project React/Vite khác và dùng ngay.

## Dùng với rows đã normalize

```jsx
import NhatKyTinHieu from "./components/NhatKyTinHieu";

<NhatKyTinHieu rows={rows} dateKey="2026-07-31" theme="dark" />
```

## Dùng trực tiếp từ API payload

```jsx
import NhatKyTinHieu from "./components/NhatKyTinHieu";
import { normalizeStockNotiRows } from "./components/NhatKyTinHieu/helpers.js";

const rows = normalizeStockNotiRows(apiPayload);

<NhatKyTinHieu rows={rows} theme="light" />
```

## Helper có sẵn

```jsx
import {
  fetchStockNoti,
  normalizeStockNotiRows,
  mergeStockNotiRows,
  pickStockNotiRowsForDate,
} from "./components/NhatKyTinHieu/helpers.js";
```

`fetchStockNoti(dateKey)` mặc định gọi `/api/stock-noti?date=YYYY-MM-DD`. Có thể đổi endpoint:

```jsx
const rows = await fetchStockNoti("2026-07-31", { endpoint:"https://example.com/api/stock-noti" });
```

## Props chính

- `rows` hoặc `logs`: danh sách dòng nhật ký đã normalize.
- `dateKey`: ngày header dạng `YYYY-MM-DD`.
- `theme`: `dark` hoặc `light`.
- `collapsedLimit`: số dòng hiện khi thu gọn, mặc định `6`.
- `onViewAll` / `onXemTatCa`: callback khi mở xem tất cả.
- `colors`: override token màu nếu UI khác cần theme riêng.
