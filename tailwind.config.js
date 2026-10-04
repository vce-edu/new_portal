import { BRAND } from "./src/constants/Brand.js";

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: BRAND.colors,
    },
  },
};