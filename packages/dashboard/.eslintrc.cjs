module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "../../.eslintrc.cjs",
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  plugins: ["svelte3", "@typescript-eslint"],
  overrides: [{ files: ["*.svelte"], processor: "svelte3/svelte3" }],
  settings: {
    "svelte3/typescript": () => require("typescript")
  }
};
