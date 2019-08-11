// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import {
  Random,
  rnd
} from "./random";
import {
  TOTALLY_RANDOM,
  totallyRandom
} from "./mess-grammar";
import { cat } from "./mess-tokens";

var binaryOps = [
  // Long-standing JavaScript operators, roughly in order from http://www.codehouse.com/javascript/precedence/
  " * ", " / ", " % ", " + ", " - ", " << ", " >> ", " >>> ", " < ", " > ", " <= ", " >= ", " instanceof ",
  " in ", " == ", " != ", " === ", " !== ", " & ", " | ", " ^ ", " && ", " || ", " = ", " *= ", " /= ",
  " %= ", " += ", " -= ", " <<= ", " >>= ", " >>>= ", " &= ", " ^= ", " |= ", " , ", " ** ", " **= "
];
var exceptionProperties = ["constructor", "message", "name", "fileName", "lineNumber", "stack"];
var incDecOps = [
  "++", "--"
];
var leftUnaryOps = [
  "!", "+", "-", "~",
  "void ", "typeof ", "delete ",
  "new ", // but note that "new" can also be a very strange left-binary operator
  "yield ", // see http://www.python.org/dev/peps/pep-0342/ .  Often needs to be parenthesized, so there's also a special exprMaker for it.
  "await "
];
var specialProperties = [
  "__proto__", "constructor", "prototype",
  "wrappedJSObject",
  "arguments", "caller", "callee",
  "toString", "valueOf",
  "call", "apply", // ({apply:...}).apply() hits a special case (speculation failure with funapply / funcall bytecode)
  "length",
  "0", "1",
  "Symbol.species"
];
var typedArrayConstructors = [
  "Int8Array",
  "Uint8Array",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "Uint8ClampedArray"
];
var varBinder = ["var ", "let ", "const ", ""];
var varBinderFor = ["var ", "let ", ""]; // const is a syntax error in for loops

function directivePrologue () { /* eslint-disable-line require-jsdoc */
  var s = "";
  if (rnd(3) === 0) { s += '"use strict"; '; }
  if (rnd(30) === 0) { s += '"use asm"; '; }
  return s;
}

function functionPrefix () { /* eslint-disable-line require-jsdoc */
  return (rnd(2) === 0 ? "" : "async ")
    + "function"
    + (rnd(2) === 0 ? "" : "*");
}

function linkedList (x, n) { /* eslint-disable-line require-jsdoc */
  for (var i = 0; i < n; ++i) { x = { a: x }; }
  return x;
}

function makeFunOnCallChain (d, b) { /* eslint-disable-line require-jsdoc */
  var s = "arguments.callee";
  while (rnd(2)) { s += ".caller"; }
  return s;
}

function makeNewId (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  return Random.index(["a", "b", "c", "d", "e", "w", "x", "y", "z"]);
}

function maybeLabel () { /* eslint-disable-line require-jsdoc */
  if (rnd(4) === 1) { return cat([Random.index(["L", "M"]), ":"]); } else { return ""; }
}

function maybeNeg () { return rnd(5) ? "" : "-"; } /* eslint-disable-line require-jsdoc */

function randomUnitStringLiteral () { /* eslint-disable-line require-jsdoc */
  var s = "\"\\u";
  for (var i = 0; i < 4; ++i) {
    s += "0123456789ABCDEF".charAt(rnd(16));
  }
  s += "\"";
  return s;
}

function strTimes (s, n) { /* eslint-disable-line require-jsdoc */
  if (n === 0) return "";
  if (n === 1) return s;
  var s2 = s + s;
  var r = n % 2;
  var d = (n - r) / 2;
  var m = strTimes(s2, d);
  return r ? m + s : m;
}

function uniqueVarName () { /* eslint-disable-line require-jsdoc */
  // Make a random variable name.
  var s = "";
  for (var i = 0; i < 6; ++i) { s += String.fromCharCode(97 + rnd(26)); } // a lowercase english letter
  return s;
}

export {
  binaryOps,
  directivePrologue,
  exceptionProperties,
  functionPrefix,
  incDecOps,
  leftUnaryOps,
  linkedList,
  makeFunOnCallChain,
  makeNewId,
  maybeLabel,
  maybeNeg,
  randomUnitStringLiteral,
  specialProperties,
  strTimes,
  typedArrayConstructors,
  uniqueVarName,
  varBinder,
  varBinderFor
};
