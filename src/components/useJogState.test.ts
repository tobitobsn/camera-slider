import { jogStateReducer, type JogStatus } from './useJogState';

describe('jogStateReducer', () => {
  // AC-1: press engages the corresponding direction
  it('idle + PRESS_FORWARD -> jogging_forward', () => {
    expect(jogStateReducer('idle', { type: 'PRESS_FORWARD' })).toBe('jogging_forward');
  });

  it('idle + PRESS_BACKWARD -> jogging_backward', () => {
    expect(jogStateReducer('idle', { type: 'PRESS_BACKWARD' })).toBe('jogging_backward');
  });

  // AC-2: release stops
  it('jogging_forward + RELEASE_FORWARD -> idle', () => {
    expect(jogStateReducer('jogging_forward', { type: 'RELEASE_FORWARD' })).toBe('idle');
  });

  it('jogging_backward + RELEASE_BACKWARD -> idle', () => {
    expect(jogStateReducer('jogging_backward', { type: 'RELEASE_BACKWARD' })).toBe('idle');
  });

  // AC-4/EC-2: second direction pressed while the first is held is an
  // immediate stop, never a direction switch.
  it('jogging_forward + PRESS_BACKWARD -> idle (second direction stops, does not switch)', () => {
    expect(jogStateReducer('jogging_forward', { type: 'PRESS_BACKWARD' })).toBe('idle');
  });

  it('jogging_backward + PRESS_FORWARD -> idle (mirror)', () => {
    expect(jogStateReducer('jogging_backward', { type: 'PRESS_FORWARD' })).toBe('idle');
  });

  // No-op rows
  it('idle + RELEASE_FORWARD -> idle (no-op, spurious/late release)', () => {
    expect(jogStateReducer('idle', { type: 'RELEASE_FORWARD' })).toBe('idle');
  });

  it('idle + RELEASE_BACKWARD -> idle (no-op)', () => {
    expect(jogStateReducer('idle', { type: 'RELEASE_BACKWARD' })).toBe('idle');
  });

  it('jogging_forward + PRESS_FORWARD -> jogging_forward (no-op, duplicate press)', () => {
    expect(jogStateReducer('jogging_forward', { type: 'PRESS_FORWARD' })).toBe('jogging_forward');
  });

  it('jogging_forward + RELEASE_BACKWARD -> jogging_forward (no-op, backward never engaged)', () => {
    expect(jogStateReducer('jogging_forward', { type: 'RELEASE_BACKWARD' })).toBe(
      'jogging_forward',
    );
  });

  it('jogging_backward + PRESS_BACKWARD -> jogging_backward (no-op, duplicate press)', () => {
    expect(jogStateReducer('jogging_backward', { type: 'PRESS_BACKWARD' })).toBe(
      'jogging_backward',
    );
  });

  it('jogging_backward + RELEASE_FORWARD -> jogging_backward (no-op, mirror)', () => {
    expect(jogStateReducer('jogging_backward', { type: 'RELEASE_FORWARD' })).toBe(
      'jogging_backward',
    );
  });

  // Full 3x4 exhaustiveness table, matching design.md 1:1.
  it.each<[JogStatus, string, JogStatus]>([
    ['idle', 'PRESS_FORWARD', 'jogging_forward'],
    ['idle', 'PRESS_BACKWARD', 'jogging_backward'],
    ['idle', 'RELEASE_FORWARD', 'idle'],
    ['idle', 'RELEASE_BACKWARD', 'idle'],
    ['jogging_forward', 'RELEASE_FORWARD', 'idle'],
    ['jogging_forward', 'PRESS_BACKWARD', 'idle'],
    ['jogging_forward', 'PRESS_FORWARD', 'jogging_forward'],
    ['jogging_forward', 'RELEASE_BACKWARD', 'jogging_forward'],
    ['jogging_backward', 'RELEASE_BACKWARD', 'idle'],
    ['jogging_backward', 'PRESS_FORWARD', 'idle'],
    ['jogging_backward', 'PRESS_BACKWARD', 'jogging_backward'],
    ['jogging_backward', 'RELEASE_FORWARD', 'jogging_backward'],
  ])('%s + %s -> %s', (from, eventType, to) => {
    expect(jogStateReducer(from, { type: eventType } as never)).toBe(to);
  });
});
