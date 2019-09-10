// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* global print, uneval */

import {
  ENGINE_SPIDERMONKEY_TRUNK,
  dumpln,
  engine,
  jsshell,
  printImportant
} from "./detect-engine";
import {
  Random,
  rnd
} from "./random";
import { count } from "./driver";
import { makeScript } from "./gen-grammar";
import { mathInitFCM } from "./test-math";
import { tryItOut } from "./run";

function start (glob) { /* eslint-disable-line require-jsdoc */
  var fuzzSeed = Math.floor(Math.random() * Math.pow(2, 28));
  dumpln(`fuzzSeed: ${fuzzSeed}`);
  Random.init(fuzzSeed);

  // Split this string across two source strings to ensure that if a
  // generated function manages to output the entire jsfunfuzz source,
  // that output won't match the grep command.
  var cookie = "/*F";
  cookie += `RC-fuzzSeed-${fuzzSeed}*/`;

  // Can be set to true if makeStatement has side effects, such as crashing, so you have to reduce "the hard way".
  var dumpEachSeed = false;

  try {
  if (dumpEachSeed) {
    dumpln(`${cookie}Random.init(0);`);
  }

  mathInitFCM();

  count = 0;
  } catch (e) {}

  if (jsshell) {
    try{
    // If another script specified a "maxRunTime" argument, use it; otherwise, run forever
    var MAX_TOTAL_TIME = (glob.maxRunTime) || (Infinity);
    } catch (e) {}
    var startTime = new Date();
    var lastTime;

    do {
      testOne();
      var elapsed1 = new Date() - lastTime;
      if (elapsed1 > 1000) {
        print(`That took ${elapsed1}ms!`);
      }
      lastTime = new Date();
    } while (lastTime - startTime < MAX_TOTAL_TIME);
  } else {
    setTimeout(testStuffForAWhile, 200); /* eslint-disable-line no-undef */
  }

  function testStuffForAWhile () { /* eslint-disable-line require-jsdoc */
    for (var j = 0; j < 100; ++j) { testOne(); }

    if (count % 10000 < 100) { printImportant(`Iterations: ${count}`); }

    setTimeout(testStuffForAWhile, 30); /* eslint-disable-line no-undef */
  }

  function testOne () { /* eslint-disable-line require-jsdoc */
    try{
    ++count;
    } catch(e) {}

    // Sometimes it makes sense to start with simpler functions:
    // var depth = ((count / 1000) | 0) & 16;
    var depth = 14;

    if (dumpEachSeed) {
      // More complicated, but results in a much shorter script, making SpiderMonkey happier.
      var MTA = uneval(Random.twister.export_mta());
      var MTI = Random.twister.export_mti();
      if (MTA !== Random.lastDumpedMTA) {
        dumpln(`${cookie}Random.twister.import_mta(${MTA});`);
        Random.lastDumpedMTA = MTA;
      }
      dumpln(`${cookie}Random.twister.import_mti(${MTI}); void (makeScript(${depth}));`);
    }

    var code = makeScript(depth);

    if (count === 1 && engine === ENGINE_SPIDERMONKEY_TRUNK && rnd(5)) {
      code = `tryRunning = useSpidermonkeyShellSandbox(${rnd(4)});`;
      // print("Sane mode!")
    }

    //  if (rnd(10) === 1) {
    //    var dp = "/*infloop-deParen*/" + Random.index(deParen(code));
    //    if (dp)
    //      code = dp;
    //  }
    dumpln(`${cookie}count=${count}; tryItOut(${uneval(code)});`);

    tryItOut(code);
  }
}

/* ********************************** *
 * To reproduce a crash or assertion: *
 * ********************************** */

// 1. grep tryIt LOGFILE | grep -v "function tryIt" | pbcopy
// 2. Paste the result between "ddbegin" and "ddend", replacing "start(this);"
// 3. Run Lithium to remove unnecessary lines between "ddbegin" and "ddend".
// SPLICE DDBEGIN
// first check if variable spans multiple files, e.g. testMathyFunction
// test BEFORE putting global.* then AFTER
let testVar = globalThis.maxRunTime;
print(`\nTESTING: globalThis.maxRunTime is a: ` + `${typeof testVar}` + "\n");
start(globalThis);
// SPLICE DDEND

if (jsshell) { print("It's looking good!"); } // Magic string that js_interesting looks for

// 3. Run it.
