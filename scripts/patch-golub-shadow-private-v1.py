#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUEUE = ROOT / "apps-script-live/05_RELIABLE_WEBHOOK_QUEUE.js"
SHADOW = ROOT / "apps-script-live/35_GOLUB_SHADOW_PRIVATE.js"

QUEUE_MARKER = "// GOLUB_SHADOW_PRIVATE_V1_INGRESS"
QUEUE_ANCHOR = "function doPost(e) {\n  const miniAppStartWelcome = MINIAPP_handleStartWelcome_(e);"
QUEUE_REPLACEMENT = """function doPost(e) {
  // GOLUB_SHADOW_PRIVATE_V1_INGRESS
  // Owner-only private shadow messages are handled before the generic Royal CRM
  // queue. Every normal ChatKeeper/Mini App event still follows the old path.
  const golubShadowPrivate =
    typeof GOLUB_SHADOW_tryHandleOwnerPrivate_ === 'function'
      ? GOLUB_SHADOW_tryHandleOwnerPrivate_(e)
      : null;
  if (golubShadowPrivate) return golubShadowPrivate;

  const miniAppStartWelcome = MINIAPP_handleStartWelcome_(e);"""

OLD_PRIVATE = """function GOLUB_SHADOW_isMarkedPrivate_(item) {
  if (!item) return false;
  var eventMarked = GOLUB_SHADOW_EVENT_NAMES.indexOf(String(item.event || '').toLowerCase()) >= 0;
  var rawPrivate = item.source === 'telegram_update' && item.chatType === 'private';
  var normalizedPrivate = item.chatType === 'private' ||
    (item.chatId && item.userId && item.chatId === item.userId);
  return eventMarked || rawPrivate || normalizedPrivate;
}"""
NEW_PRIVATE = """function GOLUB_SHADOW_isMarkedPrivate_(item) {
  if (!item) return false;
  var eventMarked = GOLUB_SHADOW_EVENT_NAMES.indexOf(String(item.event || '').toLowerCase()) >= 0;
  var rawPrivate = item.source === 'telegram_update' && item.chatType === 'private';
  var normalizedPrivate = item.chatType === 'private' ||
    (item.chatId && item.userId && item.chatId === item.userId);
  // A marker alone is never enough: the payload must also prove private-chat
  // semantics. This prevents a malformed group webhook from entering shadow AI.
  return Boolean(normalizedPrivate && (eventMarked || rawPrivate));
}"""


def patch_queue() -> None:
    text = QUEUE.read_text(encoding="utf-8")
    if QUEUE_MARKER in text:
        print("Golub shadow private queue ingress already patched: OK")
        return
    count = text.count(QUEUE_ANCHOR)
    if count != 1:
        raise SystemExit(f"doPost anchor: expected exactly one, got {count}")
    QUEUE.write_text(text.replace(QUEUE_ANCHOR, QUEUE_REPLACEMENT, 1), encoding="utf-8")
    print("Golub shadow private queue ingress patched: OK")


def patch_shadow_guard() -> None:
    text = SHADOW.read_text(encoding="utf-8")
    if NEW_PRIVATE in text:
        print("Golub shadow private semantic guard already patched: OK")
        return
    count = text.count(OLD_PRIVATE)
    if count != 1:
        raise SystemExit(f"private guard anchor: expected exactly one, got {count}")
    SHADOW.write_text(text.replace(OLD_PRIVATE, NEW_PRIVATE, 1), encoding="utf-8")
    print("Golub shadow private semantic guard patched: OK")


def main() -> None:
    patch_queue()
    patch_shadow_guard()


if __name__ == "__main__":
    main()
