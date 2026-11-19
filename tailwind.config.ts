import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {
    colors: { ink: "#14251f", forest: "#176b4b", mint: "#e8f4ed", canvas: "#f5f7f5" },
    boxShadow: { soft: "0 10px 30px rgba(20,37,31,.06)" }
  }},
  plugins: []
};
export default config;
