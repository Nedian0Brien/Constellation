import { LayerExtension } from "@deck.gl/core";
// 논문 제목 TextLayer용 deck 확장. 두 가지를 셰이더에서 고친다.
//
// 1. 글자 사각형의 세로 위치를 기기 픽셀에 맞춘다. 글꼴 아틀라스의 글리프를 1:1로
//    표본해도 사각형이 소수 픽셀 위치에 놓이면 세로로 번져 DOM 글자보다 흐리다. DOM도
//    글자 기준선은 세로로 픽셀에 맞추고 가로만 소수 위치를 쓴다. 사각형 네 꼭짓점의
//    소수부가 같으므로(높이가 정수 픽셀) 반올림해도 높이는 그대로다.
//    `project.viewportSize`는 기기 픽셀 단위다(core/shaderlib/project/viewport-uniforms).
// 2. 불투명도 0인 제목은 픽킹에서 뺀다. 제목 배열에는 반 단계 안에 켜질 제목이 미리
//    들어 있고, deck의 픽킹 패스는 알파를 보지 않아 안 보이는 글자 사각형이 툴팁·클릭을
//    받고 그 아래 점을 가렸다. 훅 함수는 레이어 셰이더의 선언보다 앞에 놓이므로
//    `vColor` 대신 varying을 하나 둔다.
export class SnapTextExtension extends LayerExtension {
  static extensionName = "SnapTextExtension";
  getShaders() {
    return {
      inject: {
        "vs:#decl": "out float title_alpha;",
        "vs:#main-end": `
title_alpha = instanceColors.a;
if (gl_Position.w > 0.0) {
  float snapH = project.viewportSize.y;
  float snapY = (gl_Position.y / gl_Position.w * 0.5 + 0.5) * snapH;
  gl_Position.y = (floor(snapY + 0.5) / snapH * 2.0 - 1.0) * gl_Position.w;
}
`,
        "fs:#decl": "in float title_alpha;",
        "fs:DECKGL_FILTER_COLOR": `
if (bool(picking.isActive) && title_alpha <= 0.0) discard;
`,
      },
    };
  }
}
