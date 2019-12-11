// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { dumpln } from "./detect-engine.js";
import { foundABug } from "./error-reporting.js";
import { verbose } from "./driver.js";

function testExpressionDecompiler (code) { /* eslint-disable-line require-jsdoc */
  var fullCode = `(function() { try { \n${code}\n; throw 1; } catch(exx) { this.nnn.nnn } })()`;

  try {
    eval(fullCode); /* eslint-disable-line no-eval */
  } catch (e) {
    if (e.message !== "this.nnn is undefined" && e.message.indexOf("redeclaration of") === -1) {
      // Break up the following string intentionally, to prevent matching when contents of jsfunfuzz is printed.
      foundABug("Wrong error " + "message", e);
    }
  }
}

function tryHalves (code) { /* eslint-disable-line require-jsdoc */
  // See if there are any especially horrible bugs that appear when the parser has to start/stop in the middle of something. this is kinda evil.

  // Stray "}"s are likely in secondHalf, so use new Function rather than eval.  "}" can't escape from new Function :)

  var f;
  var firstHalf;
  var secondHalf;

  try {
    firstHalf = code.substr(0, code.length / 2);
    if (verbose) { dumpln(`First half: ${firstHalf}`); }
    f = new Function(firstHalf); /* eslint-disable-line no-new-func */
    void (`${f}`);
  } catch (e) {
    if (verbose) { dumpln(`First half compilation error: ${e}`); }
  }

  try {
    secondHalf = code.substr(code.length / 2, code.length);
    if (verbose) { dumpln(`Second half: ${secondHalf}`); }
    f = new Function(secondHalf); /* eslint-disable-line no-new-func */
    void (`${f}`);
  } catch (e) {
    if (verbose) { dumpln(`Second half compilation error: ${e}`); }
  }
}

export {
  testExpressionDecompiler,
  tryHalves
};
