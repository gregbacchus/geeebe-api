module.exports = {
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node'
  ],
  moduleNameMapper: {
    "^jose/(.*)$": "<rootDir>/node_modules/jose/dist/node/cjs/$1",
  },
  testRegex: '/(test|src)/.*\\.(test)\\.(tsx?)$',
  testURL: 'http://localhost',
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
};
