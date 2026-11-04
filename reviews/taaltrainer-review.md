# Independent TaalTrainer review

Reviewer: fresh Sol session. Scope: complete current repository, including untracked runtime modules, tests, workflow and documentation, compared with baseline `f715552`. No source or tests were edited.

Verdict: changes requested. Two reproducible P2 playback defects block approval of the current release. The existing offline and focused Chromium suites pass, but do not cover these paths.

## Blockers

### R1. P2: recorder actions clear a lesson's audio without cancelling the lesson

Locations: `js/app.js:496`, `js/app.js:589`, `js/app.js:594`, `js/audio/tabla-worklets.js:188`.

`toggleRecording()` and `clearTake()` call `stopReplay()`, which unconditionally calls the shared `engine.panic()`, even when no replay is active. The worklet's panic handler deletes every queued voice. Lessons enqueue their entire count-in and call in advance, but neither recorder action cancels the corresponding lesson timers or changes the lesson phase. A learner can therefore be prompted and graded after the remaining call has been silently removed.

Concrete UI reproduction:

1. Choose lesson 1 and click Play the call.
2. Click Record during the count-in, before the call finishes.
3. The recorder sends a global audio panic while the lesson continues. The existing lesson callback still arms the response at its planned 5,250 ms offset.
4. For the Clear variant, first make and stop a nonempty take so Clear is enabled. Start a lesson and click Clear during its count-in or call. The same global panic removes that call while its timers remain armed.

An executable VM harness ran the actual `js/app.js` wiring with injectable DOM/audio/timer substitutes. Observations for lesson 1 were:

```text
After Play the call: phase=listening, queuedAudioStrokes=5, pendingLessonTimers=3
After Record:        phase=listening, queuedAudioStrokes=0, pendingLessonTimers=3
After Clear:         phase=listening, queuedAudioStrokes=0, pendingLessonTimers=3
```

Additional headless Chromium instrumentation of the real application confirmed that Record adds one shared-engine panic and leaves the lesson's listening status unchanged, with no uncaught browser error. The VM queue observation, worklet panic implementation and retained lesson callbacks establish this defect; it does not rely on subjective listening.

Suggested correction: give cancellation explicit audio ownership. Recorder actions should panic only an actual replay, or intentionally cancel another transport together with its timers and UI state. Recording must not leave a lesson active after deleting its call. Cover both Record-during-call and enabled-Clear-during-call in executable application tests.

### R2. P2: supported long roll takes silently exceed the worklet queue budget

Locations: `js/app.js:444`, `js/app.js:571`, `js/audio/tabla-worklets.js:146`, `js/audio/tabla-worklets.js:194`.

The recorder accepts up to 2,048 bol events within five minutes. Replay posts every captured event immediately. A `tirakita` expands into three transient-family voices and one tonic-family voice, whereas the new 2,048 queued-voice limit applies separately to each worklet family. A valid take can therefore exceed the transient budget well before it exceeds the recorder's event or duration limit. Extra audio messages are silently discarded; notation still contains those events.

Concrete reproduction: capture 1,025 tirakita events at 250 ms intervals, from 0 through 256,000 ms. This is inside both advertised recorder limits. Replay expands these events into 4,100 messages: 3,075 transient hits and 1,025 tonic hits. Only 2,048 transient voices are retained. Their final queued timestamp is 170.705 seconds, although the final roll expects transient hits through 256.26 seconds. Later rolls lose their three transient components and retain only their closing tonic stroke.

This bounded reproducer ran the current worklet source in the same native-shaped VM configuration used by the regression tests, with a global clock and no instance clock:

