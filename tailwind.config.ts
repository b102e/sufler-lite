import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cb: {
          bg:             "#0A0A0A",
          card:           "#121212",
          elevated:       "#1A1A1A",
          "dark-gray":    "#1F1F1F",
          text:           "#F5F5F5",
          muted:          "#A0A0A0",
          emerald:        "#00D4A5",
          "emerald-hover":"#00E6B3",
          "emerald-light":"#A0F0D0",
          orange:         "#FF9F1C",
          red:            "#FF4D4D",
        },
      },
    },
  },
  plugins: [],
};

export default config;
