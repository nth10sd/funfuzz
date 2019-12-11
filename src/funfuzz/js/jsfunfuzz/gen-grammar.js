// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* global read, uneval */

import {
  ENGINE_JAVASCRIPTCORE,
  engine,
  jsshell,
  loopCount,
  loopModulo,
  simpleSource,
  xpcshell
} from "./detect-engine";
import {
  NUM_MATH_FUNCTIONS,
  binaryOps,
  confusableVals,
  exceptionProperties,
  incDecOps,
  leftUnaryOps,
  proxyHandlerProperties,
  randomUnitStringLiteral,
  specialProperties,
  typedArrayConstructors,
  varBinder,
  varBinderFor
} from "./misc-grammar";
import {
  POTENTIAL_MATCHES,
  randomRegexFlags,
  regexPattern,
  toRegexSource
} from "./gen-regex";
import {
  Random,
  rnd
} from "./random";
import {
  TOTALLY_RANDOM,
  totallyRandom
} from "./mess-grammar";
import {
  allMethodNames,
  allPropertyNames,
  builtinFunctions,
  builtinObjectNames,
  builtinProperties,
  constructors
} from "./built-in-constructors";
import {
  arrayBufferType,
  makeBuilderStatement,
  makeEvilCallback
} from "./gen-type-aware-code";
import {
  binaryMathFunctions,
  binaryMathOps,
  leftUnaryMathOps,
  numericVals,
  unaryMathFunctions
} from "./gen-math";
import {
  cat,
  stripSemicolon
} from "./mess-tokens";
import {
  doubleLiteral,
  doubleVar,
  ensureImport,
  ensureMathImport,
  ensureView,
  importForeign,
  intLiteralRange,
  intVar,
  parameterTypeAnnotations
} from "./gen-asm";
import { fuzzTestingFunctionsCtor } from "./testing-functions";
import { makeMathyFunRef } from "./test-math";
import { makeRegisterStompBody } from "./gen-stomp-on-registers";
import { makeUseRegressionTest } from "./randorderfuzz";
import { recursiveFunctions } from "./gen-recursion";

/* ************************ *
 * GRAMMAR-BASED GENERATION *
 * ************************ */

function makeScript (d, ignoredB) { /* eslint-disable-line require-jsdoc */
  return directivePrologue() + makeScriptBody(d, ignoredB);
}

function makeScriptBody (d, ignoredB) { /* eslint-disable-line require-jsdoc */
  if (rnd(3) === 0) {
    return makeMathyFunAndTest(d, ["x"]);
  }
  return makeStatement(d, ["x"]);
}

function makeScriptForEval (d, b) { /* eslint-disable-line require-jsdoc */
  switch (rnd(4)) {
    /* eslint-disable no-multi-spaces */
    case 0:  return makeExpr(d - 1, b);
    case 1:  return makeStatement(d - 1, b);
    case 2:  return makeUseRegressionTest(d, b);
    default: return makeScript(d - 3, b);
    /* eslint-enable no-multi-spaces */
  }
}

// Statement or block of statements
function makeStatement (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (rnd(2)) { return makeBuilderStatement(d, b); }

  if (d < 6 && rnd(3) === 0) { return makePrintStatement(d, b); }

  if (d < rnd(8)) { // frequently for small depth, infrequently for large depth
    return makeLittleStatement(d, b);
  }

  d = rnd(d); // !

  return (Random.index(statementMakers))(d, b);
}

// The reason there are several types of loops here is to create different
// types of scripts without introducing infinite loops.

function forLoopHead (d, b, v, reps) { /* eslint-disable-line require-jsdoc */
  var sInit = "";
  var sCond = "";
  var sNext = "";

  switch (rnd(2)) {
    case 0: // Generates constructs like `for (var x = 3; x > 0; x--) { ... }`
      sInit = `${Random.index(varBinderFor) + v} = ${reps}`;
      sCond = `${v} > 0`;
      if (rnd(2)) {
        sNext = `--${v}`;
      } else {
        sNext = `${v}--`;
      }
      break;
    default: // Generates constructs like `for (var x = 0; x < 3; x++) { ... }`
      sInit = `${Random.index(varBinderFor) + v} = 0`;
      sCond = `${v} < ${reps}`;
      if (rnd(2)) {
        sNext = `++${v}`;
      } else {
        sNext = `${v}++`;
      }
  }

  while (rnd(10) === 0) { sInit += `, ${makeLetHeadItem(d - 2, b)}`; }
  while (rnd(10) === 0) { sInit += `, ${makeExpr(d - 2, b)}`; } // NB: only makes sense if our varBinder is ""
  while (rnd(1000) === 0) {
  // never causes the loop to be run, but stuff like register allocation may be happening in the background
    sInit = Random.index(varBinderFor) + v;
  }
  while (rnd(10000) === 0) { sInit = ""; } // mostly throws ReferenceError, so make this rare

  while (rnd(20) === 0) { sCond = `${sCond} && (${makeExpr(d - 2, b)})`; }
  while (rnd(20) === 0) { sCond = `(${makeExpr(d - 2, b)}) && ${sCond}`; }

  while (rnd(20) === 0) { sNext = `${sNext}, ${makeExpr(d - 2, b)}`; }
  while (rnd(20) === 0) { sNext = `${makeExpr(d - 2, b)}, ${sNext}`; }

  return `for (${sInit}; ${sCond}; ${sNext})`;
}

function makeOpaqueIdiomaticLoop (d, b) { /* eslint-disable-line require-jsdoc */
  var reps = loopCount();
  var vHidden = uniqueVarName();
  return `/*oLoop*/${forLoopHead(d, b, vHidden, reps)} { ` +
      makeStatement(d - 2, b) +
      ` } `;
}

function makeTransparentIdiomaticLoop (d, b) { /* eslint-disable-line require-jsdoc */
  var reps = loopCount();
  var vHidden = uniqueVarName();
  var vVisible = makeNewId(d, b);
  return `/*vLoop*/${forLoopHead(d, b, vHidden, reps)}` +
    ` { ` +
      `${Random.index(varBinder) + vVisible} = ${vHidden}; ` +
      makeStatement(d - 2, b.concat([vVisible])) +
    ` } `;
}

function makeBranchUnstableLoop (d, b) { /* eslint-disable-line require-jsdoc */
  var reps = loopCount();
  var v = uniqueVarName();
  var mod = loopModulo();
  var target = rnd(mod);
  return `/*bLoop*/${forLoopHead(d, b, v, reps)} { ` +
    `if (${v} % ${mod} == ${target}) { ${makeStatement(d - 2, b)} } ` +
    `else { ${makeStatement(d - 2, b)} } ` +
    ` } `;
}

function makeTypeUnstableLoop (d, b) { /* eslint-disable-line require-jsdoc */
  var a = makeMixedTypeArray(d, b);
  var v = makeNewId(d, b);
  var bv = b.concat([v]);
  return `/*tLoop*/for (let ${v} of ${a}) { ${makeStatement(d - 2, bv)} }`;
}

function makeFunOnCallChain (d, b) { /* eslint-disable-line require-jsdoc */
  var s = "arguments.callee";
  while (rnd(2)) { s += ".caller"; }
  return s;
}

