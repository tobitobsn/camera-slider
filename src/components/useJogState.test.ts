import { jogStateReducer, type InternalState, type JogEvent, type JogStatus } from './useJogState';

/** Fixture helper: an InternalState with explicit held-flags, so every test
 * reads as "starting from this held-flags situation" rather than a bare
 * status string that hides the invariant. */
function state(
  status: JogStatus,
  forwardHeld: boolean,
  backwardHeld: boolean,
): InternalState {
  return { status, forwardHeld, backwardHeld };
}

describe('jogStateReducer', () => {
  // AC-1: press engages the corresponding direction
  it('idle + PRESS_FORWARD -> jogging_forward', () => {
    expect(jogStateReducer(state('idle', false, false), { type: 'PRESS_FORWARD' })).toEqual(
      state('jogging_forward', true, false),
    );
  });

  it('idle + PRESS_BACKWARD -> jogging_backward', () => {
    expect(jogStateReducer(state('idle', false, false), { type: 'PRESS_BACKWARD' })).toEqual(
      state('jogging_backward', false, true),
    );
  });

  // AC-2: release stops
  it('jogging_forward + RELEASE_FORWARD -> idle', () => {
    expect(
      jogStateReducer(state('jogging_forward', true, false), { type: 'RELEASE_FORWARD' }),
    ).toEqual(state('idle', false, false));
  });

  it('jogging_backward + RELEASE_BACKWARD -> idle', () => {
    expect(
      jogStateReducer(state('jogging_backward', false, true), { type: 'RELEASE_BACKWARD' }),
    ).toEqual(state('idle', false, false));
  });

  // AC-4/EC-2: second direction pressed while the first is held is an
  // immediate stop, never a direction switch -> now lands in `blocked`
  // (not `idle`), since AC-4 also demands neither direction moves again
  // until BOTH are released.
  it('jogging_forward + PRESS_BACKWARD -> blocked (second direction stops, does not switch)', () => {
    expect(
      jogStateReducer(state('jogging_forward', true, false), { type: 'PRESS_BACKWARD' }),
    ).toEqual(state('blocked', true, true));
  });

  it('jogging_backward + PRESS_FORWARD -> blocked (mirror)', () => {
    expect(
      jogStateReducer(state('jogging_backward', false, true), { type: 'PRESS_FORWARD' }),
    ).toEqual(state('blocked', true, true));
  });

  // No-op rows
  it('idle + RELEASE_FORWARD -> idle (no-op, spurious/late release)', () => {
    expect(jogStateReducer(state('idle', false, false), { type: 'RELEASE_FORWARD' })).toEqual(
      state('idle', false, false),
    );
  });

  it('idle + RELEASE_BACKWARD -> idle (no-op)', () => {
    expect(jogStateReducer(state('idle', false, false), { type: 'RELEASE_BACKWARD' })).toEqual(
      state('idle', false, false),
    );
  });

  it('jogging_forward + PRESS_FORWARD -> jogging_forward (no-op, duplicate press)', () => {
    expect(
      jogStateReducer(state('jogging_forward', true, false), { type: 'PRESS_FORWARD' }),
    ).toEqual(state('jogging_forward', true, false));
  });

  it('jogging_forward + RELEASE_BACKWARD -> jogging_forward (defensive no-op, unreachable)', () => {
    expect(
      jogStateReducer(state('jogging_forward', true, false), { type: 'RELEASE_BACKWARD' }),
    ).toEqual(state('jogging_forward', true, false));
  });

  it('jogging_backward + PRESS_BACKWARD -> jogging_backward (no-op, duplicate press)', () => {
    expect(
      jogStateReducer(state('jogging_backward', false, true), { type: 'PRESS_BACKWARD' }),
    ).toEqual(state('jogging_backward', false, true));
  });

  it('jogging_backward + RELEASE_FORWARD -> jogging_backward (defensive no-op, unreachable)', () => {
    expect(
      jogStateReducer(state('jogging_backward', false, true), { type: 'RELEASE_FORWARD' }),
    ).toEqual(state('jogging_backward', false, true));
  });

  describe('blocked status (BUG-1 fix — AC-4 second half)', () => {
    // The exact bug repro from qa-report.md BUG-1 / the task description:
    // hold backward, press forward (-> blocked), release forward while
    // backward is STILL held, press forward again -> must stay blocked,
    // must NOT become jogging_forward.
    it('reproduces and fixes BUG-1: press-release-press forward while backward stays held never starts motion', () => {
      let s = state('idle', false, false);

      s = jogStateReducer(s, { type: 'PRESS_BACKWARD' });
      expect(s).toEqual(state('jogging_backward', false, true));

      s = jogStateReducer(s, { type: 'PRESS_FORWARD' });
      expect(s).toEqual(state('blocked', true, true));

      s = jogStateReducer(s, { type: 'RELEASE_FORWARD' });
      // Backward is still physically held -> must stay blocked, not idle.
      expect(s).toEqual(state('blocked', false, true));

      s = jogStateReducer(s, { type: 'PRESS_FORWARD' });
      // This is the bug: must NOT become jogging_forward.
      expect(s.status).not.toBe('jogging_forward');
      expect(s).toEqual(state('blocked', true, true));
    });

    it('blocked -> release the other still-held button too -> idle', () => {
      // Continue from the blocked state above: both held again.
      const blockedBothHeld = state('blocked', true, true);
      const afterReleaseForward = jogStateReducer(blockedBothHeld, { type: 'RELEASE_FORWARD' });
      expect(afterReleaseForward).toEqual(state('blocked', false, true));

      const afterReleaseBackwardToo = jogStateReducer(afterReleaseForward, {
        type: 'RELEASE_BACKWARD',
      });
      expect(afterReleaseBackwardToo).toEqual(state('idle', false, false));
    });

    it('blocked (mirror: forward released first) -> release backward too -> idle', () => {
      const blockedBothHeld = state('blocked', true, true);
      const afterReleaseBackward = jogStateReducer(blockedBothHeld, {
        type: 'RELEASE_BACKWARD',
      });
      expect(afterReleaseBackward).toEqual(state('blocked', true, false));

      const afterReleaseForwardToo = jogStateReducer(afterReleaseBackward, {
        type: 'RELEASE_FORWARD',
      });
      expect(afterReleaseForwardToo).toEqual(state('idle', false, false));
    });

    it('blocked + PRESS_BACKWARD (still held / re-press) -> stays blocked', () => {
      expect(
        jogStateReducer(state('blocked', false, true), { type: 'PRESS_BACKWARD' }),
      ).toEqual(state('blocked', false, true));
    });

    it('blocked + PRESS_FORWARD while both already held -> stays blocked (idempotent)', () => {
      expect(jogStateReducer(state('blocked', true, true), { type: 'PRESS_FORWARD' })).toEqual(
        state('blocked', true, true),
      );
    });
  });

  // Full 4x4 exhaustiveness table over InternalState, matching the fixed
  // design.md 1:1. `from`/`to` name the status plus the held-flags relevant
  // to that row; unreachable-but-defended rows are marked.
  it.each<[InternalState, JogEvent['type'], InternalState]>([
    [state('idle', false, false), 'PRESS_FORWARD', state('jogging_forward', true, false)],
    [state('idle', false, false), 'PRESS_BACKWARD', state('jogging_backward', false, true)],
    [state('idle', false, false), 'RELEASE_FORWARD', state('idle', false, false)],
    [state('idle', false, false), 'RELEASE_BACKWARD', state('idle', false, false)],

    [state('jogging_forward', true, false), 'RELEASE_FORWARD', state('idle', false, false)],
    [state('jogging_forward', true, false), 'PRESS_BACKWARD', state('blocked', true, true)],
    [
      state('jogging_forward', true, false),
      'PRESS_FORWARD',
      state('jogging_forward', true, false),
    ],
    [
      state('jogging_forward', true, false),
      'RELEASE_BACKWARD',
      state('jogging_forward', true, false),
    ],

    [state('jogging_backward', false, true), 'RELEASE_BACKWARD', state('idle', false, false)],
    [state('jogging_backward', false, true), 'PRESS_FORWARD', state('blocked', true, true)],
    [
      state('jogging_backward', false, true),
      'PRESS_BACKWARD',
      state('jogging_backward', false, true),
    ],
    [
      state('jogging_backward', false, true),
      'RELEASE_FORWARD',
      state('jogging_backward', false, true),
    ],

    [state('blocked', true, true), 'RELEASE_FORWARD', state('blocked', false, true)],
    [state('blocked', true, true), 'RELEASE_BACKWARD', state('blocked', true, false)],
    [state('blocked', true, true), 'PRESS_FORWARD', state('blocked', true, true)],
    [state('blocked', true, true), 'PRESS_BACKWARD', state('blocked', true, true)],
    [state('blocked', false, true), 'RELEASE_BACKWARD', state('idle', false, false)],
    [state('blocked', false, true), 'PRESS_FORWARD', state('blocked', true, true)],
    [state('blocked', true, false), 'RELEASE_FORWARD', state('idle', false, false)],
    [state('blocked', true, false), 'PRESS_BACKWARD', state('blocked', true, true)],
  ])('%o + %s -> %o', (from, eventType, to) => {
    expect(jogStateReducer(from, { type: eventType } as JogEvent)).toEqual(to);
  });
});
