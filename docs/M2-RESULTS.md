# M2 결과 — 클러스터와 라벨

측정일 2026-08-26 · 코퍼스 RAG/IR 10,604편 · 임베딩 SciNCL

## 확정된 설정

`umap10 / eom / min_cluster_size=30` — **45개 덩어리, 미분류 14%, 인용 일치도 9.2배**

## 클러스터링 공간을 실측으로 골랐다

같은 임베딩이라도 어느 공간에서 자르느냐로 결과가 완전히 달라진다.

| 공간 | 선택법 | 최소크기 | 클러스터 | 미분류% | 2D 응집도 | 인용 배수 |
|---|---|---:|---:|---:|---:|---:|
| pca50 | eom | 30 | 5 | 69% | — | 2.4× |
| 2d | eom | 30 | 53 | 26% | 0.05 | 9.6× |
| 2d | eom | 60 | **2** | 0% | — | 1.1× |
| 2d | leaf | 30 | 69 | 47% | 0.04 | 25.1× |
| umap10 | eom | 30 | **45** | **14%** | 0.09 | 9.2× |

*2D 응집도 = 클러스터 내 평균 반경 ÷ 전체 반경. 낮을수록 지도에서 뭉쳐 보여 라벨을 얹을 수 있다.*

**pca50은 무너진다.** 50차원에서 밀도 기반 클러스터링은 성립하지 않는다 — 미분류 69%. 차원 축소 후 클러스터링하라는 통설이 그대로 확인됐다.

**2d/eom은 파라미터에 취약하다.** `min_cluster_size`를 30에서 60으로 올리자 53개가 **2개로 붕괴**했다(한 덩어리가 전체의 97%). EOM이 루트 덩어리를 골라버린 것이다. 사용자에게 슬라이더로 노출하면 그대로 무너지는 지점이 있다는 뜻이라, 이 설정은 쓸 수 없다.

**leaf는 인용 일치도가 25배로 가장 높지만 미분류가 절반이다.** 지도의 절반이 회색이 되므로 "지도를 읽을 수 있다"는 M2의 목표와 정면으로 충돌한다. 최근접 이웃 품질과 지도 품질이 다른 것과 같은 구도다.

**umap10을 택했다.** 클러스터링 전용으로 10차원 UMAP을 따로 학습한다. 미분류가 14%로 가장 낮으면서 2D 응집도 0.09로 지도에서도 뭉쳐 보이고, 라벨이 가장 깨끗했다. 2d가 `large language · construction · energy`로 뒤섞은 덩어리를 umap10은 `image · visual · video`와 `question answering · rag · llms`로 제대로 갈랐다.

## 나온 덩어리

| ID | 편수 | 중앙연도 | 라벨 |
|---:|---:|---:|---|
| 1 | 1,393 | 2018 | innovation · firms · knowledge-intensive |
| 12 | 990 | 2023 | clinical · medical · health |
| 10 | 927 | 2018 | image · visual · video |
| 43 | 617 | 2023 | question answering · rag · llms |
| 26 | 407 | 2024 | energy · llms · engineering |
| 6 | 367 | 2018 | pir · private · privacy |
| 3 | 351 | 2019 | bug · software · localization |
| 0 | 341 | 2019 | music · audio · mir |
| 41 | 325 | 2021 | dense · passage · bert |
| 34 | 302 | 2017 | interactive · exploratory · behavior |
| 18 | 231 | 2018 | learning rank · learning-to-rank · ltr |
| 32 | 177 | 2017 | ontology · ontologies · semantic web |

### 시간 기울기가 이미 보인다

중앙연도를 따라가면 분야의 이동이 그대로 읽힌다.

```
2017  interactive · exploratory      고전 IIR
2017  ontology · semantic web
2018  learning-to-rank
2021  dense · passage · bert         신경망 검색 — 다리
2023  question answering · rag
2023  clinical · medical             RAG 응용
2024  energy · llms · engineering
```

M3의 Flow 뷰가 그려야 할 갈래가 데이터에 이미 들어 있다는 뜻이다.

## 지도가 코퍼스 오염을 잡아냈다

M2에서 가장 값어치 있는 결과는 라벨이 아니라 **쿼리 설계의 결함을 드러낸 것**이다.

**2,101편(20%)이 어휘 충돌로 들어왔다.**

