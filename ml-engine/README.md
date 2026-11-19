# Offline ML training engine

This is an optional Python research pipeline to train and compare Ridge, Random Forest and HistGradientBoosting models.

## Install
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## Prepare a combined point-in-time CSV
Required: `State,District,Market,Commodity,Arrival_Date,Modal_Price`

Optional: `Arrivals,Rainfall_mm,Temperature_C,USD_INR,Global_Soybean,Soybean_Meal_Price,Soybean_Oil_Price,MSP`

The factor values on a row must have been publicly available on or before that row's forecast origin. Do not backfill revised production estimates into dates before publication.

## Train
```bash
python train_forecast.py --input soybean_history.csv --state "Madhya Pradesh" --market Indore --horizon 7
```
The script uses an 80/20 chronological holdout, compares three models and a last-observation baseline, selects the lowest holdout-MAE model, and saves `model_output/soybean_model.joblib` plus `metrics.json`.

Important: the script currently reports one chronological holdout. For a manager-ready research result, add rolling-origin backtesting across multiple seasons and hold out entire markets for generalisation tests.
