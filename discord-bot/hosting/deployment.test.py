"""Offline Linux tests: real packaging, launcher, PID checks, restart and rollback."""
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import time
import unittest

SCRIPTS = Path(__file__).resolve().parent


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.env = dict(os.environ, ARENA_BOT_DEPLOY_ROOT=str(self.root), ARENA_BOT_HEALTH_ATTEMPTS='4', ARENA_BOT_STOP_ATTEMPTS='1')
        (self.root / '.env').write_text('DISCORD_BOT_TOKEN=preserve-me\n')
        self.supervisor = None

    def tearDown(self):
        if self.supervisor:
            self.supervisor.terminate()
            self.supervisor.wait(timeout=5)
        pidfile = self.root / 'bot.pid'
        if pidfile.exists():
            try:
                pid = int(pidfile.read_text())
                if Path(f'/proc/{pid}/cwd').resolve().is_relative_to(self.root):
                    os.kill(pid, 9)
            except (ProcessLookupError, FileNotFoundError):
                pass
        self.temp.cleanup()

    def archive(self, name, healthy=True, launcher=None):
        source = self.root / ('fixture-' + name)
        (source / 'src').mkdir(parents=True)
        (source / 'src/index.mjs').write_text('fixture')
        (source / 'healthy').write_text(str(healthy))
        (source / 'node_modules/discord.js').mkdir(parents=True)
        (source / 'node_modules/discord.js/package.json').write_text('{}')
        (source / 'start-hosting.sh').write_text(launcher or (SCRIPTS / 'start-hosting.sh').read_text())
        with tarfile.open(self.root / f'{name}.tar.gz', 'w:gz') as archive:
            archive.add(source, arcname='.')

    def activate(self, name):
        return subprocess.run(['bash', str(SCRIPTS / 'activate.sh'), name], env=self.env,
                              text=True, capture_output=True, timeout=20)

    def supervise(self, wait_for_pid=True):
        tools = self.root / 'bin'
        tools.mkdir()
        node = tools / 'node'
        node.write_text('#!/usr/bin/python3\n'
                        'import os,pathlib,time,signal\n'
                        'mode=pathlib.Path("healthy").read_text()\n'
                        'if mode == "False": raise SystemExit(1)\n'
                        'if mode == "ignore-stop": signal.signal(signal.SIGTERM, signal.SIG_IGN)\n'
                        'status=pathlib.Path(os.environ["ARENA_BOT_HEALTH_DIR"])/str(os.getpid())\n'
                        'while True:\n'
                        ' stamp=int(time.time()) - (60 if mode == "stale" else 0)\n'
                        ' status.write_text(f"{os.getpid()} {stamp} 1\\n")\n'
                        ' time.sleep(0.1)\n')
        node.chmod(0o700)
        env = dict(self.env, PATH=str(tools) + os.pathsep + os.environ['PATH'])
        self.supervisor = subprocess.Popen(['bash', '-c', 'while true; do bash "$ARENA_BOT_DEPLOY_ROOT/start-hosting.sh"; sleep 0.1; done'],
                                          env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not wait_for_pid:
            return
        for _ in range(50):
            if (self.root / 'bot.pid').exists():
                time.sleep(0.2)
                return
            time.sleep(0.1)
        self.fail('Supervisor did not start')

    def test_first_release_stages_without_starting_bot_or_changing_secrets(self):
        self.archive('first')
        result = self.activate('first')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('First bot release staged', result.stdout)
        self.assertEqual((self.root / 'current').resolve().name, 'first')
        self.assertFalse((self.root / 'bot.pid').exists())
        self.assertEqual((self.root / '.env').read_text(), 'DISCORD_BOT_TOKEN=preserve-me\n')

    def test_healthy_update_restarts_and_keeps_previous_release(self):
        self.archive('first')
        self.assertEqual(self.activate('first').returncode, 0)
        self.supervise()
        for name in ['second', 'third']:
            self.archive(name)
            result = self.activate(name)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / 'current').resolve().name, 'third')
        self.assertFalse((self.root / 'releases/first').exists())
        self.assertTrue((self.root / 'releases/second').exists())

    def test_bad_update_rolls_back_release_and_launcher(self):
        previous_launcher = (SCRIPTS / 'start-hosting.sh').read_text() + '\n# previous\n'
        self.archive('first', launcher=previous_launcher)
        self.assertEqual(self.activate('first').returncode, 0)
        self.supervise()
        self.archive('bad', launcher='#!/usr/bin/env bash\nexit 1\n')
        result = self.activate('bad')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Rollback healthy', result.stderr)
        self.assertEqual((self.root / 'current').resolve().name, 'first')
        self.assertEqual((self.root / 'start-hosting.sh').read_text(), previous_launcher)

    def test_unrelated_process_is_not_killed(self):
        self.archive('first')
        self.assertEqual(self.activate('first').returncode, 0)
        other = subprocess.Popen(['sleep', '20'])
        try:
            (self.root / 'bot.pid').write_text(str(other.pid))
            self.archive('second')
            result = self.activate('second')
            self.assertNotEqual(result.returncode, 0)
            self.assertIsNone(other.poll())
            self.assertEqual((self.root / 'current').resolve().name, 'first')
        finally:
            other.terminate()
            other.wait(timeout=5)
            (self.root / 'bot.pid').unlink()

    def test_corrected_release_recovers_from_failed_first_start(self):
        self.archive('first', launcher='#!/usr/bin/env bash\nexit 1\n')
        self.assertEqual(self.activate('first').returncode, 0)
        self.supervise(wait_for_pid=False)
        self.archive('fixed')
        result = self.activate('fixed')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / 'current').resolve().name, 'fixed')

    def test_unresponsive_old_process_is_stopped_before_update(self):
        self.archive('first', healthy='ignore-stop')
        self.assertEqual(self.activate('first').returncode, 0)
        self.supervise()
        self.archive('second')
        result = self.activate('second')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('forcing stop of verified bot process', result.stderr)
        self.assertEqual((self.root / 'current').resolve().name, 'second')

    def test_stale_heartbeat_rolls_back(self):
        self.archive('first')
        self.assertEqual(self.activate('first').returncode, 0)
        self.supervise()
        self.archive('stale', healthy='stale')
        result = self.activate('stale')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Rollback healthy', result.stderr)
        self.assertEqual((self.root / 'current').resolve().name, 'first')

    def test_invalid_release_path_rejected(self):
        result = self.activate('../escape')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'current').exists())

    def test_archive_contains_dependencies_but_not_secrets_or_tests(self):
        project = self.root / 'project'
        bot = project / 'discord-bot'
        for name, value in {'src/index.mjs':'source', 'package.json':'{}', 'package-lock.json':'{}',
                            'node_modules/discord.js/package.json':'{}', 'node_modules/pkg/.env':'secret',
                            '.env':'secret', 'test/nope.mjs':'test', 'hosting/start-hosting.sh':'launcher'}.items():
            path = bot / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
        shutil.copyfile(SCRIPTS / 'package.sh', bot / 'hosting/package.sh')
        result = subprocess.run(['bash', str(bot / 'hosting/package.sh')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        with tarfile.open(project / 'dist/freakhosting-discord-bot.tar.gz') as archive:
            names = {member.removeprefix('./') for member in archive.getnames()}
            self.assertIn('node_modules/discord.js/package.json', names)
            self.assertIn('src/index.mjs', names)
            self.assertIn('start-hosting.sh', names)
            self.assertFalse(any(Path(name).name.startswith('.env') for name in names))
            self.assertNotIn('test/nope.mjs', names)


if __name__ == '__main__':
    unittest.main()