| 편수 | 덩어리 | 충돌한 경로 |
|---:|---|---|
| 1,393 | innovation · firms · knowledge-intensive | `"knowledge-intensive"` → 경영학의 *knowledge-intensive business services* |
| 367 | pir · private · privacy | `"information retrieval"` → 암호학의 *Private Information Retrieval* |
| 341 | music · audio · mir | `"information retrieval"` → *Music Information Retrieval* |

셋 다 RAG/IR과 어휘는 공유하지만 지적 계보는 무관하다. 특히 첫 번째는 코퍼스의 13%로, 가장 큰 덩어리가 통째로 다른 분야였다.

**이건 지도가 실제로 일한 결과다.** 수집 통계나 커버리지 수치로는 절대 안 보인다 — 초록도 있고 인용도 있고 연도 분포도 정상이다. 의미 공간에 배치하고 나서야 "저 큰 덩어리는 뭐지?"가 되고, 라벨을 붙이고 나서야 원인이 드러난다.

인접하지만 정당하게 포함되는 것들과는 구분해야 한다 — `bug · software · localization`(IR 기법의 소프트웨어 공학 응용)이나 `clinical · medical`(의료 RAG)은 계보가 이어져 있다.

### 다음 수집 때 고칠 것

- `"knowledge-intensive"` 를 빼거나 `"knowledge-intensive NLP"` 로 좁힌다
- `"information retrieval"` 단독 대신 문맥을 붙이거나, PIR·MIR 클러스터를 사후 제외한다
- 또는 클러스터 단위 제외를 UI 기능으로 만들어 사용자가 직접 쳐내게 한다

지금은 **덩어리를 지우지 않고 그대로 둔다.** 이 코퍼스가 M3 Flow 뷰의 시험대이고, 무관한 덩어리가 섞여 있는 편이 흐름 계산이 그걸 걸러내는지 보기에 낫다.

## 색상 척도 — 선형 min-max의 실패

발행연도를 1945–2026 선형으로 칠했더니 **RAG 논문이 전부 같은 노란색**이 됐다.

원인: backfill로 들어온 1945–2013 논문 864편(8%)이 범위를 81년으로 늘려, 실제 코퍼스의 92%가 있는 2014–2026 13년이 **색상 범위의 16%에 압축**된 것이다.

**분위(quantile) 척도로 바꿨다.** 논문 수 기준으로 나누므로 색이 고르게 퍼진다. 범례 눈금이 이렇게 나온다:

```
1945 ─── 2016 ─── 2020 ─── 2023 ─── 2026
```

눈금은 균등 간격인데 연도 간격은 다르다. 하위 1/4이 1945–2016(희박한 꼬리)을 흡수하고 나머지 3/4를 2016–2026이 쓴다. 색 간격이 시간 간격과 비례하지 않으므로 **범례에 그 사실을 적어 두었다.**

## 라벨링

BERTopic의 c-TF-IDF를 쓴다 — 클러스터 하나를 문서 하나로 합쳐서 특징 용어를 뽑는다.

```
c-TF-IDF(x, c) = tf(x, c) × log(1 + A / f(x))
```

논문마다 TF-IDF를 돌리면 개별 논문의 특이 용어가 뜨지만, 클러스터를 통째로 합치면 "이 덩어리를 다른 덩어리와 구별하는 말"이 뜬다.

두 가지 손질이 라벨 품질을 크게 바꿨다:

- **도메인 상투어 제거** — `propose`, `results`, `framework`, `state-of-the-art` 같은 말은 학술 초록 어디에나 나와 갈래를 구분하지 못한다. 60여 개를 걸러낸다.
- **포함 관계 중복 제거** — `dense`와 `dense retrieval`이 나란히 뜨면 라벨이 낭비된다. 앞선 용어에 포함되는 말은 건너뛴다.

## 화면

- 기본 색상 모드가 **주제 덩어리**다. 45색을 황금각(137.5°)으로 돌려 인접 색이 겹치지 않게 한다
- 클러스터 라벨을 지도에 얹되 **줌에 따라 개수를 늘린다** — 멀리서 6개, 당길수록 45개까지
- 라벨을 클릭하면 그 덩어리만 남고 나머지가 흐려진다
- 미분류(14%)는 회색으로, 덩어리에 속하지 않음을 그대로 보여준다
