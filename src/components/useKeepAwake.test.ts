import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// @sayem314/react-native-keep-awake is a native TurboModule and doesn't work
// in Jest, so it's mocked — matches usePresets.test.ts's jest.mock() pattern
// for a hook's native dependency. jest.mock calls are hoisted above these
// imports by babel-plugin-jest-hoist.
const mockActivateKeepAwake = jest.fn();
const mockDeactivateKeepAwake = jest.fn();

jest.mock('@sayem314/react-native-keep-awake', () => ({
  activateKeepAwake: () => mockActivateKeepAwake(),
  deactivateKeepAwake: () => mockDeactivateKeepAwake(),
}));

import { useKeepAwake } from './useKeepAwake';

type KeepAwakeApi = {
  activate: () => void;
  deactivate: () => void;
};

// Plain function component using React.createElement (not JSX) since this
// file is .ts, not .tsx — matches usePresets.test.ts's "render a probe
// component with react-test-renderer + act()" approach for exercising a hook.
function KeepAwakeProbe({ onApi }: { onApi: (api: KeepAwakeApi) => void }) {
  const api = useKeepAwake();
  onApi(api);
  return null;
}

function renderProbe(onApi: (api: KeepAwakeApi) => void): React.ReactElement {
  return React.createElement(KeepAwakeProbe, { onApi });
}

describe('useKeepAwake', () => {
  beforeEach(() => {
    mockActivateKeepAwake.mockReset();
    mockDeactivateKeepAwake.mockReset();
  });

  it('does not activate the wakelock just from mounting (no automatic React-effect activation)', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(() => {}));
    });

    expect(mockActivateKeepAwake).not.toHaveBeenCalled();
    expect(mockDeactivateKeepAwake).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  it('activate() calls activateKeepAwake() and nothing else', () => {
    let lastApi: KeepAwakeApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
    });

    act(() => {
      lastApi!.activate();
    });

    expect(mockActivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(mockDeactivateKeepAwake).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  it('deactivate() calls deactivateKeepAwake() and nothing else', () => {
    let lastApi: KeepAwakeApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
    });

    act(() => {
      lastApi!.deactivate();
    });

    expect(mockDeactivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(mockActivateKeepAwake).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  it('unmounting the hook does not itself deactivate the wakelock (lifecycle is caller-owned, not effect-owned)', () => {
    let lastApi: KeepAwakeApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
    });

    act(() => {
      lastApi!.activate();
    });
    mockActivateKeepAwake.mockClear();

    act(() => renderer.unmount());

    expect(mockDeactivateKeepAwake).not.toHaveBeenCalled();
  });
});
