// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import {
  Random,
  rnd
} from "./random";

/* *********************** *
 * GENERATE ASM.JS MODULES *
 * *********************** */

// Not yet tested:
// * loops (avoiding hangs with special forms, counters, and/or not executing)
// * break/continue with and without labels
// * function calls within the module (somehow avoiding recursion?)
// * function tables
// * multiple exports

function importForeign (foreignFunctions) { /* eslint-disable-line require-jsdoc */
  var s = "";
  for (let h of foreignFunctions) {
    s += `  var ${h} = foreign.${h};\n`;
  }
  return s;
}

function parameterTypeAnnotations (args) { /* eslint-disable-line require-jsdoc */
  var s = "";
  for (var a = 0; a < args.length; ++a) {
    var arg = args[a];
    if (arg.charAt(0) === "i") { s += `    ${arg} = ${arg}|0;\n`; } else { s += `    ${arg} = +${arg};\n`; }
  }
  return s;
}

function ensureView (e, t) { /* eslint-disable-line require-jsdoc */
  var varName = `${t}View`;
  if (!(varName in e.globalEnv.heapImported)) {
    e.globalEnv.heapImports += `  var ${varName} = new stdlib.${t}(heap);\n`;
    e.globalEnv.heapImported[varName] = true;
  }
  return varName;
}

function ensureMathImport (e, f) { /* eslint-disable-line require-jsdoc */
  return ensureImport(e, f, "Math.");
}

function ensureImport (e, f, prefix) { /* eslint-disable-line require-jsdoc */
  if (!(f in e.globalEnv.stdlibImported)) {
    e.globalEnv.stdlibImports += `  var ${f} = stdlib.${prefix || ""}${f};\n`;
    e.globalEnv.stdlibImported[f] = true;
  }
  return f;
}

function intVar (e) { /* eslint-disable-line require-jsdoc */
  var locals = e.locals;
  if (!locals.length) { return intLiteralRange(-0x8000000, 0xffffffff); }
  var local = Random.index(locals);
  if (local.charAt(0) === "i") { return local; }
  return intLiteralRange(-0x8000000, 0xffffffff);
}

function doubleVar (e) { /* eslint-disable-line require-jsdoc */
  var locals = e.locals;
  if (!locals.length) { return doubleLiteral(); }
  var local = Random.index(locals);
  if (local.charAt(0) === "d") { return local; }
  return doubleLiteral();
}

function doubleLiteral () { /* eslint-disable-line require-jsdoc */
  return Random.index(["-", ""]) + positiveDoubleLiteral();
}

function positiveDoubleLiteral () { /* eslint-disable-line require-jsdoc */
  if (rnd(3) === 0) {
    Random.index(["0.0", "1.0", "1.2345e60"]);
  }

  // A power of two
  var value = Math.pow(2, rnd(100) - 10);

  // One more or one less
  if (rnd(3)) {
    value += 1;
  } else if (value > 1 && rnd(2)) {
    value -= 1;
  }

  var str = `${value}`;
  if (str.indexOf(".") === -1) {
    return `${str}.0`;
  }
  // Numbers with decimal parts, or numbers serialized with exponential notation
  return str;
}

function fuzzyRange (min, max) { /* eslint-disable-line require-jsdoc */
  if (rnd(10000) === 0) { return min - 1; }
  if (rnd(10000) === 0) { return max + 1; }
  if (rnd(10) === 0) { return min; }
  if (rnd(10) === 0) { return max; }

  // rnd() is limited to 2^32. (It also skews toward lower numbers, oh well.)
  if (max > min + 0x100000000 && rnd(3) === 0) { return min + 0x100000000 + rnd(max - (min + 0x100000000) + 1); }
  return min + rnd(max - min + 1);
}

function intLiteralRange (min, max) { /* eslint-disable-line require-jsdoc */
  var val = fuzzyRange(min, max);
  var sign = val < 0 ? "-" : "";
  return `${sign}0x${Math.abs(val).toString(16)}`;
}

export {
  doubleLiteral,
  doubleVar,
  ensureImport,
  ensureMathImport,
  ensureView,
  importForeign,
  intLiteralRange,
  intVar,
  parameterTypeAnnotations
};
