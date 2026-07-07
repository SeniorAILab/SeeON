import { describe, expect, it } from 'vitest';
import { extractEvents } from './statusFeed';

describe('extractEvents', () => {
  it('normalizes camera id and bed-exit event type for dashboard selection', () => {
    const events = extractEvents({
      events: [
        {
          event_id: 'evt-1',
          camera_id: 'room-2025',
          camera_label: '2025호',
          event_type: 'bed_exit',
          message: '침대 밖 이동',
          timestamp: '2026-07-07T00:00:00Z',
        },
      ],
    });

    expect(events).toEqual([
      {
        id: 'evt-1',
        cameraId: 'room-2025',
        cameraLabel: '2025호',
        eventType: 'bed-exit',
        title: 'bed_exit',
        detail: '침대 밖 이동',
        timestamp: '2026-07-07T00:00:00Z',
      },
    ]);
  });
});
