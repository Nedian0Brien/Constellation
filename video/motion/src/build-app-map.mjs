// 앱 지도 모듈을 브라우저 전역(AppMap) 하나로 묶는다. esbuild는 video 패키지(Remotion)의 것을 쓴다.
import { build } from "../../node_modules/esbuild/lib/main.js";
await build({
  entryPoints: [new URL("app-map.entry.ts", import.meta.url).pathname],
  bundle: true,
  format: "iife",
  globalName: "AppMap",
  target: "es2020",
  outfile: new URL("../app-map.js", import.meta.url).pathname,
  banner: { js: "// build-app-map.mjs가 frontend/src/views/map에서 만든다. 직접 고치지 않는다." },
  logLevel: "info",
});
