"""Packaging must include runtime assets and exclude environment files."""
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("package.sh")


class PackageTests(unittest.TestCase):
    def test_native_sharp_libraries_survive_incomplete_standalone_tracing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            files = {
                ".next/standalone/server.js": "server",
                ".next/static/app.js": "javascript",
                "scripts/hosting/start-hosting.sh": "launcher",
                "scripts/hosting/package.sh": SCRIPT.read_text(),
                # The addon and metadata can be traced without the library
                # loaded by the operating system's dynamic linker.
                ".next/standalone/node_modules/@img/sharp-linux-x64/lib/sharp.node": "addon",
                ".next/standalone/node_modules/@img/sharp-libvips-linux-x64/versions.json": "{}",
                "node_modules/@img/sharp-linux-x64/lib/sharp.node": "addon",
                "node_modules/@img/sharp-linux-x64/package.json": "{}",
                "node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.6": "native libvips",
                "node_modules/@img/sharp-libvips-linux-x64/package.json": "{}",
                "node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.18.6.dll": "native dll",
                "node_modules/unrelated-build-tool/private.txt": "do not ship",
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
                self.assertIn("node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.6", names)
                self.assertIn("node_modules/@img/sharp-linux-x64/lib/sharp.node", names)
                self.assertIn("node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.18.6.dll", names)
                self.assertNotIn("node_modules/unrelated-build-tool/private.txt", names)

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
