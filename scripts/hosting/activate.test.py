"""Linux integration tests for release activation and scoped restarts."""
import os
from pathlib import Path
import socket
import subprocess
import tarfile
import tempfile
import time
import unittest

SCRIPTS = Path(__file__).resolve().parent


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue((SCRIPTS / "activate.sh").is_file(), "Release activation is not implemented")
        self.assertTrue((SCRIPTS / "start-hosting.sh").is_file(), "Hosting launcher is not implemented")
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.env = dict(os.environ, ARENA_DEPLOY_ROOT=str(self.root), ARENA_HEALTH_ATTEMPTS="8")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.env["PORT"] = str(sock.getsockname()[1])
        (self.root / ".env.production").write_text("SESSION_SECRET=fixture\n")
        self.supervisor = None

    def tearDown(self):
        if self.supervisor:
            self.supervisor.terminate()
            self.supervisor.wait(timeout=5)
        pidfile = self.root / "app.pid"
        if pidfile.exists():
            try:
                os.kill(int(pidfile.read_text()), 15)
            except ProcessLookupError:
                pass
        self.temp.cleanup()

    def archive(self, release, healthy=True):
        source = self.root / ("fixture-" + release)
        source.mkdir()
        (source / "server.js").write_text("fixture")
        (source / "healthy").write_text(str(healthy))
        (source / "start-hosting.sh").write_bytes((SCRIPTS / "start-hosting.sh").read_bytes())
        (source / ".next").mkdir()
        (source / ".next/BUILD_ID").write_text(release)
        archive = self.root / (release + ".tar.gz")
        with tarfile.open(archive, "w:gz") as output:
            output.add(source, arcname=".")
        return archive

    def activate(self, release):
        return subprocess.run(["bash", str(SCRIPTS / "activate.sh"), release],
                              env=self.env, capture_output=True, text=True, timeout=25)

    def supervise(self):
        # A tiny real HTTP process substitutes for Node, allowing tests without
        # building Next. The real launcher, PID ownership and /proc checks run.
        tools = self.root / "bin"
        tools.mkdir()
        node = tools / "node"
        node.write_text("#!/usr/bin/python3\n"
                        "import http.server,os,pathlib\n"
                        "if pathlib.Path('healthy').read_text() != 'True': raise SystemExit(1)\n"
                        "class H(http.server.BaseHTTPRequestHandler):\n"
                        " def do_GET(self):\n"
                        "  self.send_response(200); self.end_headers(); self.wfile.write(b'{\"status\":\"ok\"}')\n"
                        " def log_message(self,*args): pass\n"
                        "http.server.HTTPServer(('127.0.0.1',int(os.environ['PORT'])),H).serve_forever()\n")
        node.chmod(0o700)
        env = dict(self.env, PATH=str(tools) + os.pathsep + os.environ["PATH"])
        self.supervisor = subprocess.Popen(
            ["bash", "-c", 'while true; do bash "$ARENA_DEPLOY_ROOT/start-hosting.sh"; sleep 0.1; done'],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            if (self.root / "app.pid").exists():
                time.sleep(0.2)
                return
            time.sleep(0.1)
        self.fail("Supervisor did not launch")

    def test_first_release_is_staged_without_claiming_it_is_live(self):
        self.archive("release-1")
        result = self.activate("release-1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("First release staged", result.stdout)
        self.assertEqual((self.root / "current").resolve().name, "release-1")
        self.assertTrue((self.root / "start-hosting.sh").is_file())
        self.assertEqual((self.root / ".env.production").read_text(), "SESSION_SECRET=fixture\n")

    def test_healthy_update_restarts_into_new_release(self):
        self.archive("release-1")
        self.assertEqual(self.activate("release-1").returncode, 0)
        self.supervise()
        self.archive("release-2")
        result = self.activate("release-2")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Healthy release: release-2", result.stdout)
        self.assertEqual((self.root / "current").resolve().name, "release-2")

    def test_failed_update_restores_previous_release(self):
        self.archive("release-1")
        self.assertEqual(self.activate("release-1").returncode, 0)
        self.supervise()
        self.archive("release-bad", healthy=False)
        result = self.activate("release-bad")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "current").resolve().name, "release-1")
        self.assertIn("Rollback healthy", result.stderr)

    def test_uploads_survive_updates_and_old_releases_are_pruned(self):
        legacy = self.root / "public/images/economy/custom"
        legacy.mkdir(parents=True)
        (legacy / "legacy.png").write_bytes(b"legacy image")
        self.archive("release-1")
        self.assertEqual(self.activate("release-1").returncode, 0)
        custom = self.root / "current/public/images/economy/custom"
        self.assertTrue(custom.is_symlink())
        self.assertEqual((custom / "legacy.png").read_bytes(), b"legacy image")
        (custom / "uploaded.png").write_bytes(b"new image")
        self.supervise()
        for release in ["release-2", "release-3"]:
            self.archive(release)
            result = self.activate(release)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((custom / "uploaded.png").read_bytes(), b"new image")
        self.assertFalse((self.root / "releases/release-1").exists())
        self.assertTrue((self.root / "releases/release-2").exists())
        self.assertTrue((self.root / "releases/release-3").exists())

    def test_invalid_release_path_is_rejected(self):
        result = self.activate("../escape")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "current").exists())

    def test_unrelated_pid_is_not_signalled_or_switched(self):
        self.archive("release-1")
        self.assertEqual(self.activate("release-1").returncode, 0)
        other = subprocess.Popen(["sleep", "30"])
        try:
            (self.root / "app.pid").write_text(str(other.pid))
            self.archive("release-2")
            result = self.activate("release-2")
            self.assertNotEqual(result.returncode, 0)
            self.assertIsNone(other.poll())
            self.assertEqual((self.root / "current").resolve().name, "release-1")
        finally:
            (self.root / "app.pid").unlink(missing_ok=True)
            other.terminate()
            other.wait()


if __name__ == "__main__":
    unittest.main()
