import { LayerExtension } from "@deck.gl/core";
// 글자 사각형의 세로 위치를 기기 픽셀에 맞추는 deck 확장. 글꼴 아틀라스의 글리프를
// 1:1로 표본해도 사각형이 소수 픽셀 위치에 놓이면 세로로 번져 DOM 글자보다 흐리다.
// DOM도 글자 기준선은 세로로 픽셀에 맞추고 가로만 소수 위치를 쓴다. 사각형 네
// 꼭짓점의 소수부가 같으므로(높이가 정수 픽셀) 반올림해도 높이는 그대로다.
// `project.viewportSize`는 기기 픽셀 단위다(core/shaderlib/project/viewport-uniforms).
export class SnapTextExtension extends LayerExtension {
  static extensionName = "SnapTextExtension";
  getShaders() {
    return {
      inject: {
        "vs:#main-end": `
if (gl_Position.w > 0.0) {
  float snapH = project.viewportSize.y;
  float snapY = (gl_Position.y / gl_Position.w * 0.5 + 0.5) * snapH;
  gl_Position.y = (floor(snapY + 0.5) / snapH * 2.0 - 1.0) * gl_Position.w;
}
`,
      },
    };
  }
}
