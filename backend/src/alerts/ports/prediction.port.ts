import type {
  PredictFallRequestDto,
  PredictFallResponseDto,
} from '../dto/alert-events.dto';

export const ALERT_PREDICTION_PORT = Symbol('ALERT_PREDICTION_PORT');

export interface PredictionPort {
  predict(request: PredictFallRequestDto): Promise<PredictFallResponseDto>;
}
