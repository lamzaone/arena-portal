"""Packaging must include runtime assets and exclude environment files."""
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("package.sh")


class PackageTests(unittest.TestCase):
    def test_runtime_assets_included_and_private_env_files_excluded(self):
        self.assertTrue(SCRIPT.exists(), "Release packaging is not implemented")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            files = {
                ".next/standalone/server.js": "server",
                ".next/standalone/.next/BUILD_ID": "build",
                ".next/standalone/.env.local": "SECRET=never-ship",
                ".next/standalone/nested/.env.production": "SECRET=never-ship",
                ".next/static/chunks/app.js": "javascript",
                "public/logo.svg": "image",
                "scripts/hosting/start-hosting.sh": "launcher",
                "scripts/hosting/package.sh": SCRIPT.read_text(),
            }
            for name, content in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
            result = subprocess.run(["bash", str(root / "scripts/hosting/package.sh")],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            with tarfile.open(root / "dist/freakhosting-release.tar.gz") as bundle:
                names = {n.removeprefix("./") for n in bundle.getnames()}
                self.assertTrue({"server.js", ".next/BUILD_ID", ".next/static/chunks/app.js",
                                 "public/logo.svg", "start-hosting.sh"}.issubset(names))
                self.assertFalse(any(Path(n).name.startswith(".env") for n in names))


if __name__ == "__main__":
    unittest.main()
