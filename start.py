import os
import json
import subprocess
import sys
import threading
import time
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


services = [
    ("BE", COLOR_CYAN, "backend", f'"{sys.executable}" -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload'),
    ("FE", COLOR_GREEN, "frontend", "npm run start"),
    ("Ngrok", COLOR_GRAY, "", "ngrok http 3000"),
]


def stream_output(pipe, name, color):
    for line in iter(pipe.readline, ""):
        text = line.strip()
        if text:
            print(f"{color}[{name}]{COLOR_RESET} {text}")


def parse_args():
    args = sys.argv[1:]
    headless = any(arg in ("-h", "--headless") for arg in args)
    if headless:
        os.environ["HEADLESS"] = "1"
    return headless


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
    parse_args()
    root = os.path.dirname(os.path.abspath(__file__))
    procs = []

    for name, color, rel_dir, cmd in services:
        cwd = os.path.join(root, rel_dir) if rel_dir else root
        print(f"{COLOR_GRAY}[BOOT]{COLOR_RESET} {color}{name}{COLOR_RESET} -> {cmd}")
        proc = subprocess.Popen(cmd, cwd=cwd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        procs.append((name, proc))
        threading.Thread(target=stream_output, args=(proc.stdout, name, color), daemon=True).start()
        if name == "Ngrok":
            threading.Thread(target=print_ngrok_url, args=(proc,), daemon=True).start()

    print(f"\n{COLOR_GREEN}All services started. Press Ctrl+C to stop.{COLOR_RESET}\n")

    try:
        while any(proc.poll() is None for _, proc in procs):
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        for name, proc in procs:
            if proc.poll() is None:
                print(f"Stopping {name}...")
                if os.name == "nt":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    proc.terminate()
        print("Done.")


if __name__ == "__main__":
    main()