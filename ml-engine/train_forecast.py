"""
Offline research-grade baseline trainer for soybean mandi modal prices.

Input CSV required columns:
State,District,Market,Commodity,Arrival_Date,Modal_Price

Optional point-in-time features:
Arrivals,Rainfall_mm,Temperature_C,USD_INR,Global_Soybean,
Soybean_Meal_Price,Soybean_Oil_Price,MSP

Usage:
  python train_forecast.py --input soybean_history.csv --state "Madhya Pradesh" --market Indore

This script uses chronological holdout evaluation. It is not financial advice.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import VotingRegressor
import joblib

ALIASES = {
    "date": ["arrival_date", "date", "reported_date"],
    "modal": ["modal_price", "modal", "price"],
    "state": ["state"], "district": ["district"], "market": ["market", "mandi"],
    "commodity": ["commodity"], "arrivals": ["arrivals", "arrival", "arrival_qty"],
    "rainfall": ["rainfall_mm", "rainfall"], "temperature": ["temperature_c", "temperature", "temp_c"],
    "usd_inr": ["usd_inr", "usd_inr_rate"], "global_soy": ["global_soybean", "global_soy_price", "cbot_soybean"],
    "soy_meal": ["soybean_meal_price", "soymeal_price", "soy_meal"],
    "soy_oil": ["soybean_oil_price", "soyoil_price", "soy_oil"], "msp": ["msp", "soybean_msp"]
}
FACTOR_COLS = ["arrivals","rainfall","temperature","usd_inr","global_soy","soy_meal","soy_oil","msp"]

def normalize(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).replace("_x0020_"," ").strip().lower().replace(" ","_").replace("-","_") for c in df.columns]
    rename = {}
    for target, choices in ALIASES.items():
        for choice in choices:
            if choice in df.columns:
                rename[choice] = target
                break
    return df.rename(columns=rename)

def load_data(path: str, state: str | None, market: str | None) -> pd.DataFrame:
    df = normalize(pd.read_csv(path))
    required = ["date","modal","state","market","commodity"]
    missing = [c for c in required if c not in df]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    df["date"] = pd.to_datetime(df["date"], dayfirst=True, errors="coerce")
    df["modal"] = pd.to_numeric(df["modal"].astype(str).str.replace(",",""), errors="coerce")
    for c in FACTOR_COLS:
        if c not in df: df[c] = np.nan
        df[c] = pd.to_numeric(df[c].astype(str).str.replace(",",""), errors="coerce")
    df = df[df["commodity"].astype(str).str.contains("soy",case=False,na=False)]
    if state: df = df[df["state"].astype(str).str.casefold() == state.casefold()]
    if market: df = df[df["market"].astype(str).str.casefold() == market.casefold()]
    df = df.dropna(subset=["date","modal"]).sort_values("date")
    df = df.groupby("date",as_index=False).agg({"modal":"mean",**{c:"mean" for c in FACTOR_COLS}})
    if len(df) < 60:
        raise ValueError(f"Only {len(df)} dated observations. Aim for at least 60; 2-3 years is preferable.")
    return df.reset_index(drop=True)

def make_features(df: pd.DataFrame) -> tuple[pd.DataFrame,pd.Series]:
    out = pd.DataFrame(index=df.index)
    p = df["modal"]
    for lag in [1,2,3,5,7,14,21,30]:
        out[f"lag_{lag}"] = p.shift(lag)
    out["mean_7"] = p.shift(1).rolling(7).mean()
    out["mean_14"] = p.shift(1).rolling(14).mean()
    out["mean_30"] = p.shift(1).rolling(30).mean()
    out["std_7"] = p.shift(1).rolling(7).std()
    out["momentum_7"] = p.shift(1)-p.shift(8)
    out["momentum_14"] = p.shift(1)-p.shift(15)
    for c in FACTOR_COLS:
        # use only values available on/before the forecast origin
        out[f"factor_{c}"] = df[c].shift(1)
    out["month_sin"] = np.sin(2*np.pi*df["date"].dt.month/12)
    out["month_cos"] = np.cos(2*np.pi*df["date"].dt.month/12)
    y = p.copy()
    valid = out.notna().sum(axis=1) >= 12
    return out.loc[valid].replace([np.inf,-np.inf],np.nan), y.loc[valid]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--input",required=True)
    ap.add_argument("--state")
    ap.add_argument("--market")
    ap.add_argument("--horizon",type=int,default=7)
    ap.add_argument("--output",default="model_output")
    args=ap.parse_args()
    df=load_data(args.input,args.state,args.market)
    X,y=make_features(df)
    split=int(len(X)*0.8)
    if split<25 or len(X)-split<8: raise ValueError("Not enough engineered samples for a reliable holdout.")
    X_train,X_test=X.iloc[:split],X.iloc[split:]
    y_train,y_test=y.iloc[:split],y.iloc[split:]
    candidates={
      "ridge":Pipeline([("imputer",SimpleImputer(strategy="median")),("scale",StandardScaler()),("model",Ridge(alpha=10.0))]),
      "random_forest":Pipeline([("imputer",SimpleImputer(strategy="median")),("model",RandomForestRegressor(n_estimators=400,min_samples_leaf=3,max_features=0.8,random_state=42,n_jobs=-1))]),
      "hist_gradient_boosting":Pipeline([("imputer",SimpleImputer(strategy="median")),("model",HistGradientBoostingRegressor(max_iter=250,learning_rate=0.04,max_leaf_nodes=10,l2_regularization=2.0,random_state=42))])
    }
    results={}
    for name,model in candidates.items():
        model.fit(X_train,y_train)
        pred=model.predict(X_test)
        results[name]={"mae":float(mean_absolute_error(y_test,pred)),"rmse":float(np.sqrt(mean_squared_error(y_test,pred)))}
    # select lowest MAE; retain a naive last-observation benchmark
    best_name=min(results,key=lambda k:results[k]["mae"])
    best=candidates[best_name]
    naive=X_test["lag_1"].to_numpy()
    naive_mae=float(mean_absolute_error(y_test,naive))
    best_pred=best.predict(X_test)
    direction=float(np.mean(np.sign(best_pred-X_test["lag_1"].to_numpy())==np.sign(y_test.to_numpy()-X_test["lag_1"].to_numpy()))*100)
    # Train final model on all eligible samples
    best.fit(X,y)
    output=Path(args.output); output.mkdir(parents=True,exist_ok=True)
    joblib.dump(best,output/"soybean_model.joblib")
    report={"selected_model":best_name,"observations":int(len(df)),"engineered_samples":int(len(X)),
            "holdout_rows":int(len(X_test)),"holdout_mae":results[best_name]["mae"],
            "naive_last_value_mae":naive_mae,"holdout_rmse":results[best_name]["rmse"],
            "directional_accuracy_pct":direction,"candidate_metrics":results,
            "features":list(X.columns),"warning":"Experimental model. Validate across multiple mandi/season holdouts before operational use."}
    (output/"metrics.json").write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
if __name__=="__main__": main()
