// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* global read */

import {
  Random,
  rnd
} from "./random";
import {
  TOTALLY_RANDOM,
  totallyRandom
} from "./mess-grammar";
import { utils } from "@mozillasecurity/octo";

function inlineTest (filename) { /* eslint-disable-line require-jsdoc */
  // Inline a regression test, adding NODIFF (to disable differential testing) if it calls a testing function that might throw.

  const s = `/* ${filename} */ ${read(filename)}\n`;

  const noDiffTestingFunctions = [
    // These can throw
    "gcparam",
    "startgc",
    "setJitCompilerOption",
    "disableSingleStepProfiling",
    "enableSingleStepProfiling",
    // These return values depending on command-line options, and some regression tests check them
    "isAsmJSCompilationAvailable",
    "isSimdAvailable", // in 32-bit x86 builds, it depends on whether --no-fpu is passed in, because --no-fpu also disables SSE
    "hasChild",
    "PerfMeasurement"
  ];

  for (var f of noDiffTestingFunctions) {
    if (s.indexOf(f) !== -1) {
      return `/*NODIFF*/ ${s}`;
    }
  }

  return s;
}

function makeUseRegressionTest (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (typeof regressionTestList !== "object") {
    return "/* no regression tests found */";
  }

  var maintest = regressionTestsRoot + Random.index(regressionTestList); /* eslint-disable-line no-undef */
  var files = regressionTestDependencies(maintest);

  var s = "";

  if (rnd(5) === 0) {
    // Many tests call assertEq, intending to throw if something unexpected happens.
    // Sometimes, override it with a function that compares but does not throw.
    s += "assertEq = function(x, y) { if (x != y) { print(0); } }; ";
  }

  for (var i = 0; i < files.length; ++i) {
    var file = files[i];

    if (regressionTestIsEvil(read(file))) {
      continue;
    }

    let testType = "regression";

    switch (rnd(2)) {
      case 0:
      // simply inline the script -- this is the only one that will work in newGlobal()
        s += `/* ${testType}-test-inline */ ${inlineTest(file)}`;
        break;
      default:
      // run it using load()
        s += `/* ${testType}-test-load */ load(${utils.common.quote(file)});`;
        break;
      // NB: these scripts will also be run through eval(), evalcx(), evaluate(), evalInWorker()
      //     thanks to other parts of the fuzzer using makeScriptForEval or makeStatement
    }
  }
  return s;
}

function regressionTestDependencies (maintest) { /* eslint-disable-line require-jsdoc */
  var files = [];

  if (rnd(3)) {
    // Include the chain of 'shell.js' files in their containing directories (starting from regressionTestsRoot)
    for (var i = regressionTestsRoot.length; i < maintest.length; ++i) { /* eslint-disable-line no-undef */
      if (maintest.charAt(i) === "/" || maintest.charAt(i) === "\\") {
        var shelljs = `${maintest.substr(0, i + 1)}shell.js`;
        if (regressionTestList.indexOf(shelljs) !== -1) { /* eslint-disable-line no-undef */
          files.push(shelljs);
        }
      }
    }

    // Include prologue.js for jit-tests
    if (maintest.indexOf("jit-test") !== -1) {
      files.push(`${libdir}prologue.js`); /* eslint-disable-line no-undef */
    }

    // Include whitelisted shell.js for some tests, e.g. non262/test262 ones
    if (maintest.indexOf("non262") !== -1) {
      files.push(`${js_src_tests_dir}shell.js`); /* eslint-disable-line camelcase,no-undef */
      files.push(`${non262_tests_dir}shell.js`); /* eslint-disable-line camelcase,no-undef */
    }

    if (maintest.indexOf("test262") !== -1) {
      files.push(`${js_src_tests_dir}shell.js`); /* eslint-disable-line camelcase,no-undef */
      files.push(`${test262_tests_dir}shell.js`); /* eslint-disable-line camelcase,no-undef */
    }

    // Include web-platform-test-shims.js and testharness.js for streams tests
    if (maintest.indexOf("web-platform") !== -1) {
      files.push(`${js_src_tests_dir}web-platform-test-shims.js`); /* eslint-disable-line camelcase,no-undef */
      files.push(`${w_pltfrm_res_dir}testharness.js`); /* eslint-disable-line camelcase,no-undef */
    }
  }

  files.push(maintest);
  return files;
}

function regressionTestIsEvil (contents) { /* eslint-disable-line require-jsdoc */
  if (contents.indexOf("SIMD") !== -1) {
    // Disable SIMD testing until it's more stable (and we can get better stacks?)
    return true;
  }
  if (contents.indexOf("print = ") !== -1) {
    // A testcase that clobbers the |print| function would confuse js_interesting
    return true;
  }
  return false;
}

export { makeUseRegressionTest };
