import { LayerExtension } from "@deck.gl/core";
// 영역 배경용 deck 확장. ScatterplotLayer의 원을 중심에서 가장자리로 옅어지는 방사형
// 그러데이션으로 바꾼다: 중심 0.10, 반지름의 45%에서 0.04, 가장자리 0(예전 캔버스
// 그러데이션의 세 색 정지점과 같다). `geometry.uv`는 원 안의 단위 좌표라 길이가
// 중심에서의 거리 비율이다(scatterplot-layer-fragment). 픽셀마다 계산하므로 어떤
// 배율에서도 매끈하다.
//
// 불투명도 0.07 아래의 그러데이션은 8비트 화면에서 열두어 단계로 끊겨 확대하면
// 등고선처럼 보인다. 픽셀 자리에 따른 잡음(interleaved gradient noise, Jimenez 2014)을
// ±0.5단계만큼 더해 띠를 흩는다.
export class RegionGradientExtension extends LayerExtension {
  static extensionName = "RegionGradientExtension";
  getShaders() {
    return {
      inject: {
        "fs:DECKGL_FILTER_COLOR": `
float regionD = min(1.0, length(geometry.uv));
color.a *= regionD < 0.45
  ? mix(0.10, 0.04, regionD / 0.45)
  : mix(0.04, 0.0, (regionD - 0.45) / 0.55);
float regionNoise = fract(
  52.9829189 * fract(0.06711056 * gl_FragCoord.x + 0.00583715 * gl_FragCoord.y)
);
color.a += (regionNoise - 0.5) / 128.0;
`,
      },
    };
  }
}
