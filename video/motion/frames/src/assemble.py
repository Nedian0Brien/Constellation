# 스타일 프레임 조립: new.mjs가 만든 파일(엔진 포함)의 장면 스크립트를 src/<v>.js로 바꾸고,
# 웹폰트 링크와 데이터 스크립트를 head에 넣는다. 엔진 부분은 건드리지 않는다.
import sys, re, pathlib
here = pathlib.Path(__file__).parent
FONTS = {
  "a": "family=Noto+Serif+KR:wght@500;700&family=IBM+Plex+Mono:wght@400",
  "b": "family=Gothic+A1:wght@400;800",
  "c": "family=Noto+Sans+KR:wght@400;500;700",
}
for v in sys.argv[1:]:
    html = (here.parent / f"{v}.html").read_text()
    head_marker = "<!-- STYLE.type에서 고른 웹폰트의 <link>를 여기에 둔다. 한글이 들어가면 한글 글리프가 있는 서체도 함께. -->"
    links = (f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{FONTS[v]}&display=swap">\n'
             '<script src="../data.js"></script>\n<script src="src/common.js"></script>')
    if head_marker in html:
        html = html.replace(head_marker, links)
    end = html.index("/* END MOTION ENGINE */\n</script>\n") + len("/* END MOTION ENGINE */\n</script>\n")
    tail = html.index("</body>")
    html = html[:end] + "<script>\n" + (here / f"{v}.js").read_text() + "</script>\n" + html[tail:]
    (here.parent / f"{v}.html").write_text(html)
    print("assembled", v)
