// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { rnd } from "./random.js";

function infrequentCondition (v, n) { /* eslint-disable-line require-jsdoc */
  switch (rnd(20)) {
    case 0: return true;
    case 1: return false;
    case 2: return `${v} > ${rnd(n)}`;
    default: var mod = rnd(n) + 2; var target = rnd(mod); return `/*ICCD*/${v} % ${mod}${rnd(8) ? " == " : " != "}${target}`;
  }
}

var arrayBufferType = (typeof SharedArrayBuffer !== "undefined") ?
  function () { return rnd(2) ? "SharedArrayBuffer" : "ArrayBuffer"; } :
  function () { return "ArrayBuffer"; };

export {
  arrayBufferType,
  infrequentCondition
};
