import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { colors } from '../theme/colors';

jest.mock('../connection/ConnectionProvider', () => ({
  useConnection: () => ({ device: { id: 'dev' } }),
}));
let mockStatus: { batteryMillivolts: number | null; moving: boolean } = {
  batteryMillivolts: null,
  moving: false,
};
jest.mock('./useSliderStatus', () => ({
  useSliderStatus: () => mockStatus,
}));

import { BatteryIndicator } from './BatteryIndicator';

function render(batteryMillivolts: number | null, moving = false) {
  mockStatus = { batteryMillivolts, moving };
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(React.createElement(BatteryIndicator));
  });
  const text = r.root.findByType(Text);
  const style = Object.assign({}, ...([] as object[]).concat(text.props.style).filter(Boolean));
  return { label: ([] as unknown[]).concat(text.props.children).join(''), style };
}

describe('BatteryIndicator', () => {
  it('shows "🔋 –" without a value or without a battery (AC-11, EC-5)', () => {
    expect(render(null).label).toBe('🔋 –');
    expect(render(40).label).toBe('🔋 –');
    expect(render(null).style.color).toBe(colors.foreground);
  });

  it('shows the percent in the normal color at >= 20 % (AC-1)', () => {
    const r = render(11400); // 50 %
    expect(r.label).toBe('🔋 50 %');
    expect(r.style.color).toBe(colors.foreground);
  });

  it('turns orange below 20 % and red below 10 % (AC-4, AC-5)', () => {
    expect(render(10650).style.color).toBe(colors.primary); // 15 %
    expect(render(10200).style.color).toBe(colors.destructive); // 5 %
  });

  it('is dimmed while the motor moves (AC-3)', () => {
    expect(render(11400, true).style.opacity).toBe(0.45);
    expect(render(11400, false).style.opacity).toBeUndefined();
  });
});
