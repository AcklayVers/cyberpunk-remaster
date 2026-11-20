"""Package tracked Foundry runtime files; keep LevelDB transaction logs intact."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile


def package_path(value):
    if not isinstance(value, str) or not value or "\\" in value:
        raise ValueError(f"Unsafe package path: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or ":" in value:
        raise ValueError(f"Unsafe package path: {value!r}")
    return path.as_posix()


def included(name):
    parts = PurePosixPath(name).parts
    return not (
        any(part.startswith(".") for part in parts)
        or parts[0] in {"tools", "tests", "node_modules", "dist", "tmp", "output", "outputs"}
        or parts[-1] in {"AGENTS.md", "LOCK", "LOG", "LOG.old"}
        or parts[-1].endswith((".pyc", ".local.json"))
        or "__pycache__" in parts
    )


def build_release(root, repository, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Expected repository owner/name")
    git_root = subprocess.check_output(["git", "-C", str(root), "rev-parse", "--show-toplevel"], encoding="utf-8").strip()
    if Path(git_root).resolve() != root:
        raise ValueError("The module must have its own Git repository")
    tracked = subprocess.check_output(["git", "-C", str(root), "ls-files", "-z"]).decode("utf-8").split("\0")
    names = sorted(package_path(name) for name in tracked if name and included(name))
    files = set(names)
    if "module.json" not in files:
        raise ValueError("module.json must be tracked")
    manifest = json.loads((root / "module.json").read_text(encoding="utf-8-sig"))
    module_id, version = manifest["id"], manifest["version"]
    if not re.fullmatch(r"[a-z][a-z0-9-]*", module_id):
        raise ValueError("Invalid Foundry module id")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Use a stable three-part version, e.g. 1.6.40")
    base = "https://github.com/" + repository
    expected = {
        "url": base,
        "manifest": base + "/releases/latest/download/module.json",
        "download": base + f"/releases/download/v{version}/{module_id}.zip",
    }
    for key, value in expected.items():
        if manifest.get(key) != value:
            raise ValueError(f"Incorrect {key}; expected {value}")

    def require_file(value):
        name = package_path(value)
        if name not in files or not (root / name).is_file():
            raise ValueError(f"Missing packaged resource: {name}")
        return name

    for key in ("esmodules", "scripts", "styles"):
        for resource in manifest.get(key, []):
            require_file(resource["src"] if isinstance(resource, dict) else resource)
    for language in manifest.get("languages", []):
        require_file(language["path"])
    for pack in manifest.get("packs", []):
        pack_root = package_path(pack["path"])
        if pack_root.endswith((".db", ".json")):
            require_file(pack_root)
        else:
            current = require_file(pack_root + "/CURRENT")
            level_manifest = (root / current).read_text(encoding="ascii").strip()
            if not re.fullmatch(r"MANIFEST-\d+", level_manifest):
                raise ValueError(f"Invalid LevelDB CURRENT: {current}")
            require_file(pack_root + "/" + level_manifest)

    output.mkdir(parents=True, exist_ok=True)
    archive_path = output / f"{module_id}.zip"
    manifest_bytes = (root / "module.json").read_bytes()
    source_hashes = {}
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name in names:
            local = root / name
            if local.is_symlink() or not local.is_file():
                raise ValueError(f"Not a regular source file: {name}")
            data = local.read_bytes()
            source_hashes[name] = hashlib.sha256(data).hexdigest()
            info = zipfile.ZipInfo(f"{module_id}/{name}", date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() is not None or len(archive.namelist()) != len(names):
            raise ValueError("Archive integrity check failed")
        for name, digest in source_hashes.items():
            if hashlib.sha256(archive.read(f"{module_id}/{name}")).hexdigest() != digest:
                raise ValueError(f"Archive bytes differ: {name}")
        if archive.read(f"{module_id}/module.json") != manifest_bytes:
            raise ValueError("Archive manifest differs from release manifest")
    (output / "module.json").write_bytes(manifest_bytes)
    checksums = "".join(
        f"{hashlib.sha256((output / name).read_bytes()).hexdigest()}  {name}\n"
        for name in ("module.json", archive_path.name)
    )
    (output / "SHA256SUMS").write_text(checksums, encoding="utf-8")
    return {"id": module_id, "version": version, "tag": "v" + version, "files": len(names), "bytes": archive_path.stat().st_size}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY"), required=not bool(os.environ.get("GITHUB_REPOSITORY")))
    parser.add_argument("--output", default="dist")
    args = parser.parse_args()
    result = build_release(Path(__file__).resolve().parent.parent, args.repository, args.output)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
            for key in ("id", "version", "tag"):
                stream.write(f"{key}={result[key]}\n")
    print(json.dumps(result, ensure_ascii=False))
