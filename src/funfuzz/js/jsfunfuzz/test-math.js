// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* global print, uneval */

import {
  TOTALLY_RANDOM,
  totallyRandom
} from "./mess-grammar.js";
import { NUM_MATH_FUNCTIONS } from "./misc-grammar.js";
import { errorToString } from "./error-reporting.js";
import { rnd } from "./random.js";

function hashStr (s) { /* eslint-disable-line require-jsdoc */
  var hash = 0;
  var L = s.length;
  for (var i = 0; i < L; i++) {
    var c = s.charCodeAt(i);
    hash = (Math.imul(hash, 31) + c) | 0;
  }
  return hash;
}

function testMathyFunction (f, inputs) { /* eslint-disable-line require-jsdoc */
  var results = [];
  if (f) {
    for (var j = 0; j < inputs.length; ++j) {
      for (var k = 0; k < inputs.length; ++k) {
        try {
          results.push(f(inputs[j], inputs[k]));
        } catch (e) {
          results.push(errorToString(e));
        }
      }
    }
  }
  /* Use uneval to distinguish -0, 0, "0", etc. */
  /* Use hashStr to shorten the output and keep compare_jit files small. */
  print(hashStr(uneval(results)));
}

function mathInitFCM () { /* eslint-disable-line require-jsdoc */
  // FCM cookie, lines with this cookie are used for compare_jit
  var cookie = "/*F" + "CM*/";

  // Replace carriage returns (Windows) with line breaks, if present
  print(cookie + hashStr.toString().replace(/\r/g, "\n").replace(/\n/g, " "));
  print(cookie + testMathyFunction.toString().replace(/\r/g, "\n").replace(/\n/g, " "));
}

function makeMathyFunRef (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  return `mathy${rnd(NUM_MATH_FUNCTIONS)}`;
}

export {
  makeMathyFunRef,
  mathInitFCM
};
