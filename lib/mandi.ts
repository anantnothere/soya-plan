import Papa from "papaparse";
import type { PricePoint } from "./forecast";

export type Row = PricePoint & {
  state: string; district: string; market: string; commodity: string; variety: string; grade: string;
};

// Agmarknet / data.gov.in exports encode spaces in headers as "_x0020_"
// (e.g. "Modal_x0020_Price"), so they are decoded before matching.
export const norm = (s: string) =>
  String(s ?? "")
    .replace(/^﻿/, "")
    .replace(/_x0020_/gi, " ")
    .toLowerCase()
    .trim()
    .replace(/[\s\-\/]+/g, "_")
    .replace(/[^\w]/g, "");

const pick = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k];
  return "";
};

// An empty / missing cell is "no value", never 0.
const number = (s: string): number | undefined => {
  const t = String(s ?? "").replace(/[₹,\s]/g, "");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

export function toIsoDate(raw: string): string {
  const d = String(raw ?? "").trim();
  let m = d.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); // DD/MM/YYYY (Agmarknet)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = d.match(/^(\d{1,2})[\/\- ]([A-Za-z]{3})[A-Za-z]*[\/\- ,]+(\d{4})$/); // 19-Nov-2026
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  m = d.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return d;
}

function toRows(data: Record<string, string>[]): Row[] {
  return data
    .map((x) => ({
      state: pick(x, "state").trim(),
      district: pick(x, "district").trim(),
      market: pick(x, "market", "mandi").trim(),
      commodity: pick(x, "commodity").trim(),
      variety: pick(x, "variety").trim(),
      grade: pick(x, "grade").trim(),
      date: toIsoDate(pick(x, "arrival_date", "date", "reported_date")),
      min: number(pick(x, "min_price", "minimum_price", "min")) ?? NaN,
      max: number(pick(x, "max_price", "maximum_price", "max")) ?? NaN,
      modal: number(pick(x, "modal_price", "modal", "price")) ?? NaN,
      arrivals: number(pick(x, "arrivals", "arrival", "arrival_qty", "arrivals_tonnes", "quantity")),
      rainfall: number(pick(x, "rainfall_mm", "rainfall")),
      temperature: number(pick(x, "temperature_c", "temperature", "temp_c")),
      usdInr: number(pick(x, "usd_inr", "usd_inr_rate", "inr_usd")),
      globalSoy: number(pick(x, "global_soybean", "global_soy_price", "cbot_soybean")),
      soyMeal: number(pick(x, "soybean_meal_price", "soymeal_price", "soy_meal")),
      soyOil: number(pick(x, "soybean_oil_price", "soyoil_price", "soy_oil")),
      msp: number(pick(x, "msp", "soybean_msp")),
    }))
    .filter(
      (x) =>
        x.state && x.market && /soy/i.test(x.commodity) && /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
        [x.min, x.max, x.modal].every((n) => Number.isFinite(n) && n > 0)
    );
}

const EMPTY_MSG =
  "No valid soybean records found. Check that the CSV has State, Market, Commodity (Soyabean), Arrival_Date and Min/Max/Modal price columns with non-zero prices.";

/** Parse an Agmarknet-style (or MandiLens template) CSV, from a File upload or a raw CSV string. */
export function parseCsv(input: File | string): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(input as never, {
      header: true,
      skipEmptyLines: true,
      transformHeader: norm,
      complete: (r: Papa.ParseResult<Record<string, string>>) => {
        const rows = toRows(r.data);
        rows.length ? resolve(rows) : reject(new Error(EMPTY_MSG));
      },
      error: (e: Error) => reject(e),
    });
  });
}

/** Key that identifies one distinct observation (grade included, so FAQ / Non-FAQ rows don't overwrite each other). */
export const rowKey = (r: Row) => [r.state, r.district, r.market, r.commodity, r.variety, r.grade, r.date].join("|");

/**
 * One representative row per mandi per day. A mandi can report several
 * variety/grade rows for the same date; FAQ (the standard trade grade) is preferred.
 */
export function collapseDaily(rows: Row[]): Row[] {
  const rank = (r: Row) => (/^faq$/i.test(r.grade) ? 0 : 1);
  const m = new Map<string, Row>();
  for (const r of rows) {
    const k = [r.state, r.market, r.date].join("|");
    const cur = m.get(k);
    if (!cur || rank(r) < rank(cur)) m.set(k, r);
  }
  return [...m.values()];
}
