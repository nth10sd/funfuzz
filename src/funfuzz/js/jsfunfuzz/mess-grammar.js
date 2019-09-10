// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* global print */

import {
  Random,
  rnd
} from "./random";
import { random } from "@mozillasecurity/octo";

// Randomly ignore the grammar 1 in TOTALLY_RANDOM times we generate any grammar node.
var TOTALLY_RANDOM = 1000;

function totallyRandom (d, b) { /* eslint-disable-line require-jsdoc */
  d = d + (rnd(5) - 2); // can increase!!
  for (var f in globalThis) { print(globalThis[f]); }

  var allMakers = [];
  for (var f in globalThis) {
    {
      allMakers.push(globalThis[f]);
    }
  }
  print("allMakers is: " + allMakers);
  var maker = random.random.item(allMakers);
  try{
  print("maker is: " + maker);
  var val = maker(d, b);
  if (typeof val !== "string") {
    print(maker.name);
    print(maker);
    throw new Error("We generated something that isn't a string!");
  }
  print("allMakers WORKED and is: " + allMakers);quit();
  return val;
}catch(e){print("allMakers is: " + allMakers);quit();}
}

function getListOfMakers (glob) { /* eslint-disable-line require-jsdoc */
  var r = [];
  for (var f in glob) {
    if (f.indexOf("make") === 0 && typeof glob[f] === "function" && f !== "makeFinalizeObserver" && f !== "makeFakePromise") {
      r.push(glob[f]);
    }
  }
  return r;
}

// To run testEachMaker(), replace `start(globalThis)` with `Random.init(0);` and `testEachMaker();`
/*
function testEachMaker()
{
  for (var f of allMakers) {
    dumpln("");
    dumpln(f.name);
    dumpln("==========");
    dumpln("");
    for (var i = 0; i < 100; ++i) {
      try {
        var r = f(8, ["A", "B"]);
        if (typeof r != "string")
          throw (`Got a ${typeof r}`);
        dumpln(r);
      } catch(e) {
        dumpln("");
        dumpln(uneval(e));
        dumpln(e.stack);
        dumpln("");
        throw "testEachMaker found a bug in jsfunfuzz";
      }
    }
    dumpln("");
  }
}
*/

export {
  TOTALLY_RANDOM,
  totallyRandom
};
