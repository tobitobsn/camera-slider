/**
 * Render-level tests for PROJ-2 AC-10 / EC-7: the "hold at standstill"
 * switch row.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Switch, Text } from 'react-native';

import { HOLD_SEND_ERROR, HoldSwitchRow } from './HoldSwitchRow';

function render(props: { value: boolean; disabled: boolean; sendFailed: boolean }, onValueChange = jest.fn()) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(React.createElement(HoldSwitchRow, { ...props, onValueChange }));
  });
  const texts = r.root.findAllByType(Text).map(t => ([] as unknown[]).concat(t.props.children).join(''));
  return { switchEl: r.root.findByType(Switch), texts };
}

describe('HoldSwitchRow', () => {
  it('labels the switch and shows the given value (AC-10)', () => {
    const { switchEl, texts } = render({ value: true, disabled: false, sendFailed: false });
    expect(texts).toContain('Motor hält im Stillstand');
    expect(switchEl.props.value).toBe(true);
    expect(render({ value: false, disabled: false, sendFailed: false }).switchEl.props.value).toBe(false);
  });

  it('passes a toggle to the callback (AC-10)', () => {
    const onValueChange = jest.fn();
    const { switchEl } = render({ value: true, disabled: false, sendFailed: false }, onValueChange);
    act(() => switchEl.props.onValueChange(false));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('is not operable while disabled (EC-7)', () => {
    expect(render({ value: true, disabled: true, sendFailed: false }).switchEl.props.disabled).toBe(true);
    expect(render({ value: true, disabled: false, sendFailed: false }).switchEl.props.disabled).toBe(false);
  });

  it('shows the error line only after a failed send', () => {
    expect(render({ value: true, disabled: false, sendFailed: true }).texts).toContain(HOLD_SEND_ERROR);
    expect(render({ value: true, disabled: false, sendFailed: false }).texts).not.toContain(HOLD_SEND_ERROR);
  });
});
