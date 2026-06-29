# StockTraders AI — Dashboard

React + Vite recreation of the StockTraders AI market dashboard (Vietnamese stock-trading UI, dark theme). Responsive: a sidebar/grid layout on desktop and a drawer + bottom-tab layout on mobile (breakpoint at 768px).

## Quick start

```bash
npm install
npm run dev      # dev server on http://localhost:3000
```

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the Vite dev server (port 3000)|
| `npm run build`   | Production build to `dist/`          |
| `npm run preview` | Preview the production build         |

## Project structure

```
src/
  app/
    App.jsx
    modules.js
  components/
    ui/
      Card.jsx
      Table.jsx
      Pagination.jsx
      Badges.jsx
    layout/
      Sidebar.jsx
      Topbar.jsx
      BottomNav.jsx
  features/
    dashboard/
      Dashboard.jsx
    stock-wave/
      StockWave.jsx
      WaveDonut.jsx
    smdt-branch/
      SMDTBranch.jsx
    smdt-ticker/
      SMDTTicker.jsx
    cash-flow-branch/
      CashFlowBranch.jsx
    cash-flow-ticker/
      CashFlowTicker.jsx
      IndustryPicker.jsx
      CashFlowMatrixTable.jsx
      cashFlowUtils.js
  data/
  styles/
  theme/
```

> Data is hard-coded for the UI demo — "Dữ liệu chỉ mang tính tham khảo, không phải lời khuyên đầu tư."
