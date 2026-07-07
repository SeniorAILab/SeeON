import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { Camera, Clip } from '../api/client';
import type { FeedEvent } from '../statusFeed';
import { CameraEventLivePanel } from './CameraEventLivePanel';
import { CameraEventWorkspace } from './CameraEventWorkspace';
import { buildEventOptions, filterClipsForCameraEvent } from './cameraEventLogic';

const cameras: Camera[] = [
  {
    id: 'program-room',
    label: '프로그램실',
    rtsp_url_masked: 'rtsp://operator:***@camera/trackID=1',
    space_id: null,
    backend_camera_id: null,
    status: 'online',
    created_at: '2026-07-07T00:00:00.000Z',
    domains: { fall: true },
  },
  {
    id: 'room-2025',
    label: '2025호',
    rtsp_url_masked: 'rtsp://operator:***@camera/trackID=1',
    space_id: null,
    backend_camera_id: null,
    status: 'online',
    created_at: '2026-07-07T00:00:00.000Z',
    domains: { 'bed-exit': true },
  },
];

const bedExitEvent: FeedEvent = {
  id: 'event-2025',
  cameraId: 'room-2025',
  cameraLabel: '2025호',
  eventType: 'bed-exit',
  title: '침대 이탈',
  detail: '침대 밖 이동',
  timestamp: null,
};

describe('CameraEventLivePanel', () => {
  const camera: Camera = {
    id: 'cam-1',
    label: '301호 침대 A',
    rtsp_url_masked: 'rtsp://operator:***@camera/trackID=1',
    space_id: null,
    backend_camera_id: null,
    status: 'online',
    created_at: '2026-07-07T00:00:00.000Z',
  };
  const event: FeedEvent = {
    id: 'event-1',
    cameraId: 'cam-1',
    cameraLabel: '301호 침대 A',
    eventType: 'bed-exit',
    title: '침대 이탈',
    detail: '침대 밖 이동',
    timestamp: null,
  };
  const clip: Clip = {
    id: 'clip-1',
    camera_id: 'cam-1',
    camera_label: '301호 침대 A',
    event_type: 'bed-exit',
    created_at: null,
    label: null,
    video_path: '/api/v1/clips/clip-1/video',
  };

  it('renders the real ml-api stream image for the selected camera and event', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <CameraEventLivePanel
          selectedCamera={camera}
          selectedEvent={event}
          clips={[clip]}
          streamUrl="/api/v1/streams/cam-1"
        />,
      );
    });

    const image = host.querySelector('img');
    expect(host.textContent).toContain('실시간 상태 스트림');
    expect(image?.getAttribute('src')).toBe('/api/v1/streams/cam-1');
    expect(host.querySelector('video')).toBeNull();
    expect(host.textContent).toContain('클립 이력');

    act(() => root.unmount());
    host.remove();
  });

  it('shows an explicit unavailable state when the stream image fails', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <CameraEventLivePanel
          selectedCamera={camera}
          selectedEvent={event}
          clips={[clip]}
          streamUrl="/api/v1/streams/cam-1"
        />,
      );
    });

    const image = host.querySelector('img');
    act(() => {
      image?.dispatchEvent(new Event('error', { bubbles: true }));
    });

    expect(host.textContent).toContain('라이브 스트림을 사용할 수 없습니다');
    expect(host.querySelector('video')).toBeNull();

    act(() => root.unmount());
    host.remove();
  });
});

describe('CameraEventWorkspace', () => {
  it('lets the operator select a camera and that camera event before showing the live stream', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <CameraEventWorkspace
          cameras={cameras}
          events={[bedExitEvent]}
          clips={[]}
          heartbeat="정상"
          statusError={null}
          clipsError={null}
          onClipChanged={() => undefined}
        />,
      );
    });

    const cameraButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('2025호'));
    act(() => {
      cameraButton?.click();
    });

    const eventButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('침대 이탈'));
    act(() => {
      eventButton?.click();
    });

    expect(host.querySelector('img')?.getAttribute('src')).toBe('/api/v1/streams/room-2025');

    act(() => root.unmount());
    host.remove();
  });
});

describe('camera event filtering', () => {
  it('derives event choices and clip history for the selected camera only', () => {
    const clips: Clip[] = [
      {
        id: 'clip-2025',
        camera_id: 'room-2025',
        camera_label: '2025호',
        event_type: 'bed-exit',
        created_at: null,
        label: null,
        video_path: '/api/v1/clips/clip-2025/video',
      },
      {
        id: 'clip-other',
        camera_id: 'program-room',
        camera_label: '프로그램실',
        event_type: 'bed-exit',
        created_at: null,
        label: null,
        video_path: '/api/v1/clips/clip-other/video',
      },
    ];

    const options = buildEventOptions(cameras[1], [bedExitEvent], clips);
    const history = filterClipsForCameraEvent(cameras[1], clips, 'bed-exit');

    expect(options.map((option) => option.type)).toContain('bed-exit');
    expect(history.map((clip) => clip.id)).toEqual(['clip-2025']);
  });
});
