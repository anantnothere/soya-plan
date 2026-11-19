# MandiLens — manager demo talk track

**Problem:** Soybean procurement decisions are fragmented across mandi price reports, weather/supply signals and local market knowledge.

**Solution:** MandiLens combines reported mandi prices, market comparisons, experimental short-horizon forecasting and physical procurement risk scenarios in one decision-support workspace.

**Analytics:** The browser model uses lagged prices, rolling averages, volatility and optional exogenous variables. It reports holdout MAE and compares the result with a naive last-value baseline instead of presenting a forecast without validation.

**Risk:** The risk planner quantifies adverse price exposure and physical price-lock coverage. It deliberately does not claim exchange hedging is executable where regulatory restrictions apply.

**Next validation milestone:** Acquire at least 2–3 years of cleaned daily data for several major soybean mandis; add point-in-time rainfall, arrivals and supply factors; perform rolling-origin and out-of-market backtests; then deploy a shared database and scheduled ingestion pipeline.

**Do not claim:** guaranteed forecast accuracy, tick-by-tick live mandi prices, a verified hedge recommendation, or automatic live data ingestion in this prototype.