```sh
node --input-type=module <<'NODE'
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolveHits } from './js/engine/bol.js';
const processors = {};
const scope = {
  AudioWorkletProcessor: class { constructor() { this.port = {}; } },
  sampleRate: 48000,
  currentTime: 0,
  registerProcessor: (name, Processor) => processors[name] = Processor
};
vm.runInNewContext(readFileSync('./js/audio/tabla-worklets.js', 'utf8'), scope);
const saturated = new processors['taal-transient']();
for (let event = 0; event < 1025; event++) {
  for (const hit of resolveHits('tirakita', 0.15 + event * 0.25)) {
    if (hit.family === 'transient') {
      saturated.onMessage({ type: 'hit', when: hit.when, params: hit.params });
    }
  }
}
const queued = saturated.voices.length;
scope.currentTime = 256.15;
const control = new processors['taal-transient']();
for (const hit of resolveHits('tirakita', 256.15)) {
  if (hit.family === 'transient') {
    control.onMessage({ type: 'hit', when: hit.when, params: hit.params });
  }
}
const peak = (processor) => {
  const channel = new Float32Array(128);
  processor.process([], [[channel]]);
  return Math.max(...channel.map(Math.abs));
};
console.log({ queued, saturatedPeak: peak(saturated), controlPeak: peak(control) });
NODE
```

Observed result: `queued=2048`, `saturatedPeak=0`, `controlPeak=0.7539425492286682`. The last expected transient roll is absent, while the same roll produces signal when its messages were accepted.

Suggested correction: refill replay through a bounded lookahead instead of enqueuing a full take, or reconcile capture limits with expanded per-family hit budgets and explicitly report any smaller supported limit. Do not silently discard otherwise supported recording content. Retain the separate sounding-voice cap.

## Optional observations

### O1. P3: finite but unsafe clock indices can still make the scheduling loop unbounded

Locations: `js/engine/clock.js:42`, `js/engine/clock.js:47`.

`hitsInWindow(getTaal('teentaal'), 60, 0, 1e16, 1e16)` should return an empty half-open window. Instead, floating-point rounding gives identical first and last indices and `n + 1 === n`. With the new infinite cycle limit, the loop never advances. A VM timeout of 50 ms reliably raised `ERR_SCRIPT_EXECUTION_TIMEOUT`; the width guard does not help because the supplied window has zero width.

This is not reachable through ordinary slider-controlled playback, so it is optional numerical hardening, not an additional release blocker. Return early for empty/reversed windows and reject unsafe integer beat indices or bound iteration count independently of increment precision.

### O2. P3: carry the new adaptation and tempo caveats into learner-facing copy

Locations: `js/engine/lessons.js:126`, `index.html:194`.

The taal selector now labels the twelve-beat loop as Ektaal-inspired, but lesson 11 still presents the same adapted phrase as `Ektaal, twelve beats` without an adaptation caveat. Its label and blurb should make the same distinction as the selector. The recorder paragraph also says its grid follows the taal player's tempo, whereas the implementation now intentionally freezes the tempo at recording start. README describes the new behavior accurately; the in-page paragraph should match it.

## Checks performed

Commands below were run in the repository unless otherwise noted:

```sh
node --version
git status --short
git diff --stat
git diff f715552 --stat
git diff --check
npm test
npm run test:coverage
node --test tests/regressions.test.js
```

Results: Node `v24.16.0`; 154 of 154 offline tests passed; the focused regression file passed 32 of 32 tests; `git diff --check` reported no whitespace errors. Instrumented engine/audio modules reported 97.72% line, 77.85% branch and 88.98% function coverage. That report does not include `js/app.js`, so it is not whole-application coverage.

From the sibling pipeline directory, with its already-installed Playwright dependency:

```sh
node --test --test-name-pattern='Web Audio|long lesson|changing a lesson|taaltrainer renders' tests/browser/functional.test.js
```

All four selected Chromium tests passed: real finite nonzero worklet signal, long response grading, sequential lesson/recorder cancellation, and phone/desktop overflow checks. Chrome ran headlessly with an empty disposable context, muted output and blocked external requests. No account profile was used.

Additional `node --input-type=module` heredoc checks exercised the actual application wiring with VM substitutes, the native-shaped roll queue saturation with a nonzero control, the unsafe-index case under a 50 ms VM timeout, and instrumented headless application transport actions. A one-time browser analyser comparison sampled zero in both control and Record cases and was inconclusive; it was not used as waveform evidence for R1. These checks wrote no source or test files and closed their own browsers and servers.

The positive changes are supported by the passing tests: native global worklet clock use, preservation of normal future lesson strokes, loops past 64 cycles, cancelled callback guards, retryable initialization, the full response duration and captured recorder tempo. Human listening, other browser engines, real touch latency, remote CI and any contest or release action were outside this review.

Approval remains withheld until R1 and R2 are corrected and their focused regressions pass.
