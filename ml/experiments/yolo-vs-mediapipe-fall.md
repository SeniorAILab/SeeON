# YOLO26-pose vs YOLO-box + MediaPipe (issue #218)

낙상 전용 A/B. 분류기를 `pose_angle`로 고정하고 **포즈 소스만** 바꿔, 어느 쪽이
"낙상을 더 잘 잡는지"를 실제 데이터로 측정했다.

- 재현: `PYTHONPATH=. python experiments/yolo_vs_mediapipe_eval.py --stride 4 --data-root <ml/data>`
- 두 백엔드 모두 사람 검출 conf = 0.05로 맞춤(검출 적극성 동일 → 차이는 모델 고유 검출력 + 포즈 품질).
- 지표: **pose_avail** = 어깨+엉덩이 키포인트를 복원한 프레임 비율(포즈가 없으면 분류기가 발화 불가).
  **fired** = `pose_angle`가 창 안에서 낙상 발화. **post_angle** = 낙상 종료 이후 평균 몸통 각도(낮을수록 수평=누움).

## 결과 1 — nursing-home CCTV (gold 19 confirmed falls)

| backend | mean pose_avail | falls fired | mean post_angle |
|---|---|---|---|
| **yolo-pose** | **63%** | 1/19 | 52° |
| yolo + mediapipe | 27% | 0/19 | 50° |

- **포즈 복원율: yolo-pose가 ~2.3배(63% vs 27%).** MediaPipe는 작고(≈100px) 탑다운·저화질·가림이 심한
  CCTV crop에서 포즈 자체를 못 뽑는 프레임이 많음(여러 클립 0~5%). ROI 업스케일(→256px)로도 회복 안 됨
  → 해상도가 아니라 **촬영 각도/화질** 문제.
- 클립별로도 거의 모든 클립에서 yolo-pose ≥ mediapipe. 예외 1건(2026-02-23 베스트요양원1 203호:
  mediapipe 42% vs yolo-pose 0%)만 MediaPipe 우세.
- **발화는 둘 다 저조(1/19, 0/19).** 탑다운 CCTV에선 바닥에 누워도 이미지상 어깨-엉덩이 벡터가
  수평으로 안 보여(원근 단축) post_angle이 50°대로 유지 → **각도 휴리스틱 자체가 탑다운 CCTV에
  약함**(레퍼런스는 측면 가정용 카메라 기준). 이는 포즈 소스가 아니라 분류기 튜닝 이슈.

## 결과 2 — le2i Home (선명·정면 낙상, 샘플)

- MediaPipe pose_avail ≈ **15/16 (94%)**, 박스 높이 49px여도 안정 검출.
- 즉 MediaPipe 구현은 정상이며, **인물이 크고 선명·정면**인 footage에선 하이브리드가 잘 작동.

## 결론

"박스 잡고 그대로 MediaPipe 날리는 게 더 잘 잡나?" →

- **우리 nursing-home CCTV에서는 NO.** YOLO-pose가 포즈를 2배 이상 안정적으로 복원한다.
  MediaPipe는 탑다운·소형·저화질 인물에 약하다.
- **선명·근접·정면 카메라(le2i류)에서는 하이브리드가 충분히 경쟁력 있음**(pose_avail 94%).
- 별개 과제: 낙상 발화율이 둘 다 낮음 → `pose_angle` 임계값이 탑다운 CCTV에 안 맞음.
  탑다운에는 각도보다 박스 종횡비/중심 하강(`rule_based`) 또는 시계열 모델이 더 적합할 가능성.

## 결과 3 — 공정성 보강: convention-independent 재측정

결과 1의 `pose_avail`/`post_angle`은 **공정하지 않다**: YOLO-pose conf와 MediaPipe
visibility는 서로 다른 양인데 둘 다에 COCO 기준 `conf≥0.2`와 각도 임계값(45°)을 똑같이 적용했고,
관절 정의(MediaPipe 골반 vs COCO 고관절)도 다르다. 그래서 **임계값·관절 리맵·분류기를 전부 제거**하고
"그 프레임에 포즈가 나왔나(None이냐 아니냐)"만 측정했다(`pose_detection_rate.py`, 클립당 30프레임 균등샘플).

| 지표(평균) | nursing-home CCTV (23클립) | le2i Home (8클립) |
|---|---|---|
| YOLO-pose 사람검출 | **85%** | 72% |
| YOLO-det 사람검출 (하이브리드 1단계) | 71% | 65% |
| MediaPipe 포즈산출 \| 박스있음 (2단계) | 44% | **73%** |
| 하이브리드 최종 포즈산출 | **38%** | 46% |

- **핵심 주장은 살아남는다(오히려 더 깨끗):** 임계값 0개로도 CCTV에서 하이브리드 38% vs YOLO-pose 85%.
- 하이브리드는 **두 관문 모두에서 진다:** 범용 검출기(71%)가 포즈전용 검출기(85%)보다 약하고,
  MediaPipe는 받은 박스 중 44%만 포즈화(탑다운·소형 crop에서 실패).
- le2i에선 MediaPipe\|박스 **73%**로 급등 → 약점은 코드가 아니라 **footage 분포(탑다운·소형·저화질)**.
- 한계: 이 이진 지표도 완벽 중립은 아님(YOLO "박스 냄" ≠ 정확한 키포인트). 측정한 건 **포즈 가용성**이지
  키포인트 정확도가 아니다. MediaPipe가 발화한 프레임의 키포인트 품질(le2i)은 양호.

## 상태: 예비(PRELIMINARY) · 보류 — 재실험 필요

아래 한계 때문에 위 수치는 **방향성 참고용**이며 결정 근거로 쓰지 말 것(issue #218에 park).

- **눈으로 검증 안 함.** 오버레이를 사람이 보고 "키포인트가 실제로 맞는지"를 확인하지 않았다.
  측정한 건 *포즈 가용성*(나왔나/안 나왔나)이지 *정확도*가 아니다. 프레임/클립 오버레이 시각 검증이 선행돼야 한다.
- **golden set 신뢰성 미검증.** `nursing-home-gold.csv`의 fall_start/end는 일부가 BORDERLINE/detector-missed로
  주석돼 있고 단일 라벨러 추정이다. 라벨 자체를 재검토(프레임 재확인·복수 검토)하기 전엔 정량 비교의 분모를 신뢰할 수 없다.

### 재실험 설계(다음 차례)
1. 시각 검증: 두 백엔드 오버레이를 fall window 중심으로 렌더해 키포인트 정확도를 사람이 평가/스코어.
2. golden set 재검토: fall 구간 재라벨 + 신뢰 등급, hard-negative(회복된 near-fall) 분리.
3. 공정 지표: 가용성뿐 아니라 **키포인트 정확도**(시각 스코어 또는 GT 키포인트) 비교.
4. 변수 스윕: YOLO-det 크기(s/m)로 하이브리드 1단계 보강, MediaPipe model_complexity=2/업스케일, 카메라 각도별 층화.
5. 분류기 분리: 탑다운에 맞는 임계값/시계열 모델로 "포즈 소스" vs "분류기" 효과를 분리.
