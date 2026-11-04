# Fresh StepCheck code review

Verdict: request changes. There is one P1 algebraic soundness blocker and one P2 mathematical rendering blocker. Both exist in baseline `10bd69a` and remain in the current repository. The upgrade fixes several other defects, but the passing suite is not approval of the complete checker.

The review covered the complete current JavaScript runtime, all five test files, HTML, both stylesheets, README, NOTES, ENGINEERING and the added workflow. The untracked domain module and regression tests were reviewed, not omitted from the baseline comparison. No source or tests were modified, and no helpers, accounts, external submissions or remote writes were used.

## Blockers

### B1. P1: symbolic absolute-value splits introduce solutions

Locations: `js/rules.js:792`, `js/rules.js:796`, `js/rules.js:1025`.

The absolute-value split checks whether the other side is a negative constant, but does not require a symbolic other side to be nonnegative. It then accepts both sign cases without retaining the necessary sign condition.

Concrete reproduction:

```js
checkPair('|x| = -x', 'x = -x or x = x')
// ok: true, ruleId: 'abs', conditional: false, conditions: []
```

The previous equation is true only for `x <= 0`. The new disjunction contains the tautology `x = x`, so it is true for every real `x`. At the exact rational assignment `x = 1`, the previous equation is false and the accepted current step is true. The two-variable version, `|x| = y` to `x = y or x = -y`, is also accepted unconditionally.

This is reachable through the actual Free practice form. Headless Chromium produced two ladder rows and the feedback `Holds by Absolute Value Rule`, without any retained domain note. The error is not confined to a developer API.

Required resolution: prove the other side is nonnegative from supported explicit or inherited conditions before accepting a split, or retain an equivalent necessary sign condition on its conclusions. Do not silently convert a conditional split into an unconditional equivalence. Add exact regressions for symbolic negative right sides and confirm the actual form rejects the invalid unconditional move.

Baseline status: inherited. The same constant-only check and unconditional acceptance are present in baseline `js/rules.js:785` and `js/rules.js:790`.

### B2. P2: nested powers lose grouping in displayed and plain mathematics

Locations: `js/render.js:99`, `js/parse.js:463`.

Both printers wrap a power's base only when its precedence is less than that of a power. An inner power has equal precedence, so the parentheses required by `(x^2)^3` are removed.

Concrete reproduction:

```js
parseAndRender('(x^2)^3 = 64').html
// <i class="mv">x</i><sup class="mexp">2</sup><sup class="mexp">3</sup>...64
astToPlain(parseStep('(x^2)^3 = 64').ast)
// 'x^2^3 = 64'
```

The browser renders the two superscripts side by side, as `x^23 = 64`, not `(x^2)^3 = 64`. A component screenshot and DOM measurements confirmed zero parenthesis elements and equal vertical positions for both superscripts. The parsed original has exponent 6, so `x = 2` satisfies it; the displayed exponent 23 does not. This is a supported power-rule input, including an existing positive engine test, not an unsupported expression.

The plain result also fails to parse back, with the nested-exponent error. Conditions involving nested powers can therefore be printed in syntax that the checker itself does not accept.

Required resolution: preserve grouping around nested-power bases in both printers, and test the browser-rendered structure plus plain-text round trips. Checking canonical equality alone does not verify that the displayed statement has the same meaning.

Baseline status: inherited. The same wrapping logic is present in baseline `js/render.js:94` and `js/parse.js:452`.

## Optional observations

### O1. P2: inherited nonzero conditions are unavailable inside or-branch checks

Locations: `js/rules.js:969`, `js/rules.js:970`, `js/rules.js:634`.

`orToOr` constructs temporary equation steps without copying the inherited conditions. Consequently, the variable-scaling check sees only newly supplied options, even when the enclosing prepared step already has the required denominator restriction.

```js
prepareStep('x/y = 1 or x/y = 2').conditions.map(conditionText)
// ['y != 0']
checkPair('x/y = 1 or x/y = 2', 'x = y or x = 2y').ok
// false
checkPair('x/y = 1 or x/y = 2', 'x = y or x = 2y', { nonzero: ['y'] }).ok
// true
```

This is a functional regression introduced by adding condition-dependent licensing without passing the existing conditions into the temporary branch steps. Both branches in this reproduction have the same denominator restriction, so there is no ambiguity about its scope. Pass the appropriate inherited conditions through branch checks and add a chained regression. This is nonblocking for soundness because it rejects a valid move, and the documented subset explicitly permits conservative rejections.

### O2. P3: the documented character maximum is not applied to every input

