import { ConfigService } from '@nestjs/config';

import {
  AlertEventTypes,
  type AlertEventIngressDto,
} from '../dto/alert-events.dto';
import { AlertPolicyClock, AlertPolicyService } from './alert-policy.service';

describe('AlertPolicyService', () => {
  it('suppresses the same source and type during the configured cooldown window', () => {
    const clock = new FakePolicyClock();
    const policy = newPolicy({ ALERT_COOLDOWN_SEC: 60 }, clock);
    const event = validEvent();

    const first = policy.evaluate(event);
    clock.advanceMs(30_000);
    const second = policy.evaluate(event);
    clock.advanceMs(31_000);
    const third = policy.evaluate(event);

    expect(first).toEqual({ kind: 'dispatch' });
    expect(second).toEqual({
      kind: 'suppress',
      suppressed_reason: 'cooldown',
    });
    expect(third).toEqual({ kind: 'dispatch' });
  });

  it('does not share cooldown keys between fall and detection-lost for the same source', () => {
    const clock = new FakePolicyClock();
    const policy = newPolicy({ ALERT_COOLDOWN_SEC: 60 }, clock);

    const fallDecision = policy.evaluate(
      validEvent({ type: AlertEventTypes.fall }),
    );
    const detectionLostDecision = policy.evaluate(
      validEvent({ type: AlertEventTypes.detectionLost }),
    );

    expect(fallDecision).toEqual({ kind: 'dispatch' });
    expect(detectionLostDecision).toEqual({ kind: 'dispatch' });
  });

  it('suppresses events after the rolling hourly cap and allows again after sixty minutes', () => {
    const clock = new FakePolicyClock();
    const policy = newPolicy(
      { ALERT_COOLDOWN_SEC: 0, ALERT_HOURLY_CAP: 10 },
      clock,
    );

    const firstTen = Array.from({ length: 10 }, (_unused, index) =>
      policy.evaluate(validEvent({ source_id: `cam-${index}` })),
    );
    const eleventh = policy.evaluate(validEvent({ source_id: 'cam-10' }));
    clock.advanceMs(61 * 60_000);
    const afterWindow = policy.evaluate(validEvent({ source_id: 'cam-11' }));

    expect(firstTen).toEqual(
      Array.from({ length: 10 }, () => ({ kind: 'dispatch' })),
    );
    expect(eleventh).toEqual({
      kind: 'suppress',
      suppressed_reason: 'hourly_cap',
    });
    expect(afterWindow).toEqual({ kind: 'dispatch' });
  });

  it('sends every valid event when ALERT_POLICY_ENABLED is false', () => {
    const clock = new FakePolicyClock();
    const policy = newPolicy(
      {
        ALERT_POLICY_ENABLED: 'false',
        ALERT_COOLDOWN_SEC: 60,
        ALERT_HOURLY_CAP: 1,
      },
      clock,
    );

    const decisions = Array.from({ length: 3 }, () =>
      policy.evaluate(validEvent()),
    );

    expect(decisions).toEqual([
      { kind: 'dispatch' },
      { kind: 'dispatch' },
      { kind: 'dispatch' },
    ]);
  });

  it('does not allow concurrent evaluations to exceed the hourly cap', async () => {
    const clock = new FakePolicyClock();
    const policy = newPolicy(
      { ALERT_COOLDOWN_SEC: 0, ALERT_HOURLY_CAP: 10 },
      clock,
    );

    const decisions = await Promise.all(
      Array.from({ length: 30 }, (_unused, index) =>
        Promise.resolve(
          policy.evaluate(validEvent({ source_id: `cam-${index}` })),
        ),
      ),
    );

    expect(
      decisions.filter((decision) => decision.kind === 'dispatch'),
    ).toHaveLength(10);
    expect(
      decisions.filter(
        (decision) =>
          decision.kind === 'suppress' &&
          decision.suppressed_reason === 'hourly_cap',
      ),
    ).toHaveLength(20);
  });
});

function newPolicy(
  values: Readonly<Record<string, string | number | boolean>>,
  clock: AlertPolicyClock,
): AlertPolicyService {
  return new AlertPolicyService(new ConfigService(values), clock);
}

function validEvent(
  overrides: Partial<AlertEventIngressDto> = {},
): AlertEventIngressDto {
  return {
    type: AlertEventTypes.fall,
    source_id: 'demo-cam-01',
    detected_at: '2026-06-13T22:14:03.120Z',
    confidence: 0.87,
    ...overrides,
  };
}

class FakePolicyClock extends AlertPolicyClock {
  private currentMs = Date.parse('2026-06-13T22:14:03.120Z');

  nowMs(): number {
    return this.currentMs;
  }

  advanceMs(milliseconds: number): void {
    this.currentMs += milliseconds;
  }
}
