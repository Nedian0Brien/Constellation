import path from "node:path";
import { Config } from "@remotion/cli/config";

// deck.gl은 WebGL2로 그린다. 헤드리스 Chrome의 기본 GL로는 그리지 못해 ANGLE을 쓴다
// (https://www.remotion.dev/docs/webgl, `Config.setChromiumOpenGlRenderer`).
Config.setChromiumOpenGlRenderer("angle");
// 컴포지션은 1280×720 CSS 픽셀이고 기기 픽셀 비율 1.5로 1920×1080을 낸다
// (https://www.remotion.dev/docs/scaling). 앱의 10px 제목·22px 영역 이름이 1280 폭
// 창에서와 같은 비율로 보이고, 글꼴 아틀라스는 devicePixelRatio를 따라 선명해진다.
Config.setScale(1.5);
// 1.5px 점과 10px 글자가 JPEG 블록에 뭉개지지 않게 프레임은 PNG로 넘긴다.
Config.setVideoImageFormat("png");

// frontend/src/views/map/의 모듈이 import하는 @deck.gl/*을 이 패키지의 설치본으로 푼다.
// 그대로 두면 frontend/node_modules의 두 번째 deck.gl이 들어와 LayerExtension·luma
// 장치가 두 벌이 된다. luma는 deck을 따라 이 패키지 것으로 온다.
const deck = path.resolve("node_modules/@deck.gl");
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...config.resolve?.alias,
      "@deck.gl/core": path.join(deck, "core"),
      "@deck.gl/layers": path.join(deck, "layers"),
      "@deck.gl/extensions": path.join(deck, "extensions"),
      "@deck.gl/react": path.join(deck, "react"),
    },
  },
}));