Locations: `js/parse.js:381`, `js/parse.js:383`, `js/parse.js:26`, `README.md:37`.

`parseStep` trims before tokenization and returns early for `no solution`. The character guard is only in the tokenizer. A 2,058-character `no` plus whitespace plus `solution` input is accepted, as is a 2,050-character padded `x`, despite the documented 2,048 input-character maximum. The ordinary 2,049-character variable run is correctly rejected.

Either enforce the input limit before trimming and the special-case return, or describe the narrower normalized-input limit accurately. The small reproductions completed promptly; this review does not claim a demonstrated denial of service.

## Verification and limits of the verdict

- Runtime was verified as Node `v24.16.0`.
- `npm test` passed all 117 tests, with no skips or failures.
- Coverage execution also passed all 117 tests. Reported coverage was 95.08% of lines, 86.22% of branches and 94.27% of functions. Coverage does not establish soundness.
- Four targeted shared Chromium tests passed: actual first-challenge completion and undo, invalid-root and huge-exponent rejection, the complete quadratic derivation with visible assumptions, and phone/desktop overflow checks.
- An additional disposable-Chromium probe reproduced B1 through the real form and visually confirmed B2. It used an empty context, a process-local HTTP server and a route restriction to the local test origin. No screenshot file was left behind.
- A bounded exact-rational expression probe considered 552 distinct expression pairs, accepted 13, and made 255 comparisons on retained domains without finding another value mismatch. These samples are diagnostic evidence, not affirmative proof of the remaining engine.
- Existing negative-power, cancelled-domain, zero-factor, exact-division, escaping and expansion-limit regressions pass. A 512-token unary chain and a 512-token radical chain also completed without an uncaught error. Arbitrary resource exhaustion, other browsers, remote CI and general satisfiability of symbolic assumptions were not established.
- The current 117-test and runtime-version claims in the documentation match the local run. No claim of human educational results or contest eligibility was inferred from those tests.

No implementation changes were made. Fix B1 and B2 before treating this complete-current-repository review as approval. The optional findings can be addressed separately.

## Exact test and reproduction commands

From the StepCheck repository:

```sh
node --version
set -o pipefail
npm test | tail -n 15
npm run test:coverage | tail -n 22
```

From the sibling `ysws_and_rewards_pipeline` directory:

```sh
node --test '--test-name-pattern=StepCheck|^stepcheck' tests/browser/functional.test.js
```

The consolidated exact reproduction command was run from StepCheck and printed the discrepancies described above. Its successful exit is not an assertion that the checker is correct.

```sh
node --input-type=module <<'JS'
import { checkPair, prepareStep } from './js/rules.js';
import { parseStep, astToPlain } from './js/parse.js';
import { parseAndRender } from './js/render.js';
import { Rat, evalAstRat } from './js/algebra.js';
import { conditionText } from './js/domain.js';
const previous='|x| = -x', current='x = -x or x = x';
const verdict=checkPair(previous,current);
const env={x:Rat.int(1)};
const holds=eq=>evalAstRat(eq.a,env).isEqual(evalAstRat(eq.b,env));
const nested='(x^2)^3 = 64';
const plain=astToPlain(parseStep(nested).ast);
const branchPrevious='x/y = 1 or x/y = 2', branchCurrent='x = y or x = 2y';
const longNone='no'+' '.repeat(2048)+'solution';
const padded=' '.repeat(2049)+'x';
console.log(JSON.stringify({
  absoluteValue:{ok:verdict.ok,conditional:verdict.conditional,conditions:verdict.conditions.map(conditionText),previousAt1:holds(parseStep(previous).ast),currentAt1:parseStep(current).branches.some(holds)},
  nestedPower:{plain,roundTrip:prepareStep(plain).kind,html:parseAndRender(nested).html},
  branches:{inherited:prepareStep(branchPrevious).conditions.map(conditionText),ok:checkPair(branchPrevious,branchCurrent).ok,redeclared:checkPair(branchPrevious,branchCurrent,{nonzero:['y']}).ok},
  limits:[longNone,padded].map(raw=>({length:raw.length,kind:prepareStep(raw).kind}))
},null,2));
JS
```

The inherited-blocker checks read baseline blobs without commit metadata:

```sh
git cat-file blob 10bd69a:js/rules.js | nl -ba | sed -n '774,803p'
git cat-file blob 10bd69a:js/render.js | nl -ba | sed -n '89,102p'
git cat-file blob 10bd69a:js/parse.js | nl -ba | sed -n '448,456p'
```
