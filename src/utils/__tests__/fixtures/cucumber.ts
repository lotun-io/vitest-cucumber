export default {};

export const ci = {
  tags: "@ci",
  retry: 3,
  import: ["features/import.ts"],
  require: ["features/require.ts"],
};
