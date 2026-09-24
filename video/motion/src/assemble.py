# video.html 조립: new.mjs가 만든 파일(엔진 포함)의 장면 스크립트를 src/video.js로 바꾸고
# head에 앱 지도 코드(app-map.js)와 데이터(data.js)를 넣는다. 엔진 부분은 건드리지 않는다.
# body의 --font-mono와 글자색은 앱 titleTypography()가 읽는 값이다(앱 어두운 테마 실측).
import pathlib, re
here = pathlib.Path(__file__).parent
f = here.parent / "video.html"
html = f.read_text()
HEAD = """<style>body { --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace; color: #e8e8ec; }</style>
<script src="app-map.js"></script>
<script src="data.js"></script>
<script src="assets.js"></script>
"""
head_start = html.index("<title>")
head_end = html.index("</head>")
title_end = html.index("</title>", head_start) + len("</title>\n")
html = html[:title_end] + HEAD + html[head_end:]
end = html.index("/* END MOTION ENGINE */\n</script>\n") + len("/* END MOTION ENGINE */\n</script>\n")
tail = html.index("</body>")
html = html[:end] + "<script>\n" + (here / "video.js").read_text() + "</script>\n" + html[tail:]
f.write_text(html)
print("assembled video.html")
