/**
 * Pure state machine for the local (App-side) jog button state — see
 * design.md → "Jog-Zustandsmaschine (App, lokal in JogControls)".
 *
 * Four statuses (`idle` / `jogging_forward` / `jogging_backward` / `blocked`)
 * plus internal held-flags for each button — the held-flags are what let the
 * machine distinguish "both buttons were released and one freshly pressed"
 * from "the other button is still physically held" (AC-4's second clause,
 * fixed here after `qa-report.md` → BUG-1: a bare 3-status enum has no way
 * to remember that a button is still down once the *other* button's press
 * forced a stop).
 *
 * This file has no side effects (no BLE calls, no timers): it does not send
 * JOG/STOP commands itself — a sibling task (T7, JogControls) wires the
 * actual BLE sending to the transitions produced here.
 */

import { useCallback, useReducer } from 'react';

export type JogStatus = 'idle' | 'jogging_forward' | 'jogging_backward' | 'blocked';

export type JogEvent =
  | { type: 'PRESS_FORWARD' }
  | { type: 'RELEASE_FORWARD' }
  | { type: 'PRESS_BACKWARD' }
  | { type: 'RELEASE_BACKWARD' };

/**
 * The reducer's real state: `status` alone can no longer answer "is the
 * other button still held?", so it travels alongside two held-flags. Kept
 * exported so the test file can construct fixtures directly.
 */
export type InternalState = {
  status: JogStatus;
  forwardHeld: boolean;
  backwardHeld: boolean;
};

export const initialJogState: InternalState = {
  status: 'idle',
  forwardHeld: false,
  backwardHeld: false,
};

/**
 * Exhaustive over all 4 statuses × 4 events (16 combinations) — every
 * combination is an explicit row, none left to an implicit fallthrough, even
 * the ones that are unreachable given the held-flags invariant (e.g.
 * `PRESS_FORWARD` while `idle` with `backwardHeld === true` cannot actually
 * happen — `backwardHeld` only becomes true via `jogging_backward` or
 * `blocked`, and both of those are handled by their own switch cases, never
 * by falling through to `idle`'s). Those get defensive, sensible behavior
 * (stay put) rather than being left unhandled.
 *
 * AC-4/EC-2: pressing the second direction while the first is held is a
 * stop, never a direction switch. The second half of AC-4 — "keine Richtung
 * fährt weiter, bis beide Tasten losgelassen und eine erneut gedrückt
 * wird" — is the `blocked` status below: it only clears to `idle` once
 * *both* held-flags are false, and a re-press while still `blocked` (either
 * button, held-flag already true or freshly set) stays `blocked` instead of
 * starting motion (qa-report.md → BUG-1).
 */
export function jogStateReducer(state: InternalState, event: JogEvent): InternalState {
  const { status, forwardHeld, backwardHeld } = state;

  switch (status) {
    case 'idle':
      // Invariant here: forwardHeld === false, backwardHeld === false.
      switch (event.type) {
        case 'PRESS_FORWARD':
          return { status: 'jogging_forward', forwardHeld: true, backwardHeld };
        case 'PRESS_BACKWARD':
          return { status: 'jogging_backward', forwardHeld, backwardHeld: true };
        case 'RELEASE_FORWARD':
          // No-op: spurious/late release, nothing engaged.
          return { status, forwardHeld: false, backwardHeld };
        case 'RELEASE_BACKWARD':
          // No-op, mirror.
          return { status, forwardHeld, backwardHeld: false };
      }
      break;

    case 'jogging_forward':
      // Invariant here: forwardHeld === true, backwardHeld === false.
      switch (event.type) {
        case 'RELEASE_FORWARD':
          // AC-2: release stops.
          return { status: 'idle', forwardHeld: false, backwardHeld };
        case 'PRESS_BACKWARD':
          // AC-4 (first half): second direction pressed while forward is
          // held -> immediate stop, not a direction switch. Both held-flags
          // are now true, which is what lets `blocked` later require both
          // to clear before anything can move again.
          return { status: 'blocked', forwardHeld, backwardHeld: true };
        case 'PRESS_FORWARD':
          // No-op: already jogging forward (e.g. duplicate press event).
          return { status, forwardHeld: true, backwardHeld };
        case 'RELEASE_BACKWARD':
          // Defensive no-op: backward was never actually engaged from this
          // state (unreachable given the invariant above), harmless either
          // way.
          return { status, forwardHeld, backwardHeld: false };
      }
      break;

    case 'jogging_backward':
      // Invariant here: backwardHeld === true, forwardHeld === false.
      switch (event.type) {
        case 'RELEASE_BACKWARD':
          return { status: 'idle', forwardHeld, backwardHeld: false };
        case 'PRESS_FORWARD':
          // Mirror of the forward case above.
          return { status: 'blocked', forwardHeld: true, backwardHeld };
        case 'PRESS_BACKWARD':
          // No-op: already jogging backward.
          return { status, forwardHeld, backwardHeld: true };
        case 'RELEASE_FORWARD':
          // Defensive no-op, mirror.
          return { status, forwardHeld: false, backwardHeld };
      }
      break;

    case 'blocked':
      // Invariant here: at least one of forwardHeld/backwardHeld is true —
      // `blocked` is only entered with both true, and only a RELEASE_*
      // clears one at a time.
      switch (event.type) {
        case 'RELEASE_FORWARD':
          // BUG-1 fix (AC-4 second half): only clear to `idle` once BOTH
          // buttons have been released — stay `blocked` while backward is
          // still held.
          return {
            status: backwardHeld ? 'blocked' : 'idle',
            forwardHeld: false,
            backwardHeld,
          };
        case 'RELEASE_BACKWARD':
          // Mirror.
          return {
            status: forwardHeld ? 'blocked' : 'idle',
            forwardHeld,
            backwardHeld: false,
          };
        case 'PRESS_FORWARD':
          // BUG-1: this is the exact repro — re-pressing forward while
          // backward is still held (or re-pressing an already-held forward)
          // must NOT start motion. Stays `blocked`.
          return { status, forwardHeld: true, backwardHeld };
        case 'PRESS_BACKWARD':
          // Mirror.
          return { status, forwardHeld, backwardHeld: true };
      }
      break;
  }

  return state;
}

/**
 * Thin hook wrapping `useReducer(jogStateReducer, initialJogState)`,
 * exposing the four button-facing callbacks a component needs plus the
 * public `status`. Sends no BLE commands itself — that wiring is a sibling
 * task's job (T7, JogControls). The internal held-flags never leave this
 * hook — `JogControls` only ever sees `status`, so its consumer-facing shape
 * is unchanged by this fix.
 */
export function useJogState(): {
  status: JogStatus;
  pressForward: () => void;
  releaseForward: () => void;
  pressBackward: () => void;
  releaseBackward: () => void;
} {
  const [state, dispatch] = useReducer(jogStateReducer, initialJogState);

  const pressForward = useCallback(() => dispatch({ type: 'PRESS_FORWARD' }), []);
  const releaseForward = useCallback(() => dispatch({ type: 'RELEASE_FORWARD' }), []);
  const pressBackward = useCallback(() => dispatch({ type: 'PRESS_BACKWARD' }), []);
  const releaseBackward = useCallback(() => dispatch({ type: 'RELEASE_BACKWARD' }), []);

  return { status: state.status, pressForward, releaseForward, pressBackward, releaseBackward };
}
