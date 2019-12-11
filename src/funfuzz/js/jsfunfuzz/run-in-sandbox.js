// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* global evalcx, newGlobal */

import { dumpln } from "./detect-engine.js";
import { errorToString } from "./error-reporting.js";

/* ***************** *
 * SANDBOXED RUNNING *
 * ***************** */

// We support three ways to run generated code:
// * useGeckoSandbox(), which uses Components.utils.Sandbox. (Moved to run.js)
//    * In xpcshell, we always use this method, so we don't accidentally erase the hard drive.
//
// * useSpidermonkeyShellSandbox(), which uses evalcx() with newGlobal().
//   * In spidermonkey shell, we often use this method, so we can do additional correctness tests.
//
// * tryRunningDirectly(), which uses eval() or new Function().
//   * This creates the most "interesting" testcases.

function fillShellSandbox (sandbox) { /* eslint-disable-line require-jsdoc */
  var safeFuns = [
    "print",
    "schedulegc", "schedulezone", "selectforgc", "gczeal", "gc", "gcslice",
    "verifyprebarriers", "gcPreserveCode",
    "minorgc", "abortgc",
    "evalcx", "newGlobal", "evaluate", "evalInWorker",
    "dumpln", "fillShellSandbox",
    "testMathyFunction", "hashStr",
    "oomAfterAllocations", "oomAtAllocation", "resetOOMFailure",
    "relazifyFunctions",
    "disableSingleStepProfiling", "enableSingleStepProfiling",
    "bailout", "bailAfter",
    "getLcovInfo",
    "deterministicgc",
    "readGeckoProfilingStack",
    "enableGeckoProfiling", "enableGeckoProfilingWithSlowAssertions", "disableGeckoProfiling",
    "baselineCompile",
    "assertJitStackInvariants", "setJitCompilerOption",
    "enableOsiPointRegisterChecks", "setIonCheckGraphCoherency",
    "fullcompartmentchecks",
    "startgc", "setGCCallback",
    "allocationMarker", "makeFinalizeObserver",
    "recomputeWrappers",
    "enableShapeConsistencyChecks",
    "grayRoot",
    "addMarkObservers", "clearMarkObservers", "getMarks",
    "createIsHTMLDDA",
    "gcparam",
    "nukeAllCCWs", "FakeDOMObject",
    "isAsmJSCompilationAvailable",
    "markObjectPropertiesUnknown"
  ];

  for (var i = 0; i < safeFuns.length; ++i) {
    var fn = safeFuns[i];
    if (sandbox[fn]) {
      // print(`Target already has ${fn}`);
    } else if (this[fn]) { // FIXME: strict mode compliance requires passing glob around
      sandbox[fn] = this[fn].bind(this);
    } else {
      // print(`Source is missing ${fn}`);
    }
  }

  return sandbox;
}

export function useSpidermonkeyShellSandbox (sandboxType) { /* eslint-disable-line require-jsdoc */
  var primarySandbox;

  switch (sandboxType) {
    /* eslint-disable no-multi-spaces */
    case 0:  primarySandbox = evalcx(""); break;
    case 1:  primarySandbox = evalcx("lazy"); break;
    case 2:  primarySandbox = newGlobal({ sameCompartmentAs: {} }); break;
    case 3:  primarySandbox = newGlobal({ sameZoneAs: {} }); break; // same zone
    default: primarySandbox = newGlobal(); // new zone
    /* eslint-enable no-multi-spaces */
  }

  fillShellSandbox(primarySandbox);

  return function (f, code, wtt) {
    try {
      evalcx(code, primarySandbox);
    } catch (e) {
      dumpln(`Running in sandbox threw ${errorToString(e)}`);
    }
  };
}
