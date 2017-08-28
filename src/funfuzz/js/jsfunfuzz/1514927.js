//DDBEGIN
// Adapted from randomly chosen test: js/src/jit-test/tests/gc/bug-1464872.js
var x = newGlobal(); x.evaluate("grayRoot()"); x = 0; gcparam("markStackLimit", 4);
gc();
//DDEND
