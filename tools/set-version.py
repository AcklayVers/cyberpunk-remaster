"""Set the next stable release version and its versioned download URL."""
import json
from pathlib import Path
import re
import sys

if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
    raise SystemExit("Usage: python tools/set-version.py 1.2.3")
root = Path(__file__).resolve().parent.parent
manifest_path = root / "module.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
version = sys.argv[1]
if tuple(map(int, version.split("."))) <= tuple(map(int, manifest["version"].split("."))):
    raise SystemExit("The new version must be greater than the current version")
manifest["version"] = version
manifest["download"] = manifest["url"] + f"/releases/download/v{version}/{manifest['id']}.zip"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
for filename in ("package.json", "package-lock.json"):
    file = root / filename
    if file.exists():
        data = json.loads(file.read_text(encoding="utf-8-sig"))
        data["version"] = version
        if "" in data.get("packages", {}):
            data["packages"][""]["version"] = version
        file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Prepared {manifest['id']} {version}")
