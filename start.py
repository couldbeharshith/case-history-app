import errno
import json
import os
import socket
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from urllib.error import URLError
from urllib.request import urlopen


COLOR_RESET = "\033[0m"
COLOR_CYAN = "\033[36m"
COLOR_GREEN = "\033[32m"
COLOR_GRAY = "\033[90m"


if os.name == "nt":
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)
        mode = ctypes.c_ulong()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            kernel32.SetConsoleMode(handle, mode.value | 4)
    except Exception:
        pass


def stream_output(pipe, name, color):
    with pipe:
        for line in pipe:
            text = line.rstrip()
            if text:
                print(f"{color}[{name}]{COLOR_RESET} {text}", flush=True)


def parse_args():
    args = sys.argv[1:]
    headless = any(arg in ("-h", "--headless") for arg in args)
    if headless:
        os.environ["HEADLESS"] = "1"
    return any(arg in ("-l", "--local") for arg in args)


@contextmanager
def reserve_port(host, preferred_port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        if os.name == "nt":
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            probe.bind((host, preferred_port))
        except OSError as error:
            busy_errors = {errno.EADDRINUSE}
            if os.name == "nt":
                busy_errors.update({errno.WSAEADDRINUSE, errno.WSAEACCES})
            if error.errno not in busy_errors:
                raise
            probe.bind((host, 0))
        yield probe.getsockname()[1]


def print_ngrok_url(proc):
    while proc.poll() is None:
        try:
            with urlopen("http://127.0.0.1:4040/api/tunnels", timeout=1) as response:
                data = json.load(response)
            urls = [tunnel.get("public_url") for tunnel in data.get("tunnels", []) if tunnel.get("public_url")]
            if urls:
                urls.sort(key=lambda url: 0 if url.startswith("https://") else 1)
                print(f"{COLOR_GREEN}[Ngrok]{COLOR_RESET} {', '.join(urls)}")
                return
        except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
            pass
        time.sleep(1)


def main():
    local = parse_args()
    backend_host = "127.0.0.1"
    frontend_host = backend_host if local else "0.0.0.0"
    preferred_backend_port = 8000
    preferred_frontend_port = int(os.environ.get("PORT") or "3000")
    with reserve_port(backend_host, preferred_backend_port) as backend_port:
        with reserve_port(frontend_host, preferred_frontend_port) as frontend_port:
            pass
    for name, preferred, selected in (
        ("BE", preferred_backend_port, backend_port),
        ("FE", preferred_frontend_port, frontend_port),
    ):
        if selected != preferred:
            print(f"[BOOT] {name} port {preferred} unavailable. Using {selected}.", flush=True)

    backend_cmd = f'"{sys.executable}" -u -m uvicorn api:app --host {backend_host} --port {backend_port}'
    frontend_cmd = f"npm run start -- --hostname {frontend_host} --port {frontend_port}"
    frontend_env = {**os.environ, "BACKEND_URL": f"http://{backend_host}:{backend_port}"}
    services = [
        ("BE", COLOR_CYAN, "backend", backend_cmd, None),
        ("FE", COLOR_GREEN, "frontend", frontend_cmd, frontend_env),
    ]
    if not local:
        services.append(("Ngrok", COLOR_GRAY, "", f"ngrok http {frontend_port}", None))

    root = os.path.dirname(os.path.abspath(__file__))
    procs = []

    try:
        for name, color, rel_dir, cmd, env in services:
            cwd = os.path.join(root, rel_dir) if rel_dir else root
            print(f"{COLOR_GRAY}[BOOT]{COLOR_RESET} {color}{name}{COLOR_RESET} -> {cmd}", flush=True)
            proc = subprocess.Popen(
                cmd, cwd=cwd, env=env, shell=True, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, errors="replace", bufsize=1,
            )
            output = threading.Thread(target=stream_output, args=(proc.stdout, name, color), daemon=True)
            procs.append((name, proc, output))
            output.start()
            if name == "Ngrok":
                threading.Thread(target=print_ngrok_url, args=(proc,), daemon=True).start()

        print(f"\nCaseFlow URL: http://127.0.0.1:{frontend_port}. Press Ctrl+C to stop.\n", flush=True)
        app_processes = [(name, proc, output) for name, proc, output in procs if name != "Ngrok"]
        while True:
            for name, proc, output in app_processes:
                exit_code = proc.poll()
                if exit_code is not None:
                    output.join(timeout=1)
                    print(f"[{name}] Exited with code {exit_code}.", flush=True)
                    return exit_code or 1
            time.sleep(1)
    except KeyboardInterrupt:
        return 0
    finally:
        for name, proc, _ in procs:
            if proc.poll() is None:
                print(f"Stopping {name}...")
                if os.name == "nt":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    proc.terminate()
        print("Done.")


if __name__ == "__main__":
    sys.exit(main())
