// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* exported readline */
/* global gc, print, readline:writable, uneval:writable */

import { rnd } from "./random";
import { utils } from "@mozillasecurity/octo";

// jsfunfuzz is best run in a command-line shell.  It can also run in
// a web browser, but you might have trouble reproducing bugs that way.

var ENGINE_UNKNOWN = 0;
var ENGINE_SPIDERMONKEY_TRUNK = 1;
var ENGINE_JAVASCRIPTCORE = 4;

var engine = ENGINE_UNKNOWN;
var jsshell = (typeof window === "undefined");
var xpcshell = jsshell && (typeof Components === "object");
var dumpln;
var printImportant;

dumpln = print;
printImportant = function (s) { dumpln("***"); dumpln(s); };
if (typeof verifyprebarriers === "function") {
  // Run a diff between the help() outputs of different js shells.
  // Make sure the function to look out for is not located only in some
  // particular #ifdef, e.g. JS_GC_ZEAL, or controlled by --fuzzing-safe.
  if (typeof wasmIsSupported === "function") {
    engine = ENGINE_SPIDERMONKEY_TRUNK;
  }

  // Avoid accidentally waiting for user input that will never come.
  readline = function () {};
} else if (typeof XPCNativeWrapper === "function") {
  // e.g. xpcshell or firefox
  engine = ENGINE_SPIDERMONKEY_TRUNK;
} else if (typeof debug === "function") {
  engine = ENGINE_JAVASCRIPTCORE;
}

// If WebAssembly object doesn't exist, make it an empty function, else runtime flags like --wasm-compiler=ion throw
if (typeof WebAssembly === "undefined") { this.WebAssembly = function () {}; }

if (typeof gc === "undefined") { this.gc = function () {}; }
var gcIsQuiet = !(gc()); // see bug 706433

// If the JavaScript engine being tested has heuristics like
//   "recompile any loop that is run more than X times"
// this should be set to the highest such X.
var HOTLOOP = 60;
function loopCount () { return rnd(rnd(HOTLOOP * 3)); } /* eslint-disable-line require-jsdoc */
function loopModulo () { return (rnd(2) ? rnd(rnd(HOTLOOP * 2)) : rnd(5)) + 2; } /* eslint-disable-line require-jsdoc */

var haveRealUneval = (typeof uneval === "function");
if (!haveRealUneval) { uneval = utils.common.quote; }

if (engine === ENGINE_UNKNOWN) { printImportant("Targeting an unknown JavaScript engine!"); } else if (engine === ENGINE_SPIDERMONKEY_TRUNK) { printImportant("Targeting SpiderMonkey / Gecko (trunk)."); } else if (engine === ENGINE_JAVASCRIPTCORE) { printImportant("Targeting JavaScriptCore / WebKit."); }

export {
  ENGINE_JAVASCRIPTCORE,
  ENGINE_SPIDERMONKEY_TRUNK,
  dumpln,
  engine,
  gcIsQuiet,
  jsshell,
  loopCount,
  loopModulo,
  printImportant,
  xpcshell
};
