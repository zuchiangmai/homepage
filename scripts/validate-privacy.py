#!/usr/bin/env python3
"""Compare public Privacy pages and assets with the tracked release files."""
import argparse
import subprocess
from pathlib import Path


def validate(root, base_url):
    tracked = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z', '--', 'privacy/'])
    files = tracked.decode().split('\0')[:-1]
    if not files:
        raise ValueError('Privacy payload is missing')

    for relative in files:
        local_bytes = (root / relative).read_bytes()
        public_path = relative.removesuffix('index.html')
        url = base_url.rstrip('/') + '/' + public_path
        response = subprocess.check_output([
            'curl', '--fail', '--silent', '--show-error', '--connect-timeout', '5',
            '--max-time', '20', '--write-out', '\n%{http_code}', url,
        ])
        content, status = response.rsplit(b'\n', 1)
        if status != b'200':
            raise ValueError('HTTP failure: ' + relative)
        if content != local_bytes:
            raise ValueError('Content mismatch: ' + relative)
    return len(files)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--base-url', default='https://4seas.xyz/')
    args = parser.parse_args()
    try:
        count = validate(args.root, args.base_url)
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        parser.exit(1, 'Privacy validation failed: %s\n' % exc)
    print('Verified %d Privacy pages/assets by HTTP status and content.' % count)
