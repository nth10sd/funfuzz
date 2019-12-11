// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* global print, uneval */

import {
  NUM_MATH_FUNCTIONS,
  makeMathFunction,
  numericVals
} from "./gen-math";
import {
  Random,
  rnd
} from "./random";
import {
  TOTALLY_RANDOM,
  totallyRandom
} from "./mess-grammar";
import {
  makeAsmJSFunction,
  makeMixedTypeArray
} from "./gen-grammar";
import { errorToString } from "./error-reporting";

var confusableVals = [
  "0",
  "0.1",
  "-0",
  "''",
  "'0'",
  "'\\0'",
  "[]",
  "[0]",
  "/0/",
  "'/0/'",
  "1",
  "({toString:function(){return '0';}})",
  "({valueOf:function(){return 0;}})",
  "({valueOf:function(){return '0';}})",
  "false",
  "true",
  "undefined",
  "null",
  "(function(){return 0;})",
  "NaN",
  "(new Boolean(false))",
  "(new Boolean(true))",
  "(new String(''))",
  "(new Number(0))",
  "(new Number(-0))",
  "createIsHTMLDDA()"
];

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

function makeMathyFunAndTest (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var i = rnd(NUM_MATH_FUNCTIONS);
  var s = "";

  if (rnd(5)) {
    if (rnd(8)) {
      s += `mathy${i} = ${makeMathFunction(6, b, i)}; `;
    } else {
      s += `mathy${i} = ${makeAsmJSFunction(6, b)}; `;
    }
  }

  if (rnd(5)) {
    var inputsStr;
    switch (rnd(8)) {
      /* eslint-disable no-multi-spaces */
      case 0:  inputsStr = makeMixedTypeArray(d - 1, b); break;
      case 1:  inputsStr = `[${Random.subset(confusableVals).join(", ")}]`; break;
      default: inputsStr = `[${Random.subset(numericVals).join(", ")}]`; break;
      /* eslint-enable no-multi-spaces */
    }

    s += `testMathyFunction(mathy${i}, ${inputsStr}); `;
  }

  return s;
}

function makeMathyFunRef (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  return `mathy${rnd(NUM_MATH_FUNCTIONS)}`;
}

export {
  makeMathyFunAndTest,
  makeMathyFunRef,
  mathInitFCM
};
