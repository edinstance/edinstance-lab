import tanstackQuery from "@tanstack/eslint-plugin-query";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

import { tanstackConfig } from "@tanstack/eslint-config";

export default [
  {
    ignores: ["**/*.{js,mjs,cjs}", ".output/**", "dist/**"],
  },
  ...tanstackConfig,
  ...tseslint.config({
    files: ["**/*.{ts,tsx}"],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
  }),
  ...tanstackQuery.configs["flat/recommended"],
  prettier,
];
