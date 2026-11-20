import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location("release", Path(__file__).with_name("release.py"))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "модуль"
        self.root.mkdir()
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.repository = "example/test-module"
        self.manifest = {
            "id": "test-module", "title": "Test module", "version": "1.2.3",
            "compatibility": {"minimum": "14", "verified": "14"},
            "url": "https://github.com/example/test-module",
            "manifest": "https://github.com/example/test-module/releases/latest/download/module.json",
            "download": "https://github.com/example/test-module/releases/download/v1.2.3/test-module.zip",
            "esmodules": ["scripts/main.mjs"],
            "packs": [{"name": "items", "path": "packs/items", "type": "Item"}],
        }
        self.put("module.json", json.dumps(self.manifest).encode())
        self.put("scripts/main.mjs", b"export const ready = true;\n")
        self.put("packs/items/CURRENT", b"MANIFEST-000002\n")
        self.put("packs/items/MANIFEST-000002", b"\x00binary manifest\xff")
        self.put("packs/items/000003.log", b"\x00essential transactions\xff")
        self.put("packs/items/LOCK", b"")
        self.put("packs/items/LOG", b"runtime log")
        self.put(".author-paths.local.json", b'{"private":"local"}')
        self.put(".github/workflows/release.yml", b"admin")
        self.put("AGENTS.md", b"admin")
        self.put("node_modules/dependency/index.js", b"dev dependency")
        subprocess.run(["git", "-C", str(self.root), "add", "--all"], check=True, capture_output=True)
        self.output = Path(self.temp.name) / "dist"

    def put(self, path, data):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def build(self):
        return release.build_release(self.root, self.repository, self.output)

    def test_preserves_compendium_bytes_and_excludes_private_and_admin_files(self):
        self.build()
        with zipfile.ZipFile(self.output / "test-module.zip") as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.read("test-module/packs/items/000003.log"), b"\x00essential transactions\xff")
            self.assertEqual(set(archive.namelist()), {
                "test-module/module.json", "test-module/scripts/main.mjs",
                "test-module/packs/items/CURRENT", "test-module/packs/items/MANIFEST-000002",
                "test-module/packs/items/000003.log",
            })
            self.assertEqual(archive.read("test-module/module.json"), (self.output / "module.json").read_bytes())
        self.assertIn("test-module.zip", (self.output / "SHA256SUMS").read_text())

    def test_rejects_missing_declared_runtime_resource(self):
        self.manifest["esmodules"] = ["scripts/missing.mjs"]
        self.put("module.json", json.dumps(self.manifest).encode())
        with self.assertRaisesRegex(ValueError, "scripts/missing.mjs"):
            self.build()

    def test_rejects_missing_leveldb_manifest(self):
        (self.root / "packs/items/MANIFEST-000002").unlink()
        with self.assertRaisesRegex(ValueError, "MANIFEST-000002"):
            self.build()

    def test_rejects_mismatched_release_download(self):
        self.manifest["download"] = "https://example.org/latest.zip"
        self.put("module.json", json.dumps(self.manifest).encode())
        with self.assertRaisesRegex(ValueError, "download"):
            self.build()

    def test_rejects_path_outside_module(self):
        self.manifest["esmodules"] = ["../secret.mjs"]
        self.put("module.json", json.dumps(self.manifest).encode())
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            self.build()


if __name__ == "__main__":
    unittest.main()
