# Centralize TUI parsing into named markers + declarative extractors

## When to use

Any project that has to consume a third-party terminal UI as its
source of truth. The UI is built for humans and changes whenever the
upstream team feels like it; your parser will be wrong eventually. The
question is whether fixing it is a one-line edit or a multi-file
refactor.

## The shape

Three layers, each with one concern:

1. **Markers** — named line classifiers. Every regex that matches a
   single rendered line lives in one file with a stable name, a
   one-line `purpose`, and the pattern. No inline regexes anywhere
   else.

   ```ts
   export const MARKERS = Object.freeze({
     userEcho: { name: 'userEcho', purpose: '...', pattern: /^\s*❯\s+\S/u },
     assistantStart: { name: 'assistantStart', purpose: '...', pattern: /^\s*⏺\s+/u },
     tipLine: { name: 'tipLine', purpose: '...', pattern: /^\s*Tip:/iu },
     // ...
   });
   ```

2. **Extractors** — declarative configs, one per emitted event type:

   ```ts
   const ASSISTANT_TEXT: BlockExtractor = {
     name: 'assistant-text',
     start: 'assistantStart',
     excludeStart: 'toolCall',
     stops: ['userEcho', 'assistantStart', 'reasoningStart', 'tipLine', ...],
     skips: ['spinnerLine'],
     transforms: [trimRightPerLine, collapseBlankRuns, trimEdgeBlanks],
     emit({ text, state }) {
       const delta = computeDelta(state.emittedAssistantText, text);
       return delta ? { events: [{ type: 'text_delta', text: delta }], stateUpdate: {...} } : ...;
     },
   };
   ```

3. **Engine** — runs the catalogue. No regexes; just orchestration.
   Loops through block extractors first (which anchor on a marker line
   and read forward with stops/skips), then line extractors (which
   walk all lines emitting per-line events).

## Why this beats inline regexes

- **Diffs are tight.** Most fixes are one line in one file.
- **Each extractor is independently testable** without spinning the
  engine. Write a `parse-one-extractor` helper.
- **Replay fixtures become first-class.** Capture a real UI session
  once, save as JSON, replay through the engine to assert events. No
  more debating "is this the right behavior?".
- **Version pinning is a free add-on.** Map UI versions → marker sets
  later; the engine doesn't change.

## Where it shows up in june1815

- `src/pty/tui/markers.ts` — every line pattern, named
- `src/pty/tui/extractors.ts` — one config per event type
- `src/pty/tui/engine.ts` — runs them
- `src/pty/tui/transforms.ts` — pure text post-processors
- `src/pty/tui/anchoring.ts` — finds the active region
- `tests/fixtures/tui-recordings/*.json` — captured byte streams
- `tests/unit/pty/tui-replay*.test.ts` — replay them through the engine

## Watch out for

- **Naming discipline.** `userEcho` vs `userEchoPlaceholder` vs
  `assistantStart` vs `toolCall` — a wrong classification cascades.
  Each marker should have at least one assertion that the boundary is
  correct.
- **Order of extractors matters.** Block extractors run first so they
  can claim spans of lines; line extractors then walk everything that
  remains.
- **Don't bake snapshot timing into the parser.** That belongs to the
  conversation layer (debounce + max-burst). The parser is stateful
  over snapshot history but doesn't decide when to take snapshots.
