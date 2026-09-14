module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true
  },
  extends: 'standard',
  overrides: [
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    "no-multi-spaces": "off",
    "new-cap": "off",
    "indent": ["error", 4, { "SwitchCase": 1 }],
    "semi": ["error", "always"],
    "no-var": "off"
  }
}