var statementMakers = Random.weighted([

  // Any two statements in sequence
  { w: 15, v: function (d, b) { return cat([makeStatement(d - 1, b), makeStatement(d - 1, b)]); } },
  { w: 15, v: function (d, b) { return cat([makeStatement(d - 1, b), "\n", makeStatement(d - 1, b), "\n"]); } },

  // Stripping semilcolons.  What happens if semicolons are missing?  Especially with line breaks used in place of semicolons (semicolon insertion).
  { w: 1, v: function (d, b) { return cat([stripSemicolon(makeStatement(d, b)), "\n", makeStatement(d, b)]); } },
  { w: 1, v: function (d, b) { return cat([stripSemicolon(makeStatement(d, b)), "\n"]); } },
  { w: 1, v: function (d, b) { return stripSemicolon(makeStatement(d, b)); } }, // usually invalid, but can be ok e.g. at the end of a block with curly braces

  // Simple variable declarations, followed (or preceded) by statements using those variables
  { w: 4, v: function (d, b) { var v = makeNewId(d, b); return cat([Random.index(varBinder), v, " = ", makeExpr(d, b), ";", makeStatement(d - 1, b.concat([v]))]); } },
  { w: 4, v: function (d, b) { var v = makeNewId(d, b); return cat([makeStatement(d - 1, b.concat([v])), Random.index(varBinder), v, " = ", makeExpr(d, b), ";"]); } },

  // Complex variable declarations, e.g. "const [a,b] = [3,4];" or "var a,b,c,d=4,e;"
  { w: 10, v: function (d, b) { return cat([Random.index(varBinder), makeLetHead(d, b), ";", makeStatement(d - 1, b)]); } },

  // Blocks
  { w: 2, v: function (d, b) { return cat(["{", makeStatement(d, b), " }"]); } },
  { w: 2, v: function (d, b) { return cat(["{", makeStatement(d - 1, b), makeStatement(d - 1, b), " }"]); } },

  /* eslint-disable no-multi-spaces */
  // "with" blocks
  { w: 2, v: function (d, b) {                          return cat([maybeLabel(), "with", "(", makeExpr(d, b), ")",                    makeStatementOrBlock(d, b)]);             } },
  { w: 2, v: function (d, b) { var v = makeNewId(d, b); return cat([maybeLabel(), "with", "(", "{", v, ": ", makeExpr(d, b), "}", ")", makeStatementOrBlock(d, b.concat([v]))]); } },
  /* eslint-enable no-multi-spaces */

  /* eslint-disable no-multi-spaces */
  // C-style "for" loops
  // Two kinds of "for" loops: one with an expression as the first part, one with a var or let binding 'statement' as the first part.
  // I'm not sure if arbitrary statements are allowed there; I think not.
  { w: 1, v: function (d, b) {                          return `/*infloop*/${cat([maybeLabel(), "for", "(", makeExpr(d, b), "; ", makeExpr(d, b), "; ", makeExpr(d, b), ") ", makeStatementOrBlock(d, b)])}`; } },
  { w: 1, v: function (d, b) { var v = makeNewId(d, b); return `/*infloop*/${cat([maybeLabel(), "for", "(", Random.index(varBinderFor), v,                                                    "; ", makeExpr(d, b), "; ", makeExpr(d, b), ") ", makeStatementOrBlock(d, b.concat([v]))])}`; } },
  { w: 1, v: function (d, b) { var v = makeNewId(d, b); return `/*infloop*/${cat([maybeLabel(), "for", "(", Random.index(varBinderFor), v, " = ", makeExpr(d, b),                             "; ", makeExpr(d, b), "; ", makeExpr(d, b), ") ", makeStatementOrBlock(d, b.concat([v]))])}`; } },
  { w: 1, v: function (d, b) {                          return `/*infloop*/${cat([maybeLabel(), "for", "(", Random.index(varBinderFor), makeDestructuringLValue(d, b), " = ", makeExpr(d, b), "; ", makeExpr(d, b), "; ", makeExpr(d, b), ") ", makeStatementOrBlock(d, b)])}`; } },
  /* eslint-enable no-multi-spaces */

  // Various types of "for" loops, specially set up to test tracing, carefully avoiding infinite loops
  { w: 6, v: makeTransparentIdiomaticLoop },
  { w: 6, v: makeOpaqueIdiomaticLoop },
  { w: 6, v: makeBranchUnstableLoop },
  { w: 8, v: makeTypeUnstableLoop },

  /* eslint-disable no-multi-spaces */
  // "for..in" loops
  // arbitrary-LHS marked as infloop because
  // -- for (key in obj)
  { w: 1, v: function (d, b) {                          return `/*infloop*/${cat([maybeLabel(), "for", "(", Random.index(varBinderFor), makeForInLHS(d, b), " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b)])}`; } },
  { w: 1, v: function (d, b) { var v = makeNewId(d, b); return               cat([maybeLabel(), "for", "(", Random.index(varBinderFor), v,                  " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b.concat([v]))]); } },
  // -- for (key in generator())
  { w: 1, v: function (d, b) {                          return `/*infloop*/${cat([maybeLabel(), "for", "(", Random.index(varBinderFor), makeForInLHS(d, b), " in ", "(", "(", makeFunction(d, b), ")", "(", makeExpr(d, b), ")", ")", ")", makeStatementOrBlock(d, b)])}`; } },
  { w: 1, v: function (d, b) { var v = makeNewId(d, b); return               cat([maybeLabel(), "for", "(", Random.index(varBinderFor), v,                  " in ", "(", "(", makeFunction(d, b), ")", "(", makeExpr(d, b), ")", ")", ")", makeStatementOrBlock(d, b.concat([v]))]); } },
  // -- for (element of arraylike)
  { w: 1, v: function (d, b) {                          return `/*infloop*/${cat([maybeLabel(), " for ", "(", Random.index(varBinderFor), makeLValue(d, b), " of ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b)])}`; } },
  { w: 1, v: function (d, b) { var v = makeNewId(d, b); return               cat([maybeLabel(), " for ", "(", Random.index(varBinderFor), v,                " of ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b.concat([v]))]); } },
  /* eslint-enable no-multi-spaces */

  /* eslint-disable no-multi-spaces */
  // -- for-await-of
  { w: 1, v: function (d, b) {                          return `/*infloop*/${cat([maybeLabel(), " for ", "await", "(", Random.index(varBinderFor), makeLValue(d, b), " of ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b)])}`; } },
  { w: 1, v: function (d, b) { var v = makeNewId(d, b); return               cat([maybeLabel(), " for ", "await", "(", Random.index(varBinderFor), v,                " of ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b.concat([v]))]); } },
  /* eslint-enable no-multi-spaces */

  // Modify something during a loop -- perhaps the thing being looped over
  // Since we use "let" to bind the for-variables, and only do wacky stuff once, I *think* this is unlikely to hang.
  //  function(d, b) { return `let forCount = 0; for (let ${makeId(d, b)} in ${makeExpr(d, b)}) { if (forCount++ == ${rnd(3)}) { ${makeStatement(d - 1, b)} } }`; },

  /* eslint-disable no-multi-spaces */
  // Hoisty "for..in" loops.  I don't know why this construct exists, but it does, and it hoists the initial-value expression above the loop.
  // With "var" or "const", the entire thing is hoisted.
  // With "let", only the value is hoisted, and it can be elim'ed as a useless statement.
  // The last form is specific to JavaScript 1.7 (only).
  { w: 1, v: function (d, b) {                                                   return cat([maybeLabel(), "for", "(", Random.index(varBinderFor), makeId(d, b),         " = ", makeExpr(d, b), " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b)]); } },
  { w: 1, v: function (d, b) { var v = makeNewId(d, b);                          return cat([maybeLabel(), "for", "(", Random.index(varBinderFor), v,                    " = ", makeExpr(d, b), " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b.concat([v]))]); } },
  { w: 1, v: function (d, b) { var v = makeNewId(d, b); var w = makeNewId(d, b); return cat([maybeLabel(), "for", "(", Random.index(varBinderFor), "[", v, ", ", w, "]", " = ", makeExpr(d, b), " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b.concat([v, w]))]); } },
  /* eslint-enable no-multi-spaces */

  // do..while
  { w: 1, v: function (d, b) { return cat([maybeLabel(), "while((", makeExpr(d, b), ") && 0)" /* don't split this, it's needed to avoid marking as infloop */, makeStatementOrBlock(d, b)]); } },
  { w: 1, v: function (d, b) { return `/*infloop*/${cat([maybeLabel(), "while", "(", makeExpr(d, b), ")", makeStatementOrBlock(d, b)])}`; } },
  { w: 1, v: function (d, b) { return cat([maybeLabel(), "do ", makeStatementOrBlock(d, b), " while((", makeExpr(d, b), ") && 0)" /* don't split this, it's needed to avoid marking as infloop */, ";"]); } },
  { w: 1, v: function (d, b) { return `/*infloop*/${cat([maybeLabel(), "do ", makeStatementOrBlock(d, b), " while", "(", makeExpr(d, b), ");"])}`; } },

  // Switch statement
  { w: 3, v: function (d, b) { return cat([maybeLabel(), "switch", "(", makeExpr(d, b), ")", " { ", makeSwitchBody(d, b), " }"]); } },

  // Conditionals, perhaps with 'else if' / 'else'
  { w: 1, v: function (d, b) { return cat([maybeLabel(), "if(", makeBoolean(d, b), ") ", makeStatementOrBlock(d, b)]); } },
  { w: 1, v: function (d, b) { return cat([maybeLabel(), "if(", makeBoolean(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", makeStatementOrBlock(d - 1, b)]); } },
  { w: 1, v: function (d, b) { return cat([maybeLabel(), "if(", makeBoolean(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", " if ", "(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b)]); } },
  { w: 1, v: function (d, b) { return cat([maybeLabel(), "if(", makeBoolean(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", " if ", "(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", makeStatementOrBlock(d - 1, b)]); } },

  // A tricky pair of if/else cases.
  // In the SECOND case, braces must be preserved to keep the final "else" associated with the first "if".
  { w: 1, v: function (d, b) { return cat([maybeLabel(), "if(", makeBoolean(d, b), ") ", "{", " if ", "(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", makeStatementOrBlock(d - 1, b), "}"]); } },
  { w: 1, v: function (d, b) { return cat([maybeLabel(), "if(", makeBoolean(d, b), ") ", "{", " if ", "(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b), "}", " else ", makeStatementOrBlock(d - 1, b)]); } },

  // Expression statements
  { w: 5, v: function (d, b) { return cat([makeExpr(d, b), ";"]); } },
  { w: 5, v: function (d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); } },

  // Exception-related statements :)
  { w: 6, v: function (d, b) { return makeExceptionyStatement(d - 1, b) + makeExceptionyStatement(d - 1, b); } },
  { w: 7, v: function (d, b) { return makeExceptionyStatement(d, b); } },

  // Labels. (JavaScript does not have goto, but it does have break-to-label and continue-to-label).
  { w: 1, v: function (d, b) { return cat(["L", ": ", makeStatementOrBlock(d, b)]); } },

  // Function-declaration-statements with shared names
  { w: 10, v: function (d, b) { return cat([makeStatement(d - 2, b), "function ", makeId(d, b), "(", makeFormalArgList(d, b), ")", makeFunctionBody(d - 1, b), makeStatement(d - 2, b)]); } },

  // Function-declaration-statements with unique names, along with calls to those functions
  { w: 8, v: makeNamedFunctionAndUse },

  // Long script -- can confuse Spidermonkey's short vs long jmp or something like that.
  // Spidermonkey's regexp engine is so slow for long strings that we have to bypass whatToTest :(
  // { w: 1, v: function(d, b) { return strTimes("try{}catch(e){}", rnd(10000)); } },
  { w: 1, v: function (d, b) { if (rnd(200) === 0) return `/*DUPTRY${rnd(10000)}*/${makeStatement(d - 1, b)}`; return ";"; } },

  { w: 1, v: function (d, b) { return makeShapeyConstructorLoop(d, b); } },

  // Replace a variable with a long linked list pointing to it.  (Forces SpiderMonkey's GC marker into a stackless mode.)
  { w: 1, v: function (d, b) { var x = makeId(d, b); return `${x} = ${linkedList(x, (rnd(100) * rnd(100)))}`; } },

  // Oddly placed "use strict" or "use asm"
  { w: 1, v: function (d, b) { return directivePrologue() + makeStatement(d - 1, b); } },

  // Spidermonkey GC and JIT controls
  { w: 3, v: function (d, b) { return makeTestingFunctionCall(d, b); } },
  { w: 3, v: function (d, b) { return `${makeTestingFunctionCall(d - 1, b)} ${makeStatement(d - 1, b)}`; } },

  // Blocks of statements related to typed arrays
  { w: 8, v: makeTypedArrayStatements },

  // Print statements
  { w: 8, v: makePrintStatement },

  { w: 20, v: makeRegexUseBlock },

  { w: 1, v: makeRegisterStompBody },

  { w: 20, v: makeUseRegressionTest }

  // Discover properties to add to the allPropertyNames list
  // { w: 3, v: function(d, b) { return `for (var p in ${makeId(d, b)}) { addPropertyName(p); }`; } },
  // { w: 3, v: function(d, b) { return `var opn = Object.getOwnPropertyNames(${makeId(d, b)}); for (var j = 0; j < opn.length; ++j) { addPropertyName(opn[j]); }`; } },
]);

if (typeof oomTest === "function" && engine !== ENGINE_JAVASCRIPTCORE) {
  statementMakers = statementMakers.concat([
    function (d, b) { return `oomTest(${makeFunction(d - 1, b)})`; },
    function (d, b) { return `oomTest(${makeFunction(d - 1, b)}, { keepFailing: true })`; }
  ]);
}

function linkedList (x, n) { /* eslint-disable-line require-jsdoc */
  for (var i = 0; i < n; ++i) { x = { a: x }; }
  return x;
}

function makeNamedFunctionAndUse (d, b) { /* eslint-disable-line require-jsdoc */
  // Use a unique function name to make it less likely that we'll accidentally make a recursive call
  var funcName = uniqueVarName();
  var formalArgList = makeFormalArgList(d, b);
  var bv = formalArgList.length === 1 ? b.concat(formalArgList) : b;
  var declStatement = cat(["/*hhh*/function ", funcName, "(", formalArgList, ")", "{", makeStatement(d - 1, bv), "}"]);
  var useStatement;
  if (rnd(2)) {
    // Direct call
    useStatement = cat([funcName, "(", makeActualArgList(d, b), ")", ";"]);
  } else {
    // Any statement, allowed to use the name of the function
    useStatement = `/*iii*/${makeStatement(d - 1, b.concat([funcName]))}`;
  }
  if (rnd(2)) {
    return declStatement + useStatement;
  } else {
    return useStatement + declStatement;
  }
}

function makePrintStatement (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(2) && b.length) { return `print(${Random.index(b)});`; } else { return `print(${makeExpr(d, b)});`; }
}

function maybeLabel () { /* eslint-disable-line require-jsdoc */
  if (rnd(4) === 1) { return cat([Random.index(["L", "M"]), ":"]); } else { return ""; }
}

function uniqueVarName () { /* eslint-disable-line require-jsdoc */
  // Make a random variable name.
  var s = "";
  for (var i = 0; i < 6; ++i) { s += String.fromCharCode(97 + rnd(26)); } // a lowercase english letter
  return s;
}

function makeSwitchBody (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var haveSomething = false;
  var haveDefault = false;
  var output = "";

  do {
    if (!haveSomething || rnd(2)) {
      // Want a case/default (or, if this is the beginning, "need").

      if (!haveDefault && rnd(2)) {
        output += "default: ";
        haveDefault = true;
      } else {
        // cases with numbers (integers?) have special optimizations,
        // so be sure to test those well in addition to testing complicated expressions.
        output += `case ${rnd(2) ? rnd(10) : makeExpr(d, b)}: `;
      }

      haveSomething = true;
    }

    // Might want a statement.
    if (rnd(2)) { output += makeStatement(d, b); }

    // Might want to break, or might want to fall through.
    if (rnd(2)) { output += "break; "; }

    if (rnd(2)) { --d; }
  } while (d && rnd(5));

  return output;
}

function makeLittleStatement (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  d = d - 1;

  if (rnd(4) === 1) { return makeStatement(d, b); }

  return (Random.index(littleStatementMakers))(d, b);
}

var littleStatementMakers =
[
  // Tiny
  function (d, b) { return cat([";"]); }, // e.g. empty "if" block
  function (d, b) { return cat(["{", "}"]); }, // e.g. empty "if" block
  function (d, b) { return cat([""]); },

  // Throw stuff.
  function (d, b) { return cat(["throw ", makeExpr(d, b), ";"]); },

  // Break/continue [to label].
  function (d, b) { return cat([Random.index(["continue", "break"]), " ", Random.index(["L", "M", "", ""]), ";"]); },

  // Named and unnamed functions (which have different behaviors in different places: both can be expressions,
  // but unnamed functions "want" to be expressions and named functions "want" to be special statements)
  function (d, b) { return makeFunction(d, b); },

  // Return, yield, await
  function (d, b) { return cat(["return ", makeExpr(d, b), ";"]); },
  function (d, b) { return "return;"; }, // return without a value is allowed in generators; return with a value is not.
  function (d, b) { return cat(["yield ", makeExpr(d, b), ";"]); }, // note: yield can also be a left-unary operator, or something like that
  function (d, b) { return "yield;"; },
  function (d, b) { return cat(["await ", makeExpr(d, b), ";"]); },

  // Expression statements
  function (d, b) { return cat([makeExpr(d, b), ";"]); },
  function (d, b) { return cat([makeExpr(d, b), ";"]); },
  function (d, b) { return cat([makeExpr(d, b), ";"]); },
  function (d, b) { return cat([makeExpr(d, b), ";"]); },
  function (d, b) { return cat([makeExpr(d, b), ";"]); },
  function (d, b) { return cat([makeExpr(d, b), ";"]); },
  function (d, b) { return cat([makeExpr(d, b), ";"]); },
  function (d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function (d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function (d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function (d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function (d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function (d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function (d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); }
];

// makeStatementOrBlock exists because often, things have different behaviors depending on where there are braces.
function makeStatementOrBlock (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  return (Random.index(statementBlockMakers))(d - 1, b);
}

var statementBlockMakers = [
  function (d, b) { return makeStatement(d, b); },
  function (d, b) { return makeStatement(d, b); },
  function (d, b) { return cat(["{", makeStatement(d, b), " }"]); },
  function (d, b) { return cat(["{", makeStatement(d - 1, b), makeStatement(d - 1, b), " }"]); }
];

// Extra-hard testing for try/catch/finally and related things.

function makeExceptionyStatement (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  d = d - 1;
  if (d < 1) { return makeLittleStatement(d, b); }

  return (Random.index(exceptionyStatementMakers))(d, b);
}

var exceptionyStatementMakers = [
  function (d, b) { return makeTryBlock(d, b); },

  function (d, b) { return makeStatement(d, b); },
  function (d, b) { return makeLittleStatement(d, b); },

  function (d, b) { return "return;"; }, // return without a value can be mixed with yield
  function (d, b) { return cat(["return ", makeExpr(d, b), ";"]); },
  function (d, b) { return cat(["yield ", makeExpr(d, b), ";"]); },
  function (d, b) { return cat(["await ", makeExpr(d, b), ";"]); },
  function (d, b) { return cat(["throw ", makeId(d, b), ";"]); },
  function (d, b) { return `${b[b.length - 1]}.${Random.index(exceptionProperties)};`; },
  function (d, b) { return `${makeId(d, b)}.${Random.index(exceptionProperties)};`; },
  function (d, b) { return cat([makeId(d, b), " = ", makeId(d, b), ";"]); },
  function (d, b) { return cat([makeLValue(d, b), " = ", makeId(d, b), ";"]); },

  // Iteration is also useful to test because it asserts that there is no pending exception.
  function (d, b) { var v = makeNewId(d, b); return `for(let ${v} in []);`; },
  function (d, b) { var v = makeNewId(d, b); return `for(let ${v} in ${makeIterable(d, b)}) ${makeExceptionyStatement(d, b.concat([v]))}`; },
  function (d, b) { var v = makeNewId(d, b); return `for(let ${v} of ${makeIterable(d, b)}) ${makeExceptionyStatement(d, b.concat([v]))}`; },
  function (d, b) { var v = makeNewId(d, b); return `for await(let ${v} of ${makeIterable(d, b)}) ${makeExceptionyStatement(d, b.concat([v]))}`; },

  // Scary place to throw: with
  function (d, b) { return `with({}) ${makeExceptionyStatement(d, b)}`; },
  function (d, b) { return `with({}) { ${makeExceptionyStatement(d, b)} } `; }

  // Commented out due to causing too much noise on stderr and causing a nonzero exit code :/
/*
  // Generator close hooks: called during GC in this case!!!
  function(d, b) { return `(function () { try { yield ${makeExpr(d, b)} } finally { ${makeStatement(d, b)} } })().next()`; },

  function(d, b) { return `(function () { try { yield ${makeExpr(d, b)} } finally { ${makeStatement(d, b)} } })()`; },
  function(d, b) { return `(function () { try { yield ${makeExpr(d, b)} } finally { ${makeStatement(d, b)} } })`; },
  function(d, b) {
    return `function gen() { try { yield 1; } finally { ${makeStatement(d, b)} } } var i = gen(); i.next(); i = null;`;
  }

*/
];

function makeTryBlock (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  // The following comment was added *before* guarded/conditional catch support was removed from jsfunfuzz
  // Catches: 1/6 chance of having none
  // Catches: maybe 2 + 1/2
  // So approximately 4 recursions into makeExceptionyStatement on average!
  // Therefore we want to keep the chance of recursing too much down.

  d = d - rnd(3);

  var s = cat(["try", " { ", makeExceptionyStatement(d, b), " } "]);

  var numCatches = 0;

  if (rnd(2)) {
    // Add an unguarded catch.
    ++numCatches;
    let catchId = makeId(d, b);
    let catchBlock = makeExceptionyStatement(d, b.concat([catchId]));
    if (rnd(2)) {
      s += cat(["catch", "(", catchId, ")", " { ", catchBlock, " } "]);
    } else {
      s += cat(["catch", " { ", catchBlock, " } "]); // Catch bindings are now optional thanks to bug 1380881
    }
  }

  if (numCatches === 0 || rnd(2) === 1) {
    // Add a finally.
    s += cat(["finally", " { ", makeExceptionyStatement(d, b), " } "]);
  }

  return s;
}

// Creates a string that sorta makes sense as an expression
function makeExpr (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (d <= 0 || (rnd(7) === 1)) { return makeTerm(d - 1, b); }

  if (rnd(6) === 1 && b.length) { return Random.index(b); }

  if (rnd(10) === 1) { return makeImmediateRecursiveCall(d, b); }

  d = rnd(d); // !

  var expr = (Random.index(exprMakers))(d, b);

  if (rnd(4) === 1) { return `(${expr})`; } else { return expr; }
}

// This makes it easier for fuzz-generated code to mess with the fuzzer. Will I regret it?
/*
function addPropertyName(p)
{
  p = `${p}`;
  if (
      p !== "floor" &&
      p !== "random" &&
      p !== "parent" && // unsafe spidermonkey shell function, see bug 619064
      true) {
    print(`Adding: ${p}`);
    allPropertyNames.push(p);
  }
}
*/

var exprMakers =
[
  // Increment and decrement
  function (d, b) { return cat([makeLValue(d, b), Random.index(incDecOps)]); },
  function (d, b) { return cat([Random.index(incDecOps), makeLValue(d, b)]); },

  // Other left-unary operators
  function (d, b) { return cat([Random.index(leftUnaryOps), makeExpr(d, b)]); },

  // Methods
  function (d, b) { var id = makeId(d, b); return cat(["/*UUV1*/", "(", id, ".", Random.index(allMethodNames), " = ", makeFunction(d, b), ")"]); },
  function (d, b) { var id = makeId(d, b); return cat(["/*UUV2*/", "(", id, ".", Random.index(allMethodNames), " = ", id, ".", Random.index(allMethodNames), ")"]); },
  function (d, b) { return cat([makeExpr(d, b), ".", Random.index(allMethodNames), "(", makeActualArgList(d, b), ")"]); },
  function (d, b) { return cat([makeExpr(d, b), ".", "valueOf", "(", uneval("number"), ")"]); },

  // Binary operators
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), Random.index(binaryOps), makeExpr(d, b)]); },
  function (d, b) { let expr = makeExpr(d, b); return cat(["/*infloop*/", expr, Random.index(binaryOps), expr]); },
  function (d, b) { return cat([makeId(d, b), Random.index(binaryOps), makeId(d, b)]); },
  function (d, b) { return cat([makeId(d, b), Random.index(binaryOps), makeId(d, b)]); },
  function (d, b) { return cat([makeId(d, b), Random.index(binaryOps), makeId(d, b)]); },
  function (d, b) { let id = makeId(d, b); return cat(["/*infloop*/", id, Random.index(binaryOps), id]); },

  // Ternary operator
  function (d, b) { return cat([makeExpr(d, b), " ? ", makeExpr(d, b), " : ", makeExpr(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), " ? ", makeExpr(d, b), " : ", makeExpr(d, b)]); },

  // In most contexts, yield expressions must be parenthesized, so including explicitly parenthesized yields makes actually-compiling yields appear more often.
  function (d, b) { return cat(["yield ", makeExpr(d, b)]); },
  function (d, b) { return cat(["(", "yield ", makeExpr(d, b), ")"]); },

  function (d, b) { return cat(["await ", makeExpr(d, b)]); },

  // Test mark bits of objects
  // addMarkObservers may need a better input than makeArrayLiteral, to focus more on valid objects
  function (d, b) { return cat(["addMarkObservers", "(", makeArrayLiteral(d, b), ")"]); },
  function (d, b) { return cat(["clearMarkObservers", "()"]); },
  function (d, b) { return cat(["getMarks", "()"]); },

  // Print the scope chain of objects
  function (d, b) { return cat(["dumpScopeChain", "(", makeFunction(d, b), ")"]); },

  // Array functions (including extras).  The most interesting are map and filter, I think.
  // These are mostly interesting to fuzzers in the sense of "what happens if i do strange things from a filter function?"  e.g. modify the array.. :)
  // This fuzzer isn't the best for attacking this kind of thing, since it's unlikely that the code in the function will attempt to modify the array or make it go away.
  // The second parameter to "map" is used as the "this" for the function.
  function (d, b) { return cat([makeArrayLiteral(d, b), ".", Random.index(["map", "filter", "some", "sort"])]); },
  function (d, b) { return cat([makeArrayLiteral(d, b), ".", Random.index(["map", "filter", "some", "sort"]), "(", makeFunction(d, b), ", ", makeExpr(d, b), ")"]); },
  function (d, b) { return cat([makeArrayLiteral(d, b), ".", Random.index(["map", "filter", "some", "sort"]), "(", makeFunction(d, b), ")"]); },

  // RegExp replace.  This is interesting for the same reason as array extras.
  function (d, b) { return cat(["'fafafa'", ".", "replace", "(", "/", "a", "/", "g", ", ", makeFunction(d, b), ")"]); },

  // Containment in an array or object (or, if this happens to end up on the LHS of an assignment, destructuring)
  function (d, b) { return cat(["[", makeExpr(d, b), "]"]); },
  function (d, b) { return cat(["(", "{", makeId(d, b), ": ", makeExpr(d, b), "}", ")"]); },

  // Functions: called immediately/not
  function (d, b) { return makeFunction(d, b); },
  function (d, b) { return `${makeFunction(d, b)}.prototype`; },
  function (d, b) { return cat(["(", makeFunction(d, b), ")", "(", makeActualArgList(d, b), ")"]); },

  // Try to call things that may or may not be functions.
  function (d, b) { return cat([makeExpr(d, b), "(", makeActualArgList(d, b), ")"]); },
  function (d, b) { return cat(["(", makeExpr(d, b), ")", "(", makeActualArgList(d, b), ")"]); },
  function (d, b) { return cat([makeFunction(d, b), "(", makeActualArgList(d, b), ")"]); },

  // Try to test function.call heavily.
  function (d, b) { return cat(["(", makeFunction(d, b), ")", ".", "call", "(", makeExpr(d, b), ", ", makeActualArgList(d, b), ")"]); },

  // Binary "new", with and without clarifying parentheses, with expressions or functions
  function (d, b) { return cat(["new ", makeExpr(d, b), "(", makeActualArgList(d, b), ")"]); },
  function (d, b) { return cat(["new ", "(", makeExpr(d, b), ")", "(", makeActualArgList(d, b), ")"]); },

  function (d, b) { return cat(["new ", makeFunction(d, b), "(", makeActualArgList(d, b), ")"]); },
  function (d, b) { return cat(["new ", "(", makeFunction(d, b), ")", "(", makeActualArgList(d, b), ")"]); },

  // Sometimes we do crazy stuff, like putting a statement where an expression should go.  This frequently causes a syntax error.
  function (d, b) { return stripSemicolon(makeLittleStatement(d, b)); },
  function (d, b) { return ""; },

  // Comments and whitespace
  function (d, b) { return cat([" /* Comment */", makeExpr(d, b)]); },
  function (d, b) { return cat(["\n", makeExpr(d, b)]); }, // perhaps trigger semicolon insertion and stuff
  function (d, b) { return cat([makeExpr(d, b), "\n"]); },

  // LValue as an expression
  function (d, b) { return cat([makeLValue(d, b)]); },

  // Assignment (can be destructuring)
  function (d, b) { return cat([ makeLValue(d, b), " = ", makeExpr(d, b) ]); },
  function (d, b) { return cat([ makeLValue(d, b), " = ", makeExpr(d, b) ]); },
  function (d, b) { return cat(["(", makeLValue(d, b), " = ", makeExpr(d, b), ")"]); },
  function (d, b) { return cat(["(", makeLValue(d, b), ")", " = ", makeExpr(d, b)]); },

  // Destructuring assignment
  function (d, b) { return cat([ makeDestructuringLValue(d, b), " = ", makeExpr(d, b) ]); },
  function (d, b) { return cat([ makeDestructuringLValue(d, b), " = ", makeExpr(d, b) ]); },
  function (d, b) { return cat(["(", makeDestructuringLValue(d, b), " = ", makeExpr(d, b), ")"]); },
  function (d, b) { return cat(["(", makeDestructuringLValue(d, b), ")", " = ", makeExpr(d, b)]); },

  // Destructuring assignment with lots of group assignment
  function (d, b) { return cat([makeDestructuringLValue(d, b), " = ", makeDestructuringLValue(d, b)]); },

  // Modifying assignment, with operators that do various coercions
  function (d, b) { return cat([makeLValue(d, b), Random.index(["|=", "%=", "+=", "-="]), makeExpr(d, b)]); },

  // ES5 getter/setter syntax, imperative (added in Gecko 1.9.3?)
  function (d, b) { return cat(["Object.defineProperty", "(", makeId(d, b), ", ", makePropertyName(d, b), ", ", makePropertyDescriptor(d, b), ")"]); },

  // Test the prototype of a particular object
  function (d, b) { return cat(["Object.getPrototypeOf", "(", makeId(d, b), ")"]); },
  function (d, b) { return cat(["Object.setPrototypeOf", "(", makeId(d, b), ", ", makeId(d, b), ")"]); },

  // Test retrieving an object's enumerable property values
  function (d, b) { return cat(["Object.values", "(", makeId(d, b), ")"]); },

  // Old getter/setter syntax, imperative
  function (d, b) { return cat([makeExpr(d, b), ".", "__defineGetter__", "(", uneval(makeId(d, b)), ", ", makeFunction(d, b), ")"]); },
  function (d, b) { return cat([makeExpr(d, b), ".", "__defineSetter__", "(", uneval(makeId(d, b)), ", ", makeFunction(d, b), ")"]); },
  function (d, b) { return cat(["this", ".", "__defineGetter__", "(", uneval(makeId(d, b)), ", ", makeFunction(d, b), ")"]); },
  function (d, b) { return cat(["this", ".", "__defineSetter__", "(", uneval(makeId(d, b)), ", ", makeFunction(d, b), ")"]); },

  // Object literal
  function (d, b) { return cat(["(", "{", makeObjLiteralPart(d, b), " }", ")"]); },
  function (d, b) { return cat(["(", "{", makeObjLiteralPart(d, b), ", ", makeObjLiteralPart(d, b), " }", ")"]); },

  // Test js_ReportIsNotFunction heavily.
  function (d, b) { return `(p={}, (p.z = ${makeExpr(d, b)})())`; },

  // Test js_ReportIsNotFunction heavily.
  // Test decompilation for ".keyword" a bit.
  // Test throwing-into-generator sometimes.
  function (d, b) { return cat([makeExpr(d, b), ".", "throw", "(", makeExpr(d, b), ")"]); },
  function (d, b) { return cat([makeExpr(d, b), ".", "yoyo", "(", makeExpr(d, b), ")"]); },

  // Test eval in various contexts. (but avoid clobbering eval)
  // Test the special "obj.eval" and "eval(..., obj)" forms.
  function (d, b) { return `${makeExpr(d, b)}.eval(${uneval(makeScriptForEval(d, b))})`; },
  function (d, b) { return `eval(${uneval(makeScriptForEval(d, b))})`; },
  function (d, b) { return `eval(${uneval(makeScriptForEval(d, b))}, ${makeExpr(d, b)})`; },

  // Uneval needs more testing than it will get accidentally.  No cat() because I don't want uneval clobbered (assigned to) accidentally.
  function (d, b) { return `(uneval(${makeExpr(d, b)}))`; },

  /* eslint-disable no-multi-spaces */
  // Constructors.  No cat() because I don't want to screw with the constructors themselves, just call them.
  function (d, b) { return `new ${Random.index(constructors)}(${makeActualArgList(d, b)})`; },
  function (d, b) { return     `${Random.index(constructors)}(${makeActualArgList(d, b)})`; },
  /* eslint-enable no-multi-spaces */

  /* eslint-disable no-multi-spaces */
  // Unary Math functions
  function (d, b) { return `Math.${Random.index(unaryMathFunctions)}(${makeExpr(d, b)})`; },
  function (d, b) { return `Math.${Random.index(unaryMathFunctions)}(${makeNumber(d, b)})`; },
  /* eslint-enable no-multi-spaces */

  /* eslint-disable no-multi-spaces */
  // Binary Math functions
  function (d, b) { return `Math.${Random.index(binaryMathFunctions)}(${makeExpr(d, b)}, ${makeExpr(d, b)})`; },
  function (d, b) { return `Math.${Random.index(binaryMathFunctions)}(${makeExpr(d, b)}, ${makeNumber(d, b)})`; },
  function (d, b) { return `Math.${Random.index(binaryMathFunctions)}(${makeNumber(d, b)}, ${makeExpr(d, b)})`; },
  function (d, b) { return `Math.${Random.index(binaryMathFunctions)}(${makeNumber(d, b)}, ${makeNumber(d, b)})`; },
  /* eslint-enable no-multi-spaces */

  // ES6 scripted proxy creation
  function (d, b) { return `${makeId(d, b)} = new Proxy(${makeExpr(d, b)}, ${makeProxyHandler(d, b)})`; },

  function (d, b) { return cat(["delete", " ", makeId(d, b), ".", makeId(d, b)]); },

  // Spidermonkey: global ES5 strict mode
  function (d, b) { return "(void options('strict_mode'))"; },

  // Spidermonkey: additional "strict" warnings, distinct from ES5 strict mode
  function (d, b) { return "(void options('strict'))"; },

  // More special Spidermonkey shell functions
  // (Note: functions without returned objects or visible side effects go in testing-functions.js, in order to allow presence/absence differential testing.)
  // function (d, b) { return `dumpObject(${makeExpr(d, b)})`; },
  function (d, b) { return `(void shapeOf(${makeExpr(d, b)}))`; },
  function (d, b) { return `intern(${makeExpr(d, b)})`; },
  function (d, b) { return "allocationMarker()"; },
  function (d, b) { return "timeout(1800)"; }, // see https://bugzilla.mozilla.org/show_bug.cgi?id=840284#c12 -- replace when bug 831046 is fixed
  function (d, b) { return "(makeFinalizeObserver('tenured'))"; },
  function (d, b) { return "(makeFinalizeObserver('nursery'))"; },

  makeRegexUseExpr,
  makeShapeyValue,
  makeIterable,
  function (d, b) { return makeMathExpr(d + rnd(3), b); }
];

var fuzzTestingFunctions = fuzzTestingFunctionsCtor(fuzzTestingFunctionArg);

// Ensure that even if makeExpr returns "" or "1, 2", we only pass one argument to functions like schedulegc
// (null || (" + makeExpr(d - 2, b) + "))
// Darn, only |this| and local variables are safe: an expression with side effects breaks the statement-level compare_jit hack
function fuzzTestingFunctionArg (d, b) { return "this"; } /* eslint-disable-line require-jsdoc */

function makeTestingFunctionCall (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var callStatement = Random.index(fuzzTestingFunctions.testingFunctions)(d, b);

  // Set the 'last expression evaluated' to undefined, in case we're in an eval
  // context, and the function throws in one run but not in another.
  var callBlock = `{ void 0; ${callStatement} }`;

  if (jsshell && rnd(5) === 0) {
    // Differential testing hack!
    // The idea here: make compare_jit tell us when functions like gc() surprise
    // us with visible side effects.
    // * Functions in testing-functions.js are chosen to be ones with no visible
    //   side effects except for return values (voided) or throwing (caught).
    // * This condition is controlled by --no-asmjs, which compare_jit flips.
    //     (A more principled approach would be to have compare_jit set an environment
    //     variable and read it here using os.getenv(), but os is not available
    //     when running with --fuzzing-safe...)
    // * The extra braces prevent a stray "else" from being associated with this "if".
    // * The 'void 0' at the end ensures the last expression-statement is consistent
    //     (needed because |eval| returns that as its result)
    var cond = `${rnd(2) ? "!" : ""}isAsmJSCompilationAvailable()`;
    return `{ if (${cond}) ${callBlock} void 0; }`;
  }

  return callBlock;
}

// SpiderMonkey shell (but not xpcshell) has an "evalcx" function and a "newGlobal" function.
// This tests sandboxes and cross-compartment wrappers.
if (typeof evalcx === "function") {
  exprMakers = exprMakers.concat([
    function (d, b) { return makeGlobal(d, b); },
    function (d, b) { return `evalcx(${uneval(makeScriptForEval(d, b))}, ${makeExpr(d, b)})`; },
    function (d, b) { return `evalcx(${uneval(makeScriptForEval(d, b))}, ${makeGlobal(d, b)})`; }
  ]);
}

// SpiderMonkey shell has an "evalInWorker" function.
// This tests evaluating scripts in a separate thread with its own runtime.
if (typeof evalInWorker === "function") {
  exprMakers = exprMakers.concat([
    function (d, b) { return makeGlobal(d, b); },
    function (d, b) { return `evalInWorker(${uneval(makeScriptForEval(d, b))})`; },
    function (d, b) { return `evalInWorker(${uneval(makeScriptForEval(d, b))})`; }
  ]);
}

// xpcshell (but not SpiderMonkey shell) has some XPC wrappers available.
if (typeof XPCNativeWrapper === "function") {
  exprMakers = exprMakers.extend([
    function (d, b) { return `new XPCNativeWrapper(${makeExpr(d, b)})`; },
    function (d, b) { return `new XPCSafeJSObjectWrapper(${makeExpr(d, b)})`; }
  ]);
}

function makeNewGlobalArg (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  // Make an options object to pass to the |newGlobal| shell builtin.
  var propStrs = [];
  if (rnd(2)) { propStrs.push(`newCompartment: ${makeBoolean(d - 1, b)}`); }
  if (rnd(2)) { propStrs.push(`sameCompartmentAs: ${makeExpr(d - 1, b)}`); }
  if (rnd(2)) { propStrs.push(`sameZoneAs: ${makeExpr(d - 1, b)}`); }
  if (rnd(2)) { propStrs.push(`cloneSingletons: ${makeBoolean(d - 1, b)}`); }
  if (rnd(2)) { propStrs.push(`disableLazyParsing: ${makeBoolean(d - 1, b)}`); }
  if (rnd(2)) { propStrs.push(`invisibleToDebugger: ${makeBoolean(d - 1, b)}`); }
  return `{ ${propStrs.join(", ")} }`;
}

function makeGlobal (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (rnd(10)) { return "this"; }

  var gs;
  switch (rnd(4)) {
    /* eslint-disable no-multi-spaces */
    case 0:  gs = "evalcx('')"; break;
    case 1:  gs = "evalcx('lazy')"; break;
    default: gs = `newGlobal(${makeNewGlobalArg(d - 1, b)})`; break;
    /* eslint-enable no-multi-spaces */
  }

  if (rnd(2)) { gs = `fillShellSandbox(${gs})`; }

  return gs;
}

if (xpcshell) {
  exprMakers = exprMakers.concat([
    function (d, b) { var n = rnd(4); return `newGeckoSandbox(${n})`; },
    function (d, b) { var n = rnd(4); return `s${n} = newGeckoSandbox(${n})`; },
    // FIXME: Doesn't this need to be Components.utils.evalInSandbox?
    function (d, b) { var n = rnd(4); return `evalInSandbox(${uneval(makeStatement(d, b))}, newGeckoSandbox(${n}))`; },
    function (d, b) { var n = rnd(4); return `evalInSandbox(${uneval(makeStatement(d, b))}, s${n})`; },
    function (d, b) { return `evalInSandbox(${uneval(makeStatement(d, b))}, ${makeExpr(d, b)})`; },
    function (d, b) { return "(Components.classes ? quit() : gc()); }"; }
  ]);
}

var bp;
function makeShapeyConstructor (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);
  var argName = uniqueVarName();
  var t = rnd(4) ? "this" : argName;
  var funText = `function shapeyConstructor(${argName}){${directivePrologue()}`;
  bp = b.concat([argName]);

  var nPropNames = rnd(6) + 1;
  var propNames = [];
  for (var i = 0; i < nPropNames; ++i) {
    propNames[i] = makePropertyName(d, b);
  }

  var nStatements = rnd(11);
  for (var j = 0; j < nStatements; ++j) {
    var propName = Random.index(propNames);
    var tprop = `${t}[${propName}]`;
    if (rnd(5) === 0) {
      funText += `if (${rnd(2) ? argName : makeExpr(d, bp)}) `;
    }
    switch (rnd(8)) {
      /* eslint-disable no-multi-spaces */
      case 0:  funText += `delete ${tprop};`; break;
      case 1:  funText += `Object.defineProperty(${t}, ${rnd(2) ? propName : makePropertyName(d, b)}, ${makePropertyDescriptor(d, bp)});`; break;
      case 2:  funText += `{ ${makeStatement(d, bp)} } `; break;
      case 3:  funText += `${tprop} = ${makeExpr(d, bp)};`; break;
      case 4:  funText += `${tprop} = ${makeFunction(d, bp)};`; break;
      case 5:  funText += `for (var ytq${uniqueVarName()} in ${t}) { }`; break;
      case 6:  funText += `Object.${Random.index(["preventExtensions", "seal", "freeze"])}(${t});`; break;
      default: funText += `${tprop} = ${makeShapeyValue(d, bp)};`; break;
      /* eslint-enable no-multi-spaces */
    }
  }
  funText += `return ${t}; }`;
  return funText;
}

var propertyNameMakers = Random.weighted([
  { w: 1, v: function (d, b) { return makeExpr(d - 1, b); } },
  { w: 1, v: function (d, b) { return maybeNeg() + rnd(20); } },
  { w: 1, v: function (d, b) { return `"${maybeNeg()}${rnd(20)}"`; } },
  { w: 1, v: function (d, b) { return `new String("${maybeNeg()}${rnd(20)}")`; } },
  { w: 5, v: function (d, b) { return simpleSource(Random.index(specialProperties)); } },
  { w: 1, v: function (d, b) { return simpleSource(makeId(d - 1, b)); } },
  { w: 5, v: function (d, b) { return simpleSource(Random.index(allMethodNames)); } }
]);

function maybeNeg () { return rnd(5) ? "" : "-"; } /* eslint-disable-line require-jsdoc */

function makePropertyName (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  return (Random.index(propertyNameMakers))(d, b);
}

function makeShapeyConstructorLoop (d, b) { /* eslint-disable-line require-jsdoc */
  var a = makeIterable(d, b);
  var v = makeNewId(d, b);
  var v2 = uniqueVarName(d, b);
  var bvv = b.concat([v, v2]);
  return makeShapeyConstructor(d - 1, b) +
    `/*tLoopC*/for (let ${v} of ${a}) { ` +
     "try{" +
      `let ${v2} = ${Random.index(["new ", ""])}shapeyConstructor(${v}); print('EETT'); ` +
       // `print(uneval(${v2}));` +
       makeStatement(d - 2, bvv) +
     `}catch(e){print('TTEE ' + e); }` +
  " }";
}

function makePropertyDescriptor (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var s = "({";

  switch (rnd(3)) {
    case 0:
    // Data descriptor. Can have 'value' and 'writable'.
      if (rnd(2)) s += `value: ${makeExpr(d, b)}, `;
      if (rnd(2)) s += `writable: ${makeBoolean(d, b)}, `;
      break;
    case 1:
    // Accessor descriptor. Can have 'get' and 'set'.
      if (rnd(2)) s += `get: ${makeFunction(d, b)}, `;
      if (rnd(2)) s += `set: ${makeFunction(d, b)}, `;
      break;
    default:
  }

  if (rnd(2)) s += `configurable: ${makeBoolean(d, b)}, `;
  if (rnd(2)) s += `enumerable: ${makeBoolean(d, b)}, `;

  // remove trailing comma
  if (s.length > 2) { s = s.substr(0, s.length - 2); }

  s += "})";
  return s;
}

function makeBoolean (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);
  switch (rnd(4)) {
    /* eslint-disable no-multi-spaces */
    case 0:   return "true";
    case 1:   return "false";
    case 2:   return makeExpr(d - 2, b);
    default:  var m = loopModulo(); return `(${Random.index(b)} % ${m}${Random.index([" == ", " != "])}${rnd(m)})`;
    /* eslint-enable no-multi-spaces */
  }
}

function makeObjLiteralPart (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  switch (rnd(8)) {
  // Literal getter/setter
  // Surprisingly, string literals, integer literals, and float literals are also good!
  // (See https://bugzilla.mozilla.org/show_bug.cgi?id=520696.)
    case 2: return cat([" get ", makeObjLiteralName(d, b), maybeName(d, b), "(", makeFormalArgList(d - 1, b), ")", makeFunctionBody(d, b)]);
    case 3: return cat([" set ", makeObjLiteralName(d, b), maybeName(d, b), "(", makeFormalArgList(d - 1, b), ")", makeFunctionBody(d, b)]);

    case 4: return `/*toXFun*/${cat([Random.index(["toString", "valueOf"]), ": ", makeToXFunction(d - 1, b)])}`;

    default: return cat([makeObjLiteralName(d, b), ": ", makeExpr(d, b)]);
  }
}

function makeToXFunction (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  switch (rnd(4)) {
    /* eslint-disable no-multi-spaces */
    case 0:  return `function() { return ${makeExpr(d, b)}; }`;
    case 1:  return "function() { return this; }";
    case 2:  return makeEvilCallback(d, b);
    default: return makeFunction(d, b);
    /* eslint-enable no-multi-spaces */
  }
}

function makeObjLiteralName (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  switch (rnd(6)) {
    /* eslint-disable no-multi-spaces */
    case 0:  return simpleSource(makeNumber(d, b)); // a quoted number
    case 1:  return makeNumber(d, b);
    case 2:  return Random.index(allPropertyNames);
    case 3:  return Random.index(specialProperties);
    default: return makeId(d, b);
    /* eslint-enable no-multi-spaces */
  }
}

function makeFunction (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  d = d - 1;

  if (rnd(5) === 1) { return makeExpr(d, b); }

  if (rnd(4) === 1) { return Random.index(builtinFunctions); }

  return (Random.index(functionMakers))(d, b);
}

function maybeName (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(2) === 0) { return ` ${makeId(d, b)} `; } else { return ""; }
}

function directivePrologue () { /* eslint-disable-line require-jsdoc */
  var s = "";
  if (rnd(3) === 0) { s += '"use strict"; '; }
  if (rnd(30) === 0) { s += '"use asm"; '; }
  return s;
}

function makeFunctionBody (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  switch (rnd(6)) {
    /* eslint-disable no-multi-spaces */
    case 0:  return cat([" { ", directivePrologue(), makeStatement(d - 1, b),   " } "]);
    case 1:  return cat([" { ", directivePrologue(), "return ", makeExpr(d, b), " } "]);
    case 2:  return cat([" { ", directivePrologue(), "yield ",  makeExpr(d, b), " } "]);
    case 3:  return cat([" { ", directivePrologue(), "await ",  makeExpr(d, b), " } "]);
    case 4:  return `"use asm"; ${asmJSInterior([])}`;
    default: return makeExpr(d, b); // make an "expression closure"
    /* eslint-enable no-multi-spaces */
  }
}

function functionPrefix () { /* eslint-disable-line require-jsdoc */
  return (rnd(2) === 0 ? "" : "async ")
    + "function"
    + (rnd(2) === 0 ? "" : "*");
}

var functionMakers = [
  // Note that a function with a name is sometimes considered a statement rather than an expression.

  makeFunOnCallChain,
  makeMathFunction,
  makeMathyFunRef,

  /* eslint-disable no-multi-spaces */
  // Functions and expression closures
  function (d, b) { var v = makeNewId(d, b); return cat([functionPrefix(), " ", maybeName(d, b), "(", v,                       ")", makeFunctionBody(d, b.concat([v]))]); },
  function (d, b) {                          return cat([functionPrefix(), " ", maybeName(d, b), "(", makeFormalArgList(d, b), ")", makeFunctionBody(d, b)]); },
  /* eslint-enable no-multi-spaces */

  // Arrow functions with one argument (no parens needed) (no destructuring allowed in this form?)
  function (d, b) { var v = makeNewId(d, b); return cat([v, " => ", makeFunctionBody(d, b.concat([v]))]); },

  /* eslint-disable no-multi-spaces */
  // Arrow functions with multiple arguments
  function (d, b) {                          return cat(["(", makeFormalArgList(d, b), ")", " => ", makeFunctionBody(d, b)]); },
  /* eslint-enable no-multi-spaces */

  // The identity function
  function (d, b) { return `${functionPrefix()}(q) { ${directivePrologue()}return q; }`; },
  function (d, b) { return "q => q"; },

  // A function that does something
  function (d, b) { return `${functionPrefix()}(y) { ${directivePrologue()}${makeStatement(d, b.concat(["y"]))} }`; },

  // A function that computes something
  function (d, b) { return `${functionPrefix()}(y) { ${directivePrologue()}return ${makeExpr(d, b.concat(["y"]))} }`; },

  // A generator that does something
  function (d, b) { return `function(y) { ${directivePrologue()}yield y; ${makeStatement(d, b.concat(["y"]))}; yield y; }`; },
  function (d, b) { return `function*(y) { ${directivePrologue()}yield y; ${makeStatement(d, b.concat(["y"]))}; yield y; }`; },

  // An async function that does something
  function (d, b) { return `async function (y) { ${directivePrologue()}await y; ${makeStatement(d, b.concat(["y"]))}; await y; }`; },

  // An async generator that does something
  function (d, b) { return `async function* (y) { ${directivePrologue()}await y; ${makeStatement(d, b.concat(["y"]))}; await y; }`; },
  function (d, b) { return `async function* (y) { ${directivePrologue()}yield y; await y; ${makeStatement(d, b.concat(["y"]))}; yield y; await y; }`; },

  // A simple wrapping pattern
  function (d, b) { return `/*wrap1*/(${functionPrefix()}(){ ${directivePrologue()}${makeStatement(d, b)}return ${makeFunction(d, b)}})()`; },

  // Wrapping with upvar: escaping, may or may not be modified
  function (d, b) { var v1 = uniqueVarName(); var v2 = uniqueVarName(); return `/*wrap2*/(${functionPrefix()}(){ ${directivePrologue()}var ${v1} = ${makeExpr(d, b)}; var ${v2} = ${makeFunction(d, b.concat([v1]))}; return ${v2};})()`; },

  /* eslint-disable no-multi-spaces */
  // Wrapping with upvar: non-escaping
  function (d, b) { var v1 = uniqueVarName();                           return `/*wrap3*/(${functionPrefix()}(){ ${directivePrologue()}var ${v1} = ${makeExpr(d, b)}; (${makeFunction(d, b.concat([v1]))})(); })`; },
  /* eslint-enable no-multi-spaces */

  // Apply, call
  function (d, b) { return `(${makeFunction(d - 1, b)}).apply`; },
  function (d, b) { return `(${makeFunction(d - 1, b)}).call`; },

  // Bind
  function (d, b) { return `(${makeFunction(d - 1, b)}).bind`; },
  function (d, b) { return `(${makeFunction(d - 1, b)}).bind(${makeActualArgList(d, b)})`; },

  // Methods with known names
  function (d, b) { return cat([makeExpr(d, b), ".", Random.index(allMethodNames)]); },

  // ES6 scripted proxy function
  function (d, b) { return `(new Proxy(${makeFunction(d, b)}, ${makeProxyHandler(d, b)}))`; },

  // Special functions that might have interesting results, especially when called "directly" by things like string.replace or array.map.
  function (d, b) { return "eval"; }, // eval is interesting both for its "no indirect calls" feature and for the way it's implemented in spidermonkey (a special bytecode).
  function (d, b) { return "new Function"; }, // this won't be interpreted the same way for each caller of makeFunction, but that's ok
  function (d, b) { return `(new Function(${uneval(makeStatement(d, b))}))`; },
  function (d, b) { return "Function"; }, // without "new"
  function (d, b) { return "decodeURI"; },
  function (d, b) { return "decodeURIComponent"; },
  function (d, b) { return "encodeURI"; },
  function (d, b) { return "encodeURIComponent"; },
  function (d, b) { return "neuter"; },
  function (d, b) { return "createIsHTMLDDA"; }, // spidermonkey shell object like the browser's document.all
  function (d, b) { return "offThreadCompileScript"; },
  function (d, b) { return "runOffThreadScript"; },
  function (d, b) { return "nukeAllCCWs"; },
  function (d, b) { return "FakeDOMObject"; },
  function (d, b) { return makeProxyHandlerFactory(d, b); },
  function (d, b) { return makeShapeyConstructor(d, b); },
  function (d, b) { return Random.index(typedArrayConstructors); },
  function (d, b) { return Random.index(constructors); }
];

if (typeof XPCNativeWrapper === "function") {
  functionMakers = functionMakers.concat([
    function (d, b) { return "XPCNativeWrapper"; },
    function (d, b) { return "XPCSafeJSObjectWrapper"; }
  ]);
}

if (typeof oomTest === "function" && engine !== ENGINE_JAVASCRIPTCORE) {
  functionMakers = functionMakers.concat([
    function (d, b) { return "oomTest"; }
  ]);
}

function makeTypedArrayStatements (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (d < 0) return "";

  var numViews = rnd(d) + 1;
  var numExtraStatements = rnd(d) + 1;
  var buffer = uniqueVarName();
  var bufferSize = (1 + rnd(2)) * (1 + rnd(2)) * (1 + rnd(2)) * rnd(5);
  var statements = `var ${buffer} = new ${arrayBufferType()}(${bufferSize}); `;
  var bv = b.concat([buffer]);
  for (var j = 0; j < numViews; ++j) {
    var view = `${buffer}_${j}`;
    var type = Random.index(typedArrayConstructors);
    statements += `var ${view} = new ${type}(${buffer}); `;
    bv.push(view);
    var viewZero = `${view}[0]`;
    bv.push(viewZero);
    if (rnd(3) === 0) { statements += `print(${viewZero}); `; }
    if (rnd(3)) { statements += `${viewZero} = ${makeNumber(d - 2, b)}; `; }
    bv.push(`${view}[${rnd(11)}]`);
  }
  for (var k = 0; k < numExtraStatements; ++k) {
    statements += makeStatement(d - numExtraStatements, bv);
  }
  return statements;
}

function makeNumber (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var signStr = rnd(2) ? "-" : "";

  switch (rnd(60)) {
    /* eslint-disable no-multi-spaces */
    case 0:  return makeExpr(d - 2, b);
    case 1:  return `${signStr}0`;
    case 2:  return `${signStr}${rnd(1000) / 1000}`;
    case 3:  return `${signStr}${rnd(0xffffffff) / 2}`;
    case 4:  return `${signStr}${rnd(0xffffffff)}`;
    case 5:  return Random.index(["0.1", ".2", "3", "1.3", "4.", "5.0000000000000000000000",
      "1.2e3", "1e81", "1e+81", "1e-81", "1e4", "0", "-0", "(-0)", "-1", "(-1)", "0x99", "033",
      "3.141592653589793", "3/0", "-3/0", "0/0", "0x2D413CCC", "0x5a827999", "0xB504F332",
      "(0x50505050 >> 1)",
      // Boundaries of int, signed, unsigned (near +/- 2^31, +/- 2^32)
      "0x07fffffff",  "0x080000000",  "0x080000001",
      "-0x07fffffff", "-0x080000000", "-0x080000001",
      "0x0ffffffff",  "0x100000000",  "0x100000001",
      "-0x0ffffffff", "-0x100000000",  "-0x100000001",
      // Boundaries of double
      "Number.MIN_VALUE", "-Number.MIN_VALUE",
      "Number.MAX_VALUE", "-Number.MAX_VALUE",
      // Boundaries of maximum safe integer
      "Number.MIN_SAFE_INTEGER", "-Number.MIN_SAFE_INTEGER",
      "-(2**53-2)", "-(2**53)", "-(2**53+2)",
      "Number.MAX_SAFE_INTEGER", "-Number.MAX_SAFE_INTEGER",
      "(2**53)-2", "(2**53)", "(2**53)+2",
      // See bug 1350097
      "0.000000000000001", "1.7976931348623157e308"
    ]);
    case 6:  return `${signStr}${Math.pow(2, rnd(66)) + (rnd(3) - 1)}`;
    default: return `${signStr}${rnd(30)}`;
    /* eslint-enable no-multi-spaces */
  }
}

function makeLetHead (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var items = (d > 0 || rnd(2) === 0) ? rnd(10) + 1 : 1;
  var result = "";

  for (var i = 0; i < items; ++i) {
    if (i > 0) { result += ", "; }
    result += makeLetHeadItem(d - i, b);
  }

  return result;
}

function makeLetHeadItem (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  d = d - 1;

  if (d < 0 || rnd(2) === 0) { return rnd(2) ? uniqueVarName() : makeId(d, b); } else if (rnd(5) === 0) { return `${makeDestructuringLValue(d, b)} = ${makeExpr(d, b)}`; } else { return `${makeId(d, b)} = ${makeExpr(d, b)}`; }
}

function makeActualArgList (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var nArgs = rnd(3);

  if (nArgs === 0) { return ""; }

  var argList = makeExpr(d, b);

  for (var i = 1; i < nArgs; ++i) { argList += `, ${makeExpr(d - i, b)}`; }

  return argList;
}

function makeFormalArgList (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var argList = [];

  var nArgs = rnd(5) ? rnd(3) : rnd(100);
  for (var i = 0; i < nArgs; ++i) {
    argList.push(makeFormalArg(d - i, b));
  }

  if (rnd(5) === 0) {
    // https://developer.mozilla.org/en-US/docs/JavaScript/Reference/rest_parameters
    argList.push(`...${makeId(d, b)}`);
  }

  return argList.join(", ");
}

function makeFormalArg (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (rnd(8) === 1) { return makeDestructuringLValue(d, b); }

  return makeId(d, b) + (rnd(5) ? "" : ` = ${makeExpr(d, b)}`);
}

function makeNewId (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  return Random.index(["a", "b", "c", "d", "e", "w", "x", "y", "z"]);
}

function makeId (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (rnd(3) === 1 && b.length) { return Random.index(b); }

  switch (rnd(200)) {
    case 0:
      return makeTerm(d, b);
    case 1:
      return makeExpr(d, b);
    case 2: case 3: case 4: case 5:
      return makeLValue(d, b);
    case 6: case 7:
      return makeDestructuringLValue(d, b);
    case 8: case 9: case 10:
    // some keywords that can be used as identifiers in some contexts (e.g. variables, function names, argument names)
    // but that's annoying, and some of these cause lots of syntax errors.
      return Random.index(["get", "set", "getter", "setter", "delete", "let", "yield", "await", "of"]);
    case 11: case 12: case 13:
      return `this.${makeId(d, b)}`;
    case 14: case 15: case 16:
      return makeObjLiteralName(d - 1, b);
    case 17: case 18:
      return makeId(d - 1, b);
    case 19:
      return " "; // [k, v] becomes [, v] -- test how holes are handled in unexpected destructuring
    case 20:
      return "this";
  }

  return Random.index([
    "a", "b", "c", "d", "e", "w", "x", "y", "z",
    "eval", "\u3056", "NaN"
    // "valueOf", "toString", // e.g. valueOf getter :P // bug 381242, etc
  ]);

  // eval is interesting because it cannot be called indirectly. and maybe also because it has its own opcode in jsopcode.tbl.
  // but bad things happen if you have "eval setter". so let's not put eval in this list.
}

function makeImmediateRecursiveCall (d, b, cheat1, cheat2) { /* eslint-disable-line require-jsdoc */
  if (rnd(10) !== 0) { return "(4277)"; }

  var a = (cheat1 == null) ? Random.index(recursiveFunctions) : recursiveFunctions[cheat1];
  var s = a.text;
  var varMap = {};
  for (var i = 0; i < a.vars.length; ++i) {
    var prettyName = a.vars[i];
    varMap[prettyName] = uniqueVarName();
    s = s.replace(new RegExp(prettyName, "g"), varMap[prettyName]);
  }
  var actualArgs = cheat2 == null ? a.args(d, b) : cheat2;
  s = `${s}(${actualArgs})`;
  s = s.replace(/@/g, function () { if (rnd(4) === 0) return makeStatement(d - 2, b); return ""; });
  if (a.randSub) s = a.randSub(s, varMap, d, b);
  s = `(${s})`;
  return s;
}

// for..in LHS can be a single variable OR it can be a destructuring array of exactly two elements.
function makeForInLHS (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);
  return makeLValue(d, b);
}

function makeLValue (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (d <= 0 || (rnd(2) === 1)) { return makeId(d - 1, b); }

  d = rnd(d); // !

  return (Random.index(lvalueMakers))(d, b);
}

var lvalueMakers = [
  // Simple variable names :)
  function (d, b) { return cat([makeId(d, b)]); },

  // Parenthesized lvalues
  function (d, b) { return cat(["(", makeLValue(d, b), ")"]); },

  // Destructuring
  function (d, b) { return makeDestructuringLValue(d, b); },
  function (d, b) { return `(${makeDestructuringLValue(d, b)})`; },

  // Certain functions can act as lvalues!  See JS_HAS_LVALUE_RETURN in js engine source.
  function (d, b) { return cat([makeId(d, b), "(", makeExpr(d, b), ")"]); },
  function (d, b) { return cat(["(", makeExpr(d, b), ")", "(", makeExpr(d, b), ")"]); },

  // Builtins
  function (d, b) { return Random.index(builtinProperties); },
  function (d, b) { return Random.index(builtinObjectNames); },

  // Arguments object, which can alias named parameters to the function
  function (d, b) { return "arguments"; },
  function (d, b) { return cat(["arguments", "[", makePropertyName(d, b), "]"]); },
  function (d, b) { return `${makeFunOnCallChain(d, b)}.arguments`; }, // read-only arguments object

  // Property access / index into array
  function (d, b) { return cat([makeExpr(d, b), ".", makeId(d, b)]); },
  function (d, b) { return cat([makeExpr(d, b), ".", "__proto__"]); },
  function (d, b) { return cat([makeExpr(d, b), "[", makePropertyName(d, b), "]"]); },

  // Intentionally bogus, but not quite garbage.
  function (d, b) { return makeExpr(d, b); }
];

function makeDestructuringLValue (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  d = d - 1;

  if (d < 0 || rnd(4) === 1) { return makeId(d, b); }

  if (rnd(6) === 1) { return makeLValue(d, b); }

  return (Random.index(destructuringLValueMakers))(d, b);
}

var destructuringLValueMakers = [
  // destructuring assignment: arrays
  function (d, b) {
    var len = rnd(d, b);
    if (len === 0) { return "[]"; }

    var Ti = [];
    Ti.push("[");
    Ti.push(maybeMakeDestructuringLValue(d, b));
    for (var i = 1; i < len; ++i) {
      Ti.push(", ");
      Ti.push(maybeMakeDestructuringLValue(d, b));
    }

    Ti.push("]");

    return cat(Ti);
  },

  // destructuring assignment: objects
  function (d, b) {
    var len = rnd(d, b);
    if (len === 0) { return "{}"; }
    var Ti = [];
    Ti.push("{");
    for (var i = 0; i < len; ++i) {
      if (i > 0) { Ti.push(", "); }
      Ti.push(makeId(d, b));
      if (rnd(3)) {
        Ti.push(": ");
        Ti.push(makeDestructuringLValue(d, b));
      } // else, this is a shorthand destructuring, treated as "id: id".
    }
    Ti.push("}");

    return cat(Ti);
  }
];

// Allow "holes".
function maybeMakeDestructuringLValue (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(2) === 0) { return ""; }

  return makeDestructuringLValue(d, b);
}

function makeTerm (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  return (Random.index(termMakers))(d, b);
}

var termMakers = [
  // Variable names
  function (d, b) { return makeId(d, b); },

  // Simple literals (no recursion required to make them)
  function (d, b) {
    return Random.index([
    // Arrays
      "[]", "[1]", "[[]]", "[[1]]", "[,]", "[,,]", "[1,,]",
      // Objects
      "{}", "({})", "({a1:1})",
      // Possibly-destructuring arrays
      "[z1]", "[z1,,]", "[,,z1]",
      // Possibly-destructuring objects
      "({a2:z2})",
      "function(id) { return id }",
      "function ([y]) { }",
      "(function ([y]) { })()",

      "arguments",
      "Math",
      "this",
      "length",

      '"\u03A0"' // unicode not escaped
    ]);
  },
  makeNumber,
  function (d, b) { return Random.index(["true", "false", "undefined", "null", "this"]); },
  function (d, b) { return Random.index([" \"\" ", " '' "]); },
  randomUnitStringLiteral, // unicode escaped
  function (d, b) { return Random.index([" /x/ ", " /x/g "]); },
  makeRegex
];

function makeShapeyValue (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (rnd(10) === 0) { return makeExpr(d, b); }

  var a = [
    // Numbers and number-like things
    [
      "0", "1", "2", "3", "0.1", ".2", "1.3", "4.", "5.0000000000000000000000",
      "1.2e3", "1e81", "1e+81", "1e-81", "1e4", "-0", "(-0)",
      "-1", "(-1)", "0x99", "033", "3/0", "-3/0", "0/0",
      "Math.PI",
      "0x2D413CCC", "0x5a827999", "0xB504F332", "-0x2D413CCC", "-0x5a827999", "-0xB504F332", "0x50505050", "(0x50505050 >> 1)",

      // various powers of two, with values near JSVAL_INT_MAX especially tested
      "0x10000000", "0x20000000", "0x3FFFFFFE", "0x3FFFFFFF", "0x40000000", "0x40000001"
    ],

    // Boundaries
    [
    // Boundaries of int, signed, unsigned (near +/- 2^31, +/- 2^32)
      "0x07fffffff", "0x080000000", "0x080000001",
      "-0x07fffffff", "-0x080000000", "-0x080000001",
      "0x0ffffffff", "0x100000000", "0x100000001",
      "-0x0ffffffff", "-0x100000000", "-0x100000001",

      // Boundaries of double
      "Number.MIN_VALUE", "-Number.MIN_VALUE",
      "Number.MAX_VALUE", "-Number.MAX_VALUE",

      // Boundaries of maximum safe integer
      "Number.MIN_SAFE_INTEGER", "-Number.MIN_SAFE_INTEGER",
      "-(2**53-2)", "-(2**53)", "-(2**53+2)",
      "Number.MAX_SAFE_INTEGER", "-Number.MAX_SAFE_INTEGER",
      "(2**53)-2", "(2**53)", "(2**53)+2",

      // See bug 1350097 - 1.79...e308 is the largest (by module) finite number
      "0.000000000000001", "1.7976931348623157e308"
    ],

    // Special numbers
    [ "(1/0)", "(-1/0)", "(0/0)" ],

    // String literals
    [" \"\" ", " '' ", " 'A' ", " '\\0' ", ' "use strict" '],

    // Regular expression literals
    [ " /x/ ", " /x/g " ],

    // Booleans
    [ "true", "false" ],

    // Undefined and null
    [ "(void 0)", "null" ],

    // Object literals
    [ "[]", "[1]", "[(void 0)]", "{}", "{x:3}", "({})", "({x:3})" ],

    // Variables that really should have been constants in the ecmascript spec
    [ "NaN", "Infinity", "-Infinity", "undefined" ],

    // Boxed booleans
    [ "new Boolean(true)", "new Boolean(false)" ],

    // Boxed numbers
    [ "new Number(1)", "new Number(1.5)" ],

    // Boxed strings
    [ "new String('')", "new String('q')" ],

    // Fun stuff
    [ "function(){}" ],
    [ "{}", "[]", "[1]", "['z']", "[undefined]", "this", "eval", "arguments", "arguments.caller", "arguments.callee" ],
    [ "createIsHTMLDDA()" ],

    // Actual variables (slightly dangerous)
    [ b.length ? Random.index(b) : "x" ]
  ];

  return Random.index(Random.index(a));
}

function mixedTypeArrayElem (d, b) { /* eslint-disable-line require-jsdoc */
  while (true) {
    var s = makeShapeyValue(d - 3, b);
    if (s.length < 60) { return s; }
  }
}

function makeMixedTypeArray (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  // Pick two to five values to use as array entries.
  var q = rnd(4) + 2;
  var picks = [];
  for (var i = 0; i < q; ++i) {
    picks.push(mixedTypeArrayElem(d, b));
  }

  // Create a large array literal by randomly repeating the values.
  var c = [];
  var count = loopCount();
  for (var j = 0; j < count; ++j) {
    var elem = Random.index(picks);
    // Sometimes, especially at the beginning of arrays, repeat a single value (or type) many times
    // (This is needed for shape warmup, but not for JIT warmup)
    var repeat = count === 0 ? rnd(4) === 0 : rnd(50) === 0;
    var repeats = repeat ? rnd(30) : 1;
    for (var k = 0; k < repeats; ++k) {
      c.push(elem);
    }
  }

  return `/*MARR*/[${c.join(", ")}]`;
}

function makeArrayLiteral (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (rnd(2) === 0) { return makeMixedTypeArray(d, b); }

  var elems = [];
  while (rnd(5)) elems.push(makeArrayLiteralElem(d, b));
  return `/*FARR*/[${elems.join(", ")}]`;
}

function makeArrayLiteralElem (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  switch (rnd(5)) {
    /* eslint-disable no-multi-spaces */
    case 0:  return `...${makeIterable(d - 1, b)}`; // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Spread_operator
    case 1:  return ""; // hole
    default: return makeExpr(d - 1, b);
    /* eslint-enable no-multi-spaces */
  }
}

function makeIterable (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (d < 1) { return "[]"; }

  return (Random.index(iterableExprMakers))(d, b);
}

var iterableExprMakers = Random.weighted([
  // Arrays
  { w: 1, v: function (d, b) { return `new Array(${makeNumber(d, b)})`; } },
  { w: 8, v: makeArrayLiteral },

  // A generator that yields once
  { w: 1, v: function (d, b) { return `(function() { ${directivePrologue()}yield ${makeExpr(d - 1, b)}; } })()`; } },
  { w: 1, v: function (d, b) { return `(function*() { ${directivePrologue()}yield ${makeExpr(d - 1, b)}; } })()`; } },
  // A pass-through generator
  { w: 1, v: function (d, b) { return `/*PTHR*/(function() { ${directivePrologue()}for (var i of ${makeIterable(d - 1, b)}) { yield i; } })()`; } },
  { w: 1, v: function (d, b) { return `/*PTHR*/(function*() { ${directivePrologue()}for (var i of ${makeIterable(d - 1, b)}) { yield i; } })()`; } },

  // An async function that awaits once
  { w: 1, v: function (d, b) { return `(async function() { ${directivePrologue()}await ${makeExpr(d - 1, b)}; } })()`; } },

  // A pass-through async generator
  { w: 1, v: function (d, b) { return `/*PTHR*/(async function*() { ${directivePrologue()}for (var i of ${makeIterable(d - 1, b)}) { yield i; } })()`; } },
  { w: 1, v: function (d, b) { return `/*PTHR*/(async function*() { ${directivePrologue()}for await (var i of ${makeIterable(d - 1, b)}) { yield i; } })()`; } },

  { w: 1, v: makeFunction },
  { w: 1, v: makeExpr }
]);

function makeAsmJSModule (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var interior = asmJSInterior([]);
  return `(function(stdlib, foreign, heap){ "use asm"; ${interior} })`;
}

function makeAsmJSFunction (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var interior = asmJSInterior(["ff"]);
  return `(function(stdlib, foreign, heap){ "use asm"; ${interior} })(this, {ff: ${makeFunction(d - 2, b)}}, new ${arrayBufferType()}(4096))`;
}

/* *********************************** *
 * THE ABOVE HAVE NOT BEEN CATEGORISED *
 * *********************************** */

/* *************** *
 *  INDEX          *
 * - ASM.JS        *
 * - MATH          *
 * - PROXIES (ES6) *
 * - REGEXPS       *
 * *************** */

/* ****** *
 * ASM.JS *
 * ****** */

function autoExpr (funs, avoidSubst) { /* eslint-disable-line require-jsdoc */
  return function (d, e) {
    var f = d < 1 ? funs[0] :
      rnd(50) === 0 && !e.globalEnv.sanePlease ? function (_d, _e) { return makeExpr(5, ["x"]); } :
        rnd(50) === 0 && !avoidSubst ? Random.index(anyAsmExpr) :
          Random.index(funs);
    return `(${f(d, e)})`;
  };
}

// Special rules here:
// * Parens are automatic.  (We're not testing the grammar, just the types.)
// * The first element is the "too deep" fallback, and should not recurse far.
// * We're allowed to write to some fields of |e|

var additive = ["+", "-"];
var intExpr = autoExpr(Random.weighted([
  { w: 1, v: function (d, e) { return intLiteralRange(-0x8000000, 0xffffffff); } },
  { w: 1, v: function (d, e) { return `${intExpr(d - 3, e)} ? ${intExpr(d - 3, e)} : ${intExpr(d - 3, e)}`; } },
  { w: 1, v: function (d, e) { return `!${intExpr(d - 1, e)}`; } },
  { w: 1, v: function (d, e) { return signedExpr(d - 1, e); } },
  { w: 1, v: function (d, e) { return unsignedExpr(d - 1, e); } },
  { w: 10, v: function (d, e) { return intVar(e); } }, // + "|0"  ??
  { w: 1, v: function (d, e) { return e.globalEnv.foreignFunctions.length ? `${asmFfiCall(d, e)}|0` : "1"; } },
  { w: 1, v: function (d, e) { return signedExpr(d - 2, e) + Random.index([" < ", " <= ", " > ", " >= ", " == ", " != "]) + signedExpr(d - 2, e); } },
  { w: 1, v: function (d, e) { return unsignedExpr(d - 2, e) + Random.index([" < ", " <= ", " > ", " >= ", " == ", " != "]) + unsignedExpr(d - 2, e); } },
  { w: 1, v: function (d, e) { return doubleExpr(d - 2, e) + Random.index([" < ", " <= ", " > ", " >= ", " == ", " != "]) + doubleExpr(d - 2, e); } }
]));
var intishExpr = autoExpr(Random.weighted([
  { w: 10, v: function (d, e) { return intExpr(d, e); } },
  { w: 1, v: function (d, e) { return intishMemberExpr(d, e); } },
  // Add two or more ints
  { w: 10, v: function (d, e) { return intExpr(d - 1, e) + Random.index(additive) + intExpr(d - 1, e); } },
  { w: 5, v: function (d, e) { return intExpr(d - 2, e) + Random.index(additive) + intExpr(d - 2, e) + Random.index(additive) + intExpr(d - 2, e); } },
  // Multiply by a small int literal
  { w: 2, v: function (d, e) { return `${intExpr(d - 1, e)}*${intLiteralRange(-0xfffff, 0xfffff)}`; } },
  { w: 2, v: function (d, e) { return intLiteralRange(-0xfffff, 0xfffff) + "*" + intExpr(d - 1, e); } },
  { w: 1, v: function (d, e) { return `-${intExpr(d - 1, e)}`; } },
  { w: 1, v: function (d, e) { return `${signedExpr(d - 2, e)} / ${signedExpr(d - 2, e)}`; } },
  { w: 1, v: function (d, e) { return `${unsignedExpr(d - 2, e)} / ${unsignedExpr(d - 2, e)}`; } },
  { w: 1, v: function (d, e) { return `${signedExpr(d - 2, e)} % ${signedExpr(d - 2, e)}`; } },
  { w: 1, v: function (d, e) { return `${unsignedExpr(d - 2, e)} % ${unsignedExpr(d - 2, e)}`; } }
]));
var signedExpr = autoExpr(Random.weighted([
  { w: 1, v: function (d, e) { return intLiteralRange(-0x8000000, 0x7fffffff); } },
  { w: 1, v: function (d, e) { return `~${intishExpr(d - 1, e)}`; } },
  { w: 1, v: function (d, e) { return `~~${doubleExpr(d - 1, e)}`; } },
  { w: 1, v: function (d, e) { return `${intishExpr(d - 1, e)}|0`; } }, // this isn't a special form, but it's common for a good reason
  { w: 1, v: function (d, e) { return `${ensureMathImport(e, "imul")}(${intExpr(d - 2, e)}, ${intExpr(d - 2, e)})|0`; } },
  { w: 1, v: function (d, e) { return `${ensureMathImport(e, "abs")}(${signedExpr(d - 1, e)})|0`; } },
  { w: 5, v: function (d, e) { return intishExpr(d - 2, e) + Random.index([" | ", " & ", " ^ ", " << ", " >> "]) + intishExpr(d - 2, e); } }
]));
var unsignedExpr = autoExpr(Random.weighted([
  { w: 1, v: function (d, e) { return intLiteralRange(0, 0xffffffff); } },
  { w: 1, v: function (d, e) { return `${intishExpr(d - 2, e)}>>>${intishExpr(d - 2, e)}`; } }
]));
var doublishExpr = autoExpr(Random.weighted([
  { w: 10, v: function (d, e) { return doubleExpr(d, e); } },
  { w: 1, v: function (d, e) { return doublishMemberExpr(d, e); } }
  // Read from a doublish typed array view
]));
var doubleExpr = autoExpr(Random.weighted([
  { w: 1, v: function (d, e) { return doubleLiteral(); } },
  { w: 20, v: function (d, e) { return doubleVar(e); } },
  { w: 1, v: function (d, e) { return e.globalEnv.foreignFunctions.length ? `+${asmFfiCall(d, e)}` : "1.0"; } },
  { w: 1, v: function (d, e) { return "+(1.0/0.0)"; } },
  { w: 1, v: function (d, e) { return "+(0.0/0.0)"; } },
  { w: 1, v: function (d, e) { return "+(-1.0/0.0)"; } },
  // Unary ops that return double
  { w: 1, v: function (d, e) { return `+${signedExpr(d - 1, e)}`; } },
  { w: 1, v: function (d, e) { return `+${unsignedExpr(d - 1, e)}`; } },
  { w: 1, v: function (d, e) { return `+${doublishExpr(d - 1, e)}`; } },
  { w: 1, v: function (d, e) { return `-${doublishExpr(d - 1, e)}`; } },
  // Binary ops that return double
  { w: 1, v: function (d, e) { return `${doubleExpr(d - 2, e)} + ${doubleExpr(d - 2, e)}`; } },
  { w: 1, v: function (d, e) { return `${doublishExpr(d - 2, e)} - ${doublishExpr(d - 2, e)}`; } },
  { w: 1, v: function (d, e) { return `${doublishExpr(d - 2, e)} * ${doublishExpr(d - 2, e)}`; } },
  { w: 1, v: function (d, e) { return `${doublishExpr(d - 2, e)} / ${doublishExpr(d - 2, e)}`; } },
  { w: 1, v: function (d, e) { return `${doublishExpr(d - 2, e)} % ${doublishExpr(d - 2, e)}`; } },
  { w: 1, v: function (d, e) { return `${intExpr(d - 3, e)} ? ${doubleExpr(d - 3, e)} : ${doubleExpr(d - 3, e)}`; } },
  // with stdlib
  { w: 1, v: function (d, e) { return `+${ensureMathImport(e, Random.index(["acos", "asin", "atan", "cos", "sin", "tan", "ceil", "floor", "exp", "log", "sqrt"]))}(${doublishExpr(d - 1, e)})`; } },
  { w: 1, v: function (d, e) { return `+${ensureMathImport(e, "abs")}(${doublishExpr(d - 1, e)})`; } },
  { w: 1, v: function (d, e) { return `+${ensureMathImport(e, Random.index(["atan2", "pow"]))}(${doublishExpr(d - 2, e)}, ${doublishExpr(d - 2, e)})`; } },
  { w: 1, v: function (d, e) { return ensureImport(e, "Infinity"); } },
  { w: 1, v: function (d, e) { return ensureImport(e, "NaN"); } }
]));
var externExpr = autoExpr(Random.weighted([
  { w: 1, v: function (d, e) { return doubleExpr(d, e); } },
  { w: 1, v: function (d, e) { return signedExpr(d, e); } }
]));
var intishMemberExpr = autoExpr(Random.weighted([
  { w: 1, v: function (d, e) { return `${ensureView(e, Random.index(["Int8Array", "Uint8Array"]))}[${asmIndex(d, e, 0)}]`; } },
  { w: 1, v: function (d, e) { return `${ensureView(e, Random.index(["Int16Array", "Uint16Array"]))}[${asmIndex(d, e, 1)}]`; } },
  { w: 1, v: function (d, e) { return `${ensureView(e, Random.index(["Int32Array", "Uint32Array"]))}[${asmIndex(d, e, 2)}]`; } }
]), true);
var doublishMemberExpr = autoExpr(Random.weighted([
  { w: 1, v: function (d, e) { return `${ensureView(e, "Float32Array")}[${asmIndex(d, e, 2)}]`; } },
  { w: 1, v: function (d, e) { return `${ensureView(e, "Float64Array")}[${asmIndex(d, e, 3)}]`; } }
]), true);

var anyAsmExpr = [intExpr, intishExpr, signedExpr, doublishExpr, doubleExpr, intishMemberExpr, doublishMemberExpr];

function asmAssignmentStatement (indent, env) { /* eslint-disable-line require-jsdoc */
  if (rnd(5) === 0 || !env.locals.length) {
    if (rnd(2)) {
      return `${indent + intishMemberExpr(8, env)} = ${intishExpr(10, env)};\n`;
    } else {
      return `${indent + doublishMemberExpr(8, env)} = ${doublishExpr(10, env)};\n`;
    }
  }

  var local = Random.index(env.locals);
  if (local.charAt(0) === "d") {
    return `${indent + local} = ${doubleExpr(10, env)};\n`;
  } else {
    return `${indent + local} = ${intExpr(10, env)};\n`;
  }
}

function asmFfiCall (d, e) { /* eslint-disable-line require-jsdoc */
  var argList = "";
  while (rnd(6)) {
    if (argList) { argList += ", "; }
    d -= 1;
    argList += externExpr(d, e);
  }

  return `/*FFI*/${Random.index(e.globalEnv.foreignFunctions)}(${argList})`;
}

function asmIndex (d, e, logSize) { /* eslint-disable-line require-jsdoc */
  if (rnd(2) || d < 2) { return Random.index(["0", "1", "2", "4096"]); }

  return `${intishExpr(d - 2, e)} >> ${logSize}`;
}

function asmJSInterior (foreignFunctions, sanePlease) { /* eslint-disable-line require-jsdoc */
  function mess () { /* eslint-disable-line require-jsdoc */
    if (!sanePlease && rnd(600) === 0) { return makeStatement(8, ["x"]) + "\n"; }
    if (!sanePlease && rnd(600) === 0) { return totallyRandom(8, ["x"]); }
    return "";
  }

  var globalEnv = { stdlibImported: {}, stdlibImports: "", heapImported: {}, heapImports: "", foreignFunctions: foreignFunctions, sanePlease: !!sanePlease };
  var asmFunDecl = asmJsFunction(globalEnv, "f", rnd(2) ? "signed" : "double", [rnd(2) ? "i0" : "d0", rnd(2) ? "i1" : "d1"]);
  var interior = mess() + globalEnv.stdlibImports +
                 mess() + importForeign(foreignFunctions) +
                 mess() + globalEnv.heapImports +
                 mess() + asmFunDecl +
                 mess() + "  return f;" +
                 mess();
  return interior;
}

// ret in ["signed", "double", "void"]
// args looks like ["i0", "d1", "d2"] -- the first letter indicates int vs double
function asmJsFunction (globalEnv, name, ret, args) { /* eslint-disable-line require-jsdoc */
  var s = `  function ${name}(${args.join(", ")})\n`;
  s += "  {\n";
  s += parameterTypeAnnotations(args);

  // Add local variables
  var locals = args;
  while (rnd(2)) {
    var isDouble = rnd(2);
    var local = (isDouble ? "d" : "i") + locals.length;
    s += `    var ${local} = ${isDouble ? doubleLiteral() : "0"};\n`;
    locals.push(local);
  }

  var env = { globalEnv: globalEnv, locals: locals, ret: ret };

  // Add assignment statements
  if (locals.length) {
    while (rnd(5)) {
      s += asmStatement("    ", env, 6);
    }
  }

  // Add the required return statement at the end of the function
  if (ret !== "void" || rnd(2)) { s += asmReturnStatement("    ", env); }

  s += "  }\n";

  return s;
}

function asmReturnStatement (indent, env) { /* eslint-disable-line require-jsdoc */
  var ret = rnd(2) ? env.ret : Random.index(["double", "signed", "void"]); /* eslint-disable-line no-unused-vars */
  if (env.ret === "double") {
    return `${indent}return +${doublishExpr(10, env)};\n`;
  } else if (env.ret === "signed") {
    return `${indent}return (${intishExpr(10, env)})|0;\n`;
  } else { // (env.ret == "void")
    return `${indent}return;\n`;
  }
}

function asmStatement (indent, env, d) { /* eslint-disable-line require-jsdoc */
  if (!env.globalEnv.sanePlease && rnd(100) === 0) { return makeStatement(3, ["x"]); }

  if (rnd(5) === 0 && d > 0) {
    return `${indent}{\n${asmStatement(indent + "  ", env, d - 1)}${indent}}\n`;
  }
  if (rnd(20) === 0 && d > 3) {
    return asmSwitchStatement(indent, env, d);
  }
  if (rnd(10) === 0) {
    return asmReturnStatement(indent, env);
  }
  if (rnd(50) === 0 && env.globalEnv.foreignFunctions.length) {
    return asmVoidCallStatement(indent, env);
  }
  if (rnd(100) === 0) { return ";"; }
  return asmAssignmentStatement(indent, env);
}

function asmSwitchStatement (indent, env, d) { /* eslint-disable-line require-jsdoc */
  var s = `${indent}switch (${signedExpr(4, env)}) {\n`;
  while (rnd(3)) {
    s += `${indent}  case ${rnd(5) - 3}:\n`;
    s += asmStatement(`${indent}    `, env, d - 2);
    if (rnd(4)) { s += `${indent}    break;\n`; }
  }
  if (rnd(2)) {
    s += `${indent}  default:\n`;
    s += asmStatement(`${indent}    `, env, d - 2);
  }
  s += `${indent}}\n`;
  return s;
}

function asmVoidCallStatement (indent, env) { /* eslint-disable-line require-jsdoc */
  return `${indent + asmFfiCall(8, env)};\n`;
}

/* **** *
 * MATH *
 * **** */

function makeMathExpr (d, b, i) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  // As depth decreases, make it more likely to bottom out
  if (d < rnd(5)) {
    if (rnd(4)) {
      return Random.index(b);
    }
    return Random.index(numericVals);
  }

  if (rnd(500) === 0 && d > 0) { return makeExpr(d - 1, b); }

  function r () { return makeMathExpr(d - 1, b, i); } /* eslint-disable-line require-jsdoc */

  // Frequently, coerce both the inputs and outputs to the same "numeric sub-type"
  // (asm.js formalizes this concept, but JITs may have their own variants)
  var commonCoercion = rnd(10);
  function mc (expr) { /* eslint-disable-line require-jsdoc */
    switch (rnd(3) ? commonCoercion : rnd(10)) {
      /* eslint-disable no-multi-spaces */
      case 0:  return `( + ${expr})`;          // f64 (asm.js)
      case 1:  return `Math.fround(${expr})`;  // f32
      case 2:  return `(${expr} | 0)`;         // i32 (asm.js)
      case 3:  return `(${expr} >>> 0)`;       // u32
      default: return expr;
      /* eslint-enable no-multi-spaces */
    }
  }

  if (i > 0 && rnd(10) === 0) {
    // Call a *lower-numbered* mathy function. (This avoids infinite recursion.)
    return mc(`mathy${rnd(i)}(${mc(r())}, ${mc(r())})`);
  }

  if (rnd(20) === 0) {
    return mc(`(${mc(r())} ? ${mc(r())} : ${mc(r())})`);
  }

  switch (rnd(4)) {
    /* eslint-disable no-multi-spaces */
    case 0:  return mc(`(${mc(r())}${Random.index(binaryMathOps)}${mc(r())})`);
    case 1:  return mc(`(${Random.index(leftUnaryMathOps)}${mc(r())})`);
    case 2:  return mc(`Math.${Random.index(unaryMathFunctions)}(${mc(r())})`);
    default: return mc(`Math.${Random.index(binaryMathFunctions)}(${mc(r())}, ${mc(r())})`);
    /* eslint-enable no-multi-spaces */
  }
}

function makeMathFunction (d, b, i) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  var ivars = ["x", "y"];
  if (rnd(10) === 0) {
    // Also use variables from the enclosing scope
    ivars = ivars.concat(b);
  }
  return `(function(x, y) { ${directivePrologue()}return ${makeMathExpr(d, ivars, i)}; })`;
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

/* ************* *
 * PROXIES (ES6) *
 * ************* */

function makeProxyHandler (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  return `${makeProxyHandlerFactory(d, b)}(${makeExpr(d - 3, b)})`;
}

function makeProxyHandlerFactory (d, b) { /* eslint-disable-line require-jsdoc */
  if (rnd(TOTALLY_RANDOM) === 2) return totallyRandom(d, b);

  if (d < 1) { return "({/*TOODEEP*/})"; }

  try { // in case we screwed Object.prototype, breaking proxyHandlerProperties
    var preferred = Random.index(["empty", "forward", "yes", "no", "bind", "throwing"]);
    var fallback = Random.index(["empty", "forward"]);
    var fidelity = rnd(10);

    var handlerFactoryText = "(function handlerFactory(x) {";
    handlerFactoryText += "return {";

    if (rnd(2)) {
      // handlerFactory has an argument 'x'
      bp = b.concat(["x"]);
    } else {
      // handlerFactory has no argument
      handlerFactoryText = handlerFactoryText.replace(/x/, "");
      bp = b;
    }

    for (var p in proxyHandlerProperties) {
      var funText;
      if (proxyHandlerProperties[p][preferred] && rnd(10) <= fidelity) {
        funText = proxyHandlerProperties[p][preferred];
      } else {
        switch (rnd(7)) {
          /* eslint-disable no-multi-spaces */
          case 0:  funText = makeFunction(d - 3, bp); break;
          case 1:  funText = "undefined"; break;
          case 2:  funText = "function() { throw 3; }"; break;
          default: funText = proxyHandlerProperties[p][fallback];
          /* eslint-enable no-multi-spaces */
        }
      }
      handlerFactoryText += `${p}: ${funText}, `;
    }

    handlerFactoryText += "}; })";

    return handlerFactoryText;
  } catch (e) {
    return "({/* :( */})";
  }
}

/* ******* *
 * REGEXPS *
 * ******* */

function makeRegexUseBlock (d, b, rexExpr, strExpr) { /* eslint-disable-line require-jsdoc */
  var rexpair = regexPattern(10, false);
  var rexpat = rexpair[0];
  var str = rexpair[1][rnd(POTENTIAL_MATCHES)];

  if (!rexExpr) rexExpr = rnd(10) === 0 ? makeExpr(d - 1, b) : toRegexSource(rexpat);
  if (!strExpr) strExpr = rnd(10) === 0 ? makeExpr(d - 1, b) : simpleSource(str);

  var bv = b.concat(["s", "r"]);

  return (`/*RXUB*/var r = ${rexExpr}; ` +
      `var s = ${strExpr}; ` +
      "print(" +
      Random.index([
        "r.exec(s)",
        "uneval(r.exec(s))",
        "r.test(s)",
        "s.match(r)",
        "uneval(s.match(r))",
        "s.search(r)",
        `s.replace(r, ${makeReplacement(d, bv)}${rnd(3) ? "" : `, ${simpleSource(randomRegexFlags())}`})`,
        "s.split(r)"
      ]) +
      "); " +
      (rnd(3) ? "" : "print(r.lastIndex); ")
  );
}

function makeRegexUseExpr (d, b) { /* eslint-disable-line require-jsdoc */
  var rexpair = regexPattern(8, false);
  var rexpat = rexpair[0];
  var str = rexpair[1][rnd(POTENTIAL_MATCHES)];

  var rexExpr = rnd(10) === 0 ? makeExpr(d - 1, b) : toRegexSource(rexpat);
  var strExpr = rnd(10) === 0 ? makeExpr(d - 1, b) : simpleSource(str);

  return `/*RXUE*/${rexExpr}.exec(${strExpr})`;
}

function makeRegex (d, b) { /* eslint-disable-line require-jsdoc */
  var rexpair = regexPattern(8, false);
  var rexpat = rexpair[0];
  var rexExpr = toRegexSource(rexpat);
  return rexExpr;
}

function makeReplacement (d, b) { /* eslint-disable-line require-jsdoc */
  switch (rnd(3)) {
    /* eslint-disable no-multi-spaces */
    case 0:  return Random.index(["''", "'x'", "'\\u0341'"]);
    case 1:  return makeExpr(d, b);
    default: return makeFunction(d, b);
    /* eslint-enable no-multi-spaces */
  }
}

export {
  bp,
  makeAsmJSFunction,
  makeAsmJSModule,
  makeBoolean,
  makeExpr,
  makeFunction,
  makeFunctionBody,
  makeGlobal,
  makeId,
  makeIterable,
  makeMathFunction,
  makeMixedTypeArray,
  makePropertyDescriptor,
  makePropertyName,
  makeRegex,
  makeRegexUseBlock,
  makeScript,
  makeScriptForEval,
  makeStatement
};
