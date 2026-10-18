"""Run the backend's own Q18 keyword+negation checker over every string of a live response (argv[1] = JSON file).
Q18 = 'no' → face and voice both disallowed. Prints JSON {violations:[...], strings:N}."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "SOSU_py"))
from app.domain.validator import FACE_KEYWORDS, VOICE_KEYWORDS, find_violations  # noqa: E402


def walk(node, path="data"):
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")


data = json.load(open(sys.argv[1], encoding="utf-8"))["data"]
out, n = [], 0
for path, text in walk(data):
    n += 1
    for kind, kws in (("face", FACE_KEYWORDS), ("voice", VOICE_KEYWORDS)):
        hits = find_violations(text, kws)
        if hits:
            out.append({"path": path, "kind": kind, "hits": hits, "text": text[:120]})
print(json.dumps({"violations": out, "strings": n}, ensure_ascii=False))
