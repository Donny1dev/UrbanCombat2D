import globals from 'globals';
export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'module',
      globals: { ...globals.browser, __VERSION__: 'readonly', __BUILD__: 'readonly' },
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }], 'no-dupe-keys': 'error', 'no-redeclare': 'error', 'no-unreachable': 'error' },
  },
];
