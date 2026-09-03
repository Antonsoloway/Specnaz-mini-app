#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "apps-script-live/05_RELIABLE_WEBHOOK_QUEUE.js"
MARKER = "// GOLUB_SHADOW_PRIVATE_V1_INGRESS"
ANCHOR = "function doPost(e) {\n  const miniAppStartWelcome = MINIAPP_handleStartWelcome_(e);"
REPLACEMENT = """function doPost(e) {
  // GOLUB_SHADOW_PRIVATE_V1_INGRESS
  // Owner-only private shadow messages are handled before the generic Royal CRM
  // queue. Every normal ChatKeeper/Mini App event still follows the old path.
  const golubShadowPrivate =
    typeof GOLUB_SHADOW_tryHandleOwnerPrivate_ === 'function'
      ? GOLUB_SHADOW_tryHandleOwnerPrivate_(e)
      : null;
  if (golubShadowPrivate) return golubShadowPrivate;

  const miniAppStartWelcome = MINIAPP_handleStartWelcome_(e);"""


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")
    if MARKER in text:
        print("Golub shadow private ingress already patched: OK")
        return
    count = text.count(ANCHOR)
    if count != 1:
        raise SystemExit(f"doPost anchor: expected exactly one, got {count}")
    TARGET.write_text(text.replace(ANCHOR, REPLACEMENT, 1), encoding="utf-8")
    print("Golub shadow private ingress patched: OK")


if __name__ == "__main__":
    main()
