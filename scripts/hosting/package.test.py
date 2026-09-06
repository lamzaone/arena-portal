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
                ".playwright-browsers/chromium-headless/chrome": "browser",
                "scripts/warm-weapon-thumbnails.mjs": "warmer",
                "scripts/weapon-thumbnail-warmup.mjs": "model selection",
                "lib/economy/weapon-thumbnail.ts": "identity",
                "lib/economy/thumbnail-browser.ts": "browser launch options",
                "lib/economy/thumbnail-paths.ts": "persistent cache locations",
                ".next/standalone/node_modules/playwright/index.js": "runtime dependency",
                "node_modules/playwright/index.js": "build dependency",
            }
            for name, content in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
            external = root / ".next/standalone/.next/node_modules/playwright-hash"
            external.parent.mkdir(parents=True, exist_ok=True)
            external.symlink_to(root / "node_modules/playwright", target_is_directory=True)
            result = subprocess.run(["bash", str(root / "scripts/hosting/package.sh")],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            with tarfile.open(root / "dist/freakhosting-release.tar.gz") as bundle:
                names = {n.removeprefix("./") for n in bundle.getnames()}
                self.assertTrue({"server.js", ".next/BUILD_ID", ".next/static/chunks/app.js",
                                 "public/logo.svg", "start-hosting.sh"}.issubset(names))
                self.assertFalse(any(Path(n).name.startswith(".env") for n in names))
                self.assertTrue({".playwright-browsers/chromium-headless/chrome", "scripts/warm-weapon-thumbnails.mjs", "lib/economy/weapon-thumbnail.ts", "lib/economy/thumbnail-browser.ts"}.issubset(names))
                self.assertTrue({"scripts/weapon-thumbnail-warmup.mjs", "lib/economy/thumbnail-paths.ts"}.issubset(names))
                link = next(member for member in bundle.getmembers() if member.name.removeprefix("./") == ".next/node_modules/playwright-hash")
                self.assertEqual(link.linkname, "../../node_modules/playwright")


if __name__ == "__main__":
    unittest.main()
