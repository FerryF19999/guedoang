"""Run browser checks against a disposable database, including on developer machines."""
from contextlib import contextmanager
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]

@contextmanager
def preview():
    with TemporaryDirectory(prefix='guedoang-qa-') as directory:
        env = {key: value for key, value in os.environ.items()
               if key not in {'DATABASE_URL', 'VERCEL', 'POSTGRES_URL'}}
        env.update(HOST='127.0.0.1', PORT='0', POLL_DB_PATH=str(Path(directory) / 'polls.sqlite'))
        proc = subprocess.Popen(['node', 'scripts/serve.mjs'], cwd=ROOT, env=env,
                                stdout=subprocess.PIPE, text=True)
        try:
            line = proc.stdout.readline().strip()
            if not line.startswith('Gue Doang? preview listening on '):
                raise RuntimeError(f'Preview failed to start: {line}')
            yield 'http://' + line.rsplit(' ', 1)[-1]
        finally:
            proc.terminate()
            proc.wait(timeout=10)
            proc.stdout.close()

def chromium(playwright):
    return playwright.chromium.launch(channel=os.environ.get('PLAYWRIGHT_CHANNEL'), headless=True)
