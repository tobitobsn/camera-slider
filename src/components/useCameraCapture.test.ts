import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// Neither native library works in Jest (both are native-module-backed:
// VisionCamera on Nitro Modules, camera-roll on a native CameraRoll module),
// so both are mocked, matching usePresets.test.ts's jest.mock() pattern for
// a hook's native dependency. jest.mock calls are hoisted above these
// imports by babel-plugin-jest-hoist.
const mockCapturePhotoToFile = jest.fn();
const mockRequestPermission = jest.fn();
let mockHasPermission = false;

jest.mock('react-native-vision-camera', () => ({
  useCameraPermission: jest.fn(() => ({
    hasPermission: mockHasPermission,
    requestPermission: mockRequestPermission,
  })),
  useCameraDevice: jest.fn(() => ({ id: 'mock-back-camera' })),
  usePhotoOutput: jest.fn(() => ({
    capturePhotoToFile: mockCapturePhotoToFile,
  })),
}));

const mockSave = jest.fn();
jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: {
    save: (...args: unknown[]) => mockSave(...args),
  },
}));

import { useCameraCapture } from './useCameraCapture';

type CameraCaptureApi = {
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
  cameraDevice: unknown;
  photoOutput: unknown;
  capturePhoto: () => Promise<void>;
};

// Plain function component using React.createElement (not JSX) since this
// file is .ts, not .tsx — matches usePresets.test.ts's "render a probe
// component with react-test-renderer + act()" approach for exercising a hook.
function CameraCaptureProbe({ onApi }: { onApi: (api: CameraCaptureApi) => void }) {
  const api = useCameraCapture();
  onApi(api);
  return null;
}

function renderProbe(onApi: (api: CameraCaptureApi) => void): React.ReactElement {
  return React.createElement(CameraCaptureProbe, { onApi });
}

describe('useCameraCapture', () => {
  beforeEach(() => {
    mockHasPermission = false;
    mockCapturePhotoToFile.mockReset();
    mockRequestPermission.mockReset();
    mockSave.mockReset();
  });

  it('passes hasPermission/requestPermission straight through from useCameraPermission()', () => {
    mockHasPermission = true;
    let lastApi: CameraCaptureApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
    });

    expect(lastApi!.hasPermission).toBe(true);
    expect(lastApi!.requestPermission).toBe(mockRequestPermission);

    act(() => renderer.unmount());
  });

  it('exposes the back camera device and the photo output for the <Camera> component', () => {
    let lastApi: CameraCaptureApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
    });

    expect(lastApi!.cameraDevice).toEqual({ id: 'mock-back-camera' });
    expect(lastApi!.photoOutput).toBeDefined();

    act(() => renderer.unmount());
  });

  it('capturePhoto() captures a photo and saves it to the gallery with a file:// URI (BUG guard: capturePhotoToFile() returns a bare filesystem path, not a URI)', async () => {
    mockCapturePhotoToFile.mockResolvedValue({ filePath: '/data/user/0/app/cache/photo123.jpg' });
    mockSave.mockResolvedValue('file:///data/user/0/app/cache/photo123.jpg');

    let lastApi: CameraCaptureApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
    });

    await act(async () => {
      await lastApi!.capturePhoto();
    });

    expect(mockCapturePhotoToFile).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith('file:///data/user/0/app/cache/photo123.jpg');

    act(() => renderer.unmount());
  });

  it('capturePhoto() rejects and does not attempt a gallery save when the capture itself fails', async () => {
    mockCapturePhotoToFile.mockRejectedValue(new Error('camera busy'));

    let lastApi: CameraCaptureApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
    });

    await act(async () => {
      await expect(lastApi!.capturePhoto()).rejects.toThrow('camera busy');
    });

    expect(mockSave).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  it('capturePhoto() rejects when the capture succeeds but the gallery save fails', async () => {
    mockCapturePhotoToFile.mockResolvedValue({ filePath: '/data/user/0/app/cache/photo456.jpg' });
    mockSave.mockRejectedValue(new Error('gallery save failed'));

    let lastApi: CameraCaptureApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
    });

    await act(async () => {
      await expect(lastApi!.capturePhoto()).rejects.toThrow('gallery save failed');
    });

    act(() => renderer.unmount());
  });
});
