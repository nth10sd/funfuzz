/* global __dirname, module, require */

var path = require("path"); /* eslint-disable-line import/no-commonjs,import/no-nodejs-modules,import/unambiguous */

module.exports = { /* eslint-disable-line import/no-commonjs */
  mode: "development",
  entry: [
    "./jsfunfuzz/run-in-sandbox.js",
    "./jsfunfuzz/tail.js"
  ],
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "jsfunfuzz.js",
    library: ["start"],
    // libraryTarget: "var"
  },
  target: "node",
  devtool: "source-map"
}; /* eslint-disable-line import/no-commonjs */
