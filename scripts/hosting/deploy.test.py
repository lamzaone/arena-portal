"""Run the real deployment shell with an offline SSH/SCP transport fixture."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parent
RESET = "kex_exchange_identification: read: Connection reset by peer\nConnection reset by fixture port 22"

# Only network commands and backoff waits are replaced. Bash, exit handling,
# credential files and activation-script input are exercised by the real script.
TRANSPORT = r'''#!/usr/bin/python3
import json, os, pathlib, stat, sys
root = pathlib.Path(os.environ["TRANSPORT_ROOT"])
args = sys.argv[1:]
command = pathlib.Path(sys.argv[0]).name
stage = ("sleep" if command == "sleep" else "public-ip" if command == "curl" else
         "version" if args == ["-V"] else "upload" if command == "scp" else
         "check" if args[-1] == "true" else "activate" if args[-1].startswith("bash -s -- ") else "prepare")
log = root / "calls.jsonl"
calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
event = {"stage": stage, "args": args}
if stage in ("prepare", "upload", "activate", "check"):
    key = pathlib.Path(args[args.index("-i") + 1])
    hosts = pathlib.Path(next(arg.split("=", 1)[1] for arg in args if arg.startswith("UserKnownHostsFile=")))
    event["key_mode"] = stat.S_IMODE(key.stat().st_mode)
    event["hosts_mode"] = stat.S_IMODE(hosts.stat().st_mode)
    event["key_matches"] = key.read_text() == os.environ["SSH_PRIVATE_KEY"] + "\n"
    event["hosts_matches"] = hosts.read_text() == os.environ["SSH_KNOWN_HOSTS"] + "\n"
    event["key_path"] = str(key)
    event["hosts_path"] = str(hosts)
if stage == "activate":
    (root / "activation-input").write_text(sys.stdin.read())
with log.open("a") as output:
    output.write(json.dumps(event) + "\n")
outcomes = json.loads(os.environ["TRANSPORT_OUTCOMES"]).get(stage, [])
attempt = sum(call["stage"] == stage for call in calls)
code, error = outcomes[attempt] if attempt < len(outcomes) else (0, "")
if stage == "upload":
    archive = pathlib.Path(args[-2])
    (root / "uploaded-archive").write_bytes(archive.read_bytes() if code == 0 else b"partial upload")
if error:
    print(error, file=sys.stderr)
if code == 0 and stage == "public-ip":
    print("198.51.100.42")
if code == 0 and stage == "version":
    print("OpenSSH fixture client", file=sys.stderr)
raise SystemExit(code)
'''


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "project"
        (self.project / "scripts/hosting").mkdir(parents=True)
        self.assertTrue((SCRIPTS / "deploy.sh").is_file(), "Deployment transport script is missing")
        for name in ("deploy.sh", "activate.sh"):
            shutil.copyfile(SCRIPTS / name, self.project / "scripts/hosting" / name)
        (self.project / "dist").mkdir()
        (self.project / "dist/freakhosting-release.tar.gz").write_bytes(b"complete release fixture")
        self.runner_temp = self.root / "runner-temp"
        self.runner_temp.mkdir()
        commands = self.root / "bin"
        commands.mkdir()
        for command in ("ssh", "scp", "sleep", "curl"):
            path = commands / command
            path.write_text(TRANSPORT)
            path.chmod(0o700)
        self.env = dict(os.environ, PATH=str(commands) + os.pathsep + os.environ["PATH"],
                        RUNNER_TEMP=str(self.runner_temp), TRANSPORT_ROOT=str(self.root),
                        SSH_HOST="ssh.example.test", SSH_PORT="2222", SSH_USER="website_user",
                        SSH_PRIVATE_KEY="PRIVATE KEY FIXTURE\nsecond line",
                        SSH_KNOWN_HOSTS="[ssh.example.test]:2222 ssh-ed25519 fixture",
                        RELEASE_ID="sha-123-2")

    def deploy(self, outcomes=None, arguments=(), **overrides):
        env = dict(self.env, TRANSPORT_OUTCOMES=json.dumps(outcomes or {}), **overrides)
        result = subprocess.run(["bash", "scripts/hosting/deploy.sh", *arguments], cwd=self.project,
                                env=env, capture_output=True, text=True, timeout=10)
        self.assertNotIn(self.env["SSH_PRIVATE_KEY"], result.stdout + result.stderr)
        self.assertEqual(list(self.runner_temp.iterdir()), [], "Credentials must be cleaned up")
        return result

    def calls(self, stage=None):
        log = self.root / "calls.jsonl"
        calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return calls if stage is None else [call for call in calls if call["stage"] == stage]

    def test_transient_handshake_reset_recovers_before_upload_and_activation(self):
        result = self.deploy({"prepare": [[255, RESET]]})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["stage"] for call in self.calls()],
                         ["prepare", "sleep", "prepare", "upload", "activate"])
        self.assertEqual((self.root / "uploaded-archive").read_bytes(), b"complete release fixture")
        self.assertEqual((self.root / "activation-input").read_text(), (SCRIPTS / "activate.sh").read_text())

    def test_persistent_reset_is_bounded_and_never_uploads_or_activates(self):
        result = self.deploy({"prepare": [[255, RESET]] * 5})
        self.assertEqual(result.returncode, 255, result.stderr)
        self.assertEqual([call["stage"] for call in self.calls()],
                         ["prepare", "sleep", "prepare", "sleep", "prepare"])
        self.assertEqual([call["args"] for call in self.calls("sleep")], [["5"], ["10"]])
        self.assertIn("FREAKHOSTING_SSH_HOST", result.stderr)
        self.assertIn("FREAKHOSTING_SSH_PORT", result.stderr)
        self.assertIn("GitHub Actions", result.stderr)

    def test_authentication_and_host_key_errors_stop_without_retries(self):
        for error in ("Permission denied (publickey).", "Host key verification failed.",
                      "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!\nConnection closed by fixture port 2222"):
            with self.subTest(error=error):
                (self.root / "calls.jsonl").unlink(missing_ok=True)
                result = self.deploy({"prepare": [[255, error]]})
                self.assertEqual(result.returncode, 255, result.stderr)
                self.assertEqual([call["stage"] for call in self.calls()], ["prepare"])

    def test_upload_reset_replaces_partial_archive_before_activation(self):
        result = self.deploy({"upload": [[1, "client_loop: send disconnect: Broken pipe\nscp: Connection closed"]]})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["stage"] for call in self.calls()],
                         ["prepare", "upload", "sleep", "upload", "activate"])
        self.assertEqual((self.root / "uploaded-archive").read_bytes(), b"complete release fixture")
        self.assertEqual(self.calls("upload")[0]["args"], self.calls("upload")[1]["args"])

    def test_persistent_upload_reset_never_activates(self):
        result = self.deploy({"upload": [[255, RESET]] * 5})
        self.assertEqual(result.returncode, 255, result.stderr)
        self.assertEqual(len(self.calls("upload")), 3)
        self.assertEqual(self.calls("activate"), [])

    def test_remote_disk_error_does_not_retry_upload(self):
        result = self.deploy({"upload": [[1, "scp: write remote: No space left on device\nscp: Connection closed"]]})
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual([call["stage"] for call in self.calls()], ["prepare", "upload"])

    def test_activation_disconnect_is_never_replayed(self):
        result = self.deploy({"activate": [[255, RESET]]})
        self.assertEqual(result.returncode, 255, result.stderr)
        self.assertEqual([call["stage"] for call in self.calls()], ["prepare", "upload", "activate"])
        self.assertIn("not retried", result.stderr)
        self.assertIn("unknown", result.stderr)

    def test_activation_failure_preserves_status_and_rollback_output(self):
        result = self.deploy({"activate": [[23, "Rollback healthy: old-release"]]})
        self.assertEqual(result.returncode, 23, result.stderr)
        self.assertEqual(len(self.calls("activate")), 1)
        self.assertIn("Rollback healthy: old-release", result.stderr)

    def test_transport_keeps_host_verification_and_private_credentials(self):
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        for call in self.calls():
            self.assertIn("StrictHostKeyChecking=yes", call["args"])
            self.assertIn("BatchMode=yes", call["args"])
            self.assertIn("IdentitiesOnly=yes", call["args"])
            self.assertIn("ServerAliveInterval=15", call["args"])
            self.assertEqual(call["key_mode"], 0o600)
            self.assertEqual(call["hosts_mode"], 0o600)
            self.assertTrue(call["key_matches"] and call["hosts_matches"])
            self.assertFalse(Path(call["key_path"]).exists())
            self.assertFalse(Path(call["hosts_path"]).exists())
        self.assertEqual(self.calls("upload")[0]["args"][-1],
                         "website_user@ssh.example.test:arena-portal/sha-123-2.tar.gz")
        self.assertEqual(self.calls("activate")[0]["args"][-1], "bash -s -- 'sha-123-2'")

    def test_invalid_release_or_port_fails_before_network_access(self):
        for overrides in ({"RELEASE_ID": "../../escape"}, {"RELEASE_ID": "bad';touch injected"},
                          {"SSH_PORT": "65536"}, {"SSH_PORT": "0"}):
            with self.subTest(overrides=overrides):
                (self.root / "calls.jsonl").unlink(missing_ok=True)
                result = self.deploy(**overrides)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.calls(), [])

    def test_ssh_check_needs_no_build_and_only_runs_a_read_only_remote_command(self):
        (self.project / "dist/freakhosting-release.tar.gz").unlink()
        result = self.deploy(arguments=("--check-ssh",), RELEASE_ID="")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call["stage"] for call in self.calls()], ["public-ip", "version", "check"])
        self.assertIn("198.51.100.42", result.stdout)
        self.assertIn("UTC", result.stdout)
        self.assertIn("OpenSSH fixture client", result.stderr)
        self.assertIn("SSH authentication and remote command succeeded", result.stdout)
        call = self.calls("check")[0]
        self.assertEqual(call["args"][-1], "true")
        for option in ("-vv", "-n", "-T", "StrictHostKeyChecking=yes", "BatchMode=yes", "IdentitiesOnly=yes"):
            self.assertIn(option, call["args"])
        self.assertEqual(call["key_mode"], 0o600)
        self.assertEqual(call["hosts_mode"], 0o600)

    def test_ssh_check_preserves_reset_details_without_deploying_or_retrying(self):
        result = self.deploy({"check": [[255, RESET]]}, arguments=("--check-ssh",))
        self.assertEqual(result.returncode, 255, result.stderr)
        self.assertEqual([call["stage"] for call in self.calls()], ["public-ip", "version", "check"])
        self.assertIn(RESET, result.stderr)
        self.assertIn("SSH diagnostic failed", result.stderr)
        self.assertNotIn("remote command succeeded", result.stdout)

    def test_public_ip_lookup_failure_does_not_prevent_the_ssh_check(self):
        result = self.deploy({"public-ip": [[6, "Could not resolve IP lookup service"]]}, arguments=("--check-ssh",))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.calls("check")), 1)
        self.assertIn("public IPv4 lookup unavailable", result.stderr)
        self.assertIn("SSH authentication and remote command succeeded", result.stdout)

    def test_unknown_or_extra_arguments_cannot_accidentally_start_a_deployment(self):
        for arguments in (("--check",), ("--check-ssh", "extra")):
            with self.subTest(arguments=arguments):
                (self.root / "calls.jsonl").unlink(missing_ok=True)
                result = self.deploy(arguments=arguments)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
