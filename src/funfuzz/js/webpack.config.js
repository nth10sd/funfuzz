var path = require("path"); /* eslint-disable-line import/no-commonjs,import/no-nodejs-modules,import/unambiguous */

module.exports = { /* eslint-disable-line import/no-commonjs */
  mode: "development",
  entry: [
    "./jsfunfuzz/tail.js"
  ],
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "jsfunfuzz.js"
    // library: ["start"],
    // libraryTarget: "var"
  }
}; /* eslint-disable-line import/no-commonjs */
