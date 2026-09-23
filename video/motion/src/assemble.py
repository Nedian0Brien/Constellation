# video.html 조립: new.mjs가 만든 파일(엔진 포함)의 장면 스크립트를 src/video.js로 바꾸고
# head에 data.js를 넣는다. 엔진 부분은 건드리지 않는다. 서체는 시스템 서체라 링크가 없다.
import pathlib
here = pathlib.Path(__file__).parent
f = here.parent / "video.html"
html = f.read_text()
marker = "<!-- STYLE.type에서 고른 웹폰트의 <link>를 여기에 둔다. 한글이 들어가면 한글 글리프가 있는 서체도 함께. -->"
if marker in html:
    html = html.replace(marker, '<script src="data.js"></script>')
end = html.index("/* END MOTION ENGINE */\n</script>\n") + len("/* END MOTION ENGINE */\n</script>\n")
tail = html.index("</body>")
html = html[:end] + "<script>\n" + (here / "video.js").read_text() + "</script>\n" + html[tail:]
f.write_text(html)
print("assembled video.html")
