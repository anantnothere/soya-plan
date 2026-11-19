export type PricePoint = {
  date: string; modal: number; min: number; max: number;
  arrivals?: number; rainfall?: number; temperature?: number;
  usdInr?: number; globalSoy?: number; soyMeal?: number; soyOil?: number; msp?: number;
};
export type ForecastPoint = { step:number; predicted:number; lower:number; upper:number };
export type ForecastResult = {
  forecast: ForecastPoint[]; mae:number; baselineMae:number; directionAccuracy:number;
  observations:number; modelName:string; warning?:string;
};

const optional = (v?:number) => Number.isFinite(v as number) ? (v as number) : 0;
function features(history: PricePoint[], i: number): number[] {
  const p = history.map(x=>x.modal);
  const last = p[i-1];
  const lag2 = p[i-2], lag3 = p[i-3], lag7 = p[i-7];
  const window7 = p.slice(Math.max(0,i-7),i);
  const window14 = p.slice(Math.max(0,i-14),i);
  const mean = (a:number[]) => a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);
  const sd = (a:number[]) => Math.sqrt(mean(a.map(v=>(v-mean(a))**2)));
  const prior = history[i-1];
  return [
    last, lag2, lag3, lag7, mean(window7), mean(window14), sd(window7),
    last - (lag7 ?? last), optional(prior.arrivals), optional(prior.rainfall),
    optional(prior.temperature), optional(prior.usdInr), optional(prior.globalSoy),
    optional(prior.soyMeal), optional(prior.soyOil), optional(prior.msp)
  ];
}
function solve(a:number[][], b:number[]):number[] {
  const n=b.length, m=a.map((r,i)=>[...r,b[i]]);
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let r=col+1;r<n;r++) if(Math.abs(m[r][col])>Math.abs(m[pivot][col])) pivot=r;
    if(Math.abs(m[pivot][col])<1e-10) throw new Error("Training matrix is singular");
    [m[col],m[pivot]]=[m[pivot],m[col]];
    const div=m[col][col]; for(let j=col;j<=n;j++) m[col][j]/=div;
    for(let r=0;r<n;r++) if(r!==col){const f=m[r][col];for(let j=col;j<=n;j++)m[r][j]-=f*m[col][j];}
  }
  return m.map(r=>r[n]);
}
function fit(x:number[][], y:number[], lambda=2) {
  const n=x.length, d=x[0].length;
  const means=Array(d).fill(0), scales=Array(d).fill(1);
  for(let j=0;j<d;j++){means[j]=x.reduce((s,r)=>s+r[j],0)/n;const variance=x.reduce((s,r)=>s+(r[j]-means[j])**2,0)/n;scales[j]=Math.sqrt(variance)||1;}
  const z=x.map(r=>[1,...r.map((v,j)=>(v-means[j])/scales[j])]);
  const a=Array.from({length:d+1},()=>Array(d+1).fill(0)), b=Array(d+1).fill(0);
  for(let i=0;i<n;i++) for(let j=0;j<=d;j++){b[j]+=z[i][j]*y[i];for(let k=0;k<=d;k++)a[j][k]+=z[i][j]*z[i][k];}
  for(let j=1;j<=d;j++) a[j][j]+=lambda;
  const coef=solve(a,b);
  return (row:number[])=>{const zz=[1,...row.map((v,j)=>(v-means[j])/scales[j])];return zz.reduce((s,v,j)=>s+v*coef[j],0);};
}
export function forecastSeries(input:PricePoint[], horizon=7):ForecastResult {
  const h=[...input].filter(x=>Number.isFinite(x.modal)&&x.modal>0).sort((a,b)=>a.date.localeCompare(b.date));
  if(h.length<40) return {forecast:[],mae:0,baselineMae:0,directionAccuracy:0,observations:h.length,modelName:"Ridge regression",warning:"At least 40 dated observations are required for a minimally useful time-series model. More history is strongly preferred."};
  const samples:{x:number[];y:number;prev:number;date:string}[]=[];
  for(let i=14;i<h.length;i++) samples.push({x:features(h,i),y:h[i].modal,prev:h[i-1].modal,date:h[i].date});
  const split=Math.max(20,Math.floor(samples.length*.8));
  const train=samples.slice(0,split), test=samples.slice(split);
  const model=fit(train.map(s=>s.x),train.map(s=>s.y),4);
  const errors=test.map(s=>Math.abs(model(s.x)-s.y));
  const baselineErrors=test.map(s=>Math.abs(s.prev-s.y));
  const mae=errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:0;
  const baselineMae=baselineErrors.length?baselineErrors.reduce((a,b)=>a+b,0)/baselineErrors.length:0;
  const directionAccuracy=test.length?test.filter(s=>Math.sign(model(s.x)-s.prev)===Math.sign(s.y-s.prev)).length/test.length*100:0;
  const allModel=fit(samples.map(s=>s.x),samples.map(s=>s.y),4);
  const abs=test.map(s=>Math.abs(allModel(s.x)-s.y)).sort((a,b)=>a-b);
  const band=abs.length?abs[Math.min(abs.length-1,Math.floor(abs.length*.8))]:mae;
  const rolling=[...h];
  const forecast:ForecastPoint[]=[];
  for(let step=1;step<=horizon;step++){
    const x=features(rolling,rolling.length);
    const pred=Math.max(0,allModel(x));
    forecast.push({step,predicted:pred,lower:Math.max(0,pred-band),upper:pred+band});
    const last=rolling[rolling.length-1];
    rolling.push({...last,date:`forecast-${step}`,modal:pred,min:pred,max:pred});
  }
  return {forecast,mae,baselineMae,directionAccuracy,observations:h.length,modelName:"Ridge regression · lag + rolling + exogenous features",
    warning:mae>baselineMae?"The model underperformed a last-observation baseline in this holdout. Treat its forecast as experimental and improve the dataset before operational use.":undefined};
}
