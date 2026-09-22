/**
 * Pure state machine for the local (App-side) jog button state — see
 * design.md → "Jog-Zustandsmaschine (App, lokal in JogControls)".
 *
 * Deliberately a single enum (`status`) rather than independent booleans for
 * "forward held" / "backward held" — same pattern as PROJ-1's
 * `connectionReducer.ts`. This file has no side effects (no BLE calls, no
 * timers): it does not send JOG/STOP commands itself — a sibling task (T7,
 * JogControls) wires the actual BLE sending to the transitions produced
 * here.
 */

import { useCallback, useReducer } from 'react';

export type JogStatus = 'idle' | 'jogging_forward' | 'jogging_backward';

export type JogEvent =
  | { type: 'PRESS_FORWARD' }
  | { type: 'RELEASE_FORWARD' }
  | { type: 'PRESS_BACKWARD' }
  | { type: 'RELEASE_BACKWARD' };

/**
 * Exhaustive over all 3 statuses × 4 events (12 combinations) — every
 * combination is an explicit row from design.md's transition table, none is
 * left to an implicit fallthrough.
 *
 * AC-4/EC-2: pressing the second direction while the first is held is a
 * stop, never a direction switch — the user must fully release both and
 * press again to move.
 */
export function jogStateReducer(status: JogStatus, event: JogEvent): JogStatus {
  switch (status) {
    case 'idle':
      switch (event.type) {
        case 'PRESS_FORWARD':
          return 'jogging_forward';
        case 'PRESS_BACKWARD':
          return 'jogging_backward';
        case 'RELEASE_FORWARD':
          // No-op: a spurious/late release with nothing currently engaged.
          return 'idle';
        case 'RELEASE_BACKWARD':
          // No-op, mirror of RELEASE_FORWARD above.
          return 'idle';
      }
      break;

    case 'jogging_forward':
      switch (event.type) {
        case 'RELEASE_FORWARD':
          // AC-2: release stops.
          return 'idle';
        case 'PRESS_BACKWARD':
          // AC-4/EC-2: second direction pressed while forward is held ->
          // immediate stop, not a direction switch.
          return 'idle';
        case 'PRESS_FORWARD':
          // No-op: already jogging forward (e.g. duplicate press event).
          return 'jogging_forward';
        case 'RELEASE_BACKWARD':
          // No-op: backward was never actually engaged from this state —
          // only reachable via a stray release, harmless either way.
          return 'jogging_forward';
      }
      break;

    case 'jogging_backward':
      switch (event.type) {
        case 'RELEASE_BACKWARD':
          return 'idle';
        case 'PRESS_FORWARD':
          // Mirror of the forward case above.
          return 'idle';
        case 'PRESS_BACKWARD':
          // No-op: already jogging backward.
          return 'jogging_backward';
        case 'RELEASE_FORWARD':
          // No-op, mirror.
          return 'jogging_backward';
      }
      break;
  }

  return status;
}

/**
 * Thin hook wrapping `useReducer(jogStateReducer, 'idle')`, exposing the
 * four button-facing callbacks a component needs. Sends no BLE commands
 * itself — that wiring is a sibling task's job (T7, JogControls).
 */
export function useJogState(): {
  status: JogStatus;
  pressForward: () => void;
  releaseForward: () => void;
  pressBackward: () => void;
  releaseBackward: () => void;
} {
  const [status, dispatch] = useReducer(jogStateReducer, 'idle');

  const pressForward = useCallback(() => dispatch({ type: 'PRESS_FORWARD' }), []);
  const releaseForward = useCallback(() => dispatch({ type: 'RELEASE_FORWARD' }), []);
  const pressBackward = useCallback(() => dispatch({ type: 'PRESS_BACKWARD' }), []);
  const releaseBackward = useCallback(() => dispatch({ type: 'RELEASE_BACKWARD' }), []);

  return { status, pressForward, releaseForward, pressBackward, releaseBackward };
}
