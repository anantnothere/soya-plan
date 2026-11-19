# MandiLens v2 — Soybean Procurement & Commodity Risk Intelligence

Professional Next.js dashboard for Vercel with:
- Mandi CSV ingestion and browser persistence
- State/mandi search and latest-price comparisons
- In-browser ridge-regression time-series forecasting
- Chronological holdout MAE comparison against a naive last-value baseline
- Optional exogenous columns: arrivals, rainfall, temperature, USD/INR, global soybean, soymeal, soyoil and MSP
- Physical exposure / price-lock coverage scenario calculator
- Public data source register and model governance notes
- Optional offline Python ML training and model selection pipeline (`ml-engine/`)

## Important truth and limitations
This release does **not** connect to live government data automatically. It ingests CSV files manually. The Next.js forecast trains in the user's browser on the selected mandi's imported history; it needs at least 40 observations and is experimental. The Python research pipeline compares Ridge, Random Forest and HistGradientBoosting using a chronological holdout.

The browser app stores imported rows in localStorage: data is device/browser-specific, not shared across users and not a production database. Add PostgreSQL/Supabase and a scheduled ingestion worker before multi-user deployment.

The hedge module is a physical exposure and price-lock scenario calculator, not a futures order system. NCDEX/NCCL disclosed that soybean, refined soy oil and soybean meal derivatives restrictions were extended through 31 March 2027. Verify current SEBI/exchange circulars before any derivatives functionality or hedge recommendation. Do not assume a contract is tradable because historical prices exist.

## 1. Run locally
Install Node.js 18.17 or newer:
```bash
npm install
npm run dev
```
Open http://localhost:3000

Production build:
```bash
npm run build
npm start
```

## 2. Deploy to Vercel
1. Extract this ZIP.
2. Upload the project contents to a GitHub repository.
3. In Vercel choose Add New → Project → import that repository.
4. Framework preset: Next.js (auto-detected).
5. No environment variables are required for this prototype.
6. Deploy.

## 3. Download data
Official public sources:
- AGMARKNET / daily mandi prices: https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi
- IMD daily district rainfall: https://nwdp.nwic.gov.in/en/dataset/rainfall-daily-imd
- Agriculture area/production/yield estimates: https://desagri.gov.in/divisions-cell/agricultural-statistics-division/
- USDA FAS GAIN India oilseeds reports: https://www.fas.usda.gov/data/india-oilseeds-and-products-update
- NCDEX bhavcopy (historical/market data; check legal trading status): https://ncdex.com/markets/bhavcopy

Download the mandi CSV, align optional factors to matching market/district and date, then use Import data in the dashboard.

## 4. CSV schema
**Raw Agmarknet download works as-is.** Columns such as `Min_x0020_Price`, `Max_x0020_Price`, `Modal_x0020_Price`, `Variety`, `Grade` and dates like `19/11/2026` are recognised automatically. The file may contain every commodity; only rows whose Commodity contains "Soyabean"/"Soybean" are imported. Rows with missing or zero prices are skipped (they never show as ₹0).

**Bundled data:** `public/data/soybean_mandi_prices.csv` (94 soyabean rows, 19 Nov 2026) loads automatically on first visit so the deployed site shows prices immediately. Replace that file to change the default dataset.

**Building history for the forecast:** each Agmarknet download is a single-day snapshot. Import one file per day (duplicates are merged automatically); the Forecast tab activates once a mandi has 40+ days of history. When a mandi reports several variety/grade rows on one day, the FAQ grade is used for charts and forecasting.

Required logical columns:
- State
- District
- Market (or Mandi)
- Commodity (Soybean/Soyabean)
- Arrival_Date (YYYY-MM-DD or DD/MM/YYYY)
- Min_Price
- Max_Price
- Modal_Price

Optional:
- Arrivals
- Rainfall_mm
- Temperature_C
- USD_INR
- Global_Soybean
- Soybean_Meal_Price
- Soybean_Oil_Price
- MSP

Optional factors should be joined with publication/observation dates and not leaked from future revisions.

## 5. Model design
Browser engine: Ridge regression on lagged prices (1, 2, 3, 7), rolling means (7, 14), rolling volatility, momentum and optional lagged external factors. It uses a chronological 80/20 holdout, calculates MAE and directional accuracy, and compares MAE with a last-observation baseline. Seven-step recursive forecasts carry the latest known external factors forward. This is a modelling assumption, not a weather/FX forecast. Prediction bands are empirical holdout error ranges, not guaranteed confidence intervals.

Offline Python engine: Ridge, Random Forest and HistGradientBoosting candidate models; chronological 80/20 holdout; lowest-MAE model selection; naive benchmark; metrics and joblib export.

For a serious production model, use rolling-origin backtesting, multiple market/season holdouts, a model registry, drift monitoring, feature publication timestamps and a complete data lineage table.

## 6. Hedge and procurement logic
The in-app calculator estimates adverse price exposure for a buyer or seller, physical quantity price-locked, residual unprotected quantity and scenario P&L sensitivity. It does not execute or recommend a derivatives trade. It excludes basis, grade, freight, taxes, finance, margin calls and counterparty risk. Physical forward agreements require legal, tax and counterparty review.

## 7. Production roadmap
- Scheduled ingestion from permitted official sources
- Supabase/PostgreSQL shared database
- Separate data ingestion worker with retries and source timestamps
- Data-quality and schema-change monitoring
- Weather/production/trade factor join with point-in-time snapshots
- Rolling backtests and model monitoring
- Role-based access, audit logs and user-specific procurement parameters
