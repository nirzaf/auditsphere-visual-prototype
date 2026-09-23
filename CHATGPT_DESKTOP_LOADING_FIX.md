# ChatGPT Desktop: Initial Loading Fix

## Symptom

The Linux ChatGPT desktop app remained on its initial loading/blank screen after the app update.

## Repair performed

1. Confirmed the desktop app package and process:

   ```bash
   dpkg-query -W -f='${Package} ${Version}\n' chatgpt
   pgrep -a -x ChatGPT
   ```

2. Checked the native log and verified that the window could load while the renderer was not reaching a usable page:

   ```bash
   tail -180 /home/azureuser/.cache/chatgpt-native.log
   ```

3. Stopped the existing watchdog and ChatGPT process cleanly.

4. Moved only rebuildable caches to a timestamped backup instead of deleting them:

   ```text
   ~/.config/Codex/Default/GPUCache
   ~/.config/Codex/Default/Partitions/codex-browser-app/GPUCache
   ~/.config/Codex/Default/Partitions/codex-browser-app/Service Worker/CacheStorage
   ~/.config/Codex/Default/Partitions/codex-browser-app/WebStorage/*/CacheStorage
   ~/.config/Codex/GPUPersistentCache/GPUCache
   ```

   The main Codex profile, login state, chats, and projects were not removed.

5. Relaunched the existing watchdog:

   ```bash
   DISPLAY=:1.0 nohup /home/azureuser/bin/keep-chatgpt-open \
     >>/home/azureuser/.cache/chatgpt-wrapper.log 2>&1 </dev/null &
   ```

6. When the first relaunch exited, checked the singleton links:

   ```bash
   readlink ~/.config/Codex/SingletonLock
   ```

   The lock pointed to the dead process `mylinuxserver2-481319`. With no ChatGPT process running, moved these stale links into the repair backup:

   ```text
   ~/.config/Codex/SingletonLock
   ~/.config/Codex/SingletonSocket
   ~/.config/Codex/SingletonCookie
   ```

7. Relaunched the watchdog again. The app then stayed running and the lock pointed to the new live process.

## Verification

```bash
pgrep -u "$(id -u)" -o -x ChatGPT
readlink ~/.config/Codex/SingletonLock
wmctrl -lpx | grep -i ChatGPT
rg -n 'main frame finished load|ready-to-show|Codex CLI initialized' \
  /home/azureuser/.cache/chatgpt-native.log | tail -20
```

Expected signals:

- A persistent `/usr/lib/chatgpt/ChatGPT` process.
- `SingletonLock` points to the current host/PID.
- A visible `ChatGPT` X11 window.
- `main frame finished load`, `ready-to-show`, and `Codex CLI initialized` in the native log.

## Recovery backup

The repair backup from this run is:

```text
/home/azureuser/.cache/chatgpt-repair-20260923-094941
```

Keep it until the app has been used successfully. It can be removed later if no rollback is needed.

## Notes

- Do not delete the complete `~/.config/Codex` directory unless a separate, explicit profile reset is intended.
- The stale singleton lock was the relaunch blocker; the cache reset was limited to disposable renderer/browser caches.
- OpenAI's general troubleshooting guidance recommends reloading the desktop app and clearing cache/site data for blank or endless-loading states: <https://help.openai.com/en/articles/7996703>.
