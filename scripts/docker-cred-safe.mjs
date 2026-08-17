// Docker refuses to pull anything — public images included — when its credential helper is
// missing, and on macOS that happens without the user touching Docker at all: a second container
// runtime installs its own `docker-credential-osxkeychain` into /usr/local/bin, and uninstalling it
// leaves the symlink behind, dangling, shadowing the copy Docker Desktop ships. `~/.docker/
// config.json` still names `credsStore: osxkeychain`, so every pull dies on
// `exec: "docker-credential-osxkeychain": executable file not found in $PATH`.
//
// Handing Docker a throwaway config dir with empty auths sidesteps it. Every image the voice stack
// pulls is public, so there is nothing to authenticate in the first place.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/** What `docker` would have read had we not overridden it. */
function realConfigDir(env) {
  return env.DOCKER_CONFIG || join(homedir(), '.docker');
}

/** The contents of a credential-helper-free `config.json`.
 *
 *  `compose` is a CLI *plugin*, and Docker resolves plugins out of the config dir it is pointed at.
 *  Docker Desktop installs them ONLY under `<config>/cli-plugins` — every system plugin dir
 *  (/usr/local/lib, /usr/local/libexec, /usr/lib, /usr/libexec …/docker/cli-plugins) is empty — so a
 *  replacement config holding nothing but empty auths throws away the very `compose` command it
 *  exists to retry, and Docker answers `unknown command: docker compose`. Naming the real plugin
 *  directory keeps both halves: no credential helper, and compose still found. Linux package
 *  installs put compose in a system dir and never noticed, which is why this went unseen — macOS is
 *  where the credential failure actually happens and where the workaround has to work. */
export function credSafeConfig(env = process.env) {
  return { auths: {}, cliPluginsExtraDirs: [join(realConfigDir(env), 'cli-plugins')] };
}

/** Materialize that config in a temp dir, for `docker --config <dir> compose …`. */
export function credSafeConfigDir(env = process.env) {
  const dir = mkdtempSync(join(tmpdir(), 'mavea-docker-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify(credSafeConfig(env)));
  return dir;
}
