// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

global.count = 0;
var verbose = false;

function failsToCompileInTry (code) { /* eslint-disable-line require-jsdoc */
  // Why would this happen? One way is "let x, x"
  try {
    var codeInTry = `try { ${code} } catch(e) { }`;
    void new Function(codeInTry); /* eslint-disable-line no-new-func */
    return false;
  } catch (e) {
    return true;
  }
}

export {
  failsToCompileInTry,
  verbose
};
