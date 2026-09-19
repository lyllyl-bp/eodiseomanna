"""Refresh the standalone Pages graph from the app's generated network (stdlib only)."""

import argparse
import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def update_graph(check=False):
    source = (ROOT / "src/data/network.generated.ts").read_text()
    data = {}
    for key, name in (
        ("lines", "generatedLines"),
        ("rideEdges", "generatedRideEdges"),
        ("transfers", "generatedTransferEdges"),
    ):
        match = re.search(rf"export const {name} = (\[.*?\]) as const;", source, re.S)
        if not match:
            raise ValueError(f"Missing generated data: {name}")
        data[key] = json.loads(match[1])
    data["lines"] = [
        {key: line[key] for key in ("id", "label", "color")}
        for line in data["lines"]
    ]
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    page = ROOT / "docs/graph/index.html"
    document = page.read_text()
    frames = list(re.finditer(r'data-srcdoc="([^"]*)"', document))
    if len(frames) != 1:
        raise ValueError("Expected exactly one exported graph frame")
    frame = frames[0]
    inner = html.unescape(frame[1])
    if check:
        dataset = re.search(r'<script type="application/json" id="network-data">(.*?)</script>', inner, re.S)
        if not dataset or json.loads(dataset[1]) != data:
            raise SystemExit("Graph data is stale. Run python3 scripts/update_graph_data.py")
        print("Graph data matches the app network")
        return
    inner, count = re.subn(
        r'(<script type="application/json" id="network-data">).*?(</script>)',
        lambda match: match[1] + payload + match[2],
        inner,
        flags=re.S,
    )
    if count != 1:
        raise ValueError("Expected exactly one network dataset")
    page.write_text(document[:frame.start(1)] + html.escape(inner, quote=True) + document[frame.end(1):])
    print(f"Graph updated: {len(data['lines'])} lines, {len(data['rideEdges'])} ride edges")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify without changing the page")
    update_graph(check=parser.parse_args().check)
