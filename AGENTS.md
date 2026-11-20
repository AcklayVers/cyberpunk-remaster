# Publishing instructions

This is the canonical source of `cyberpunk-remaster`. The user explicitly authorized publishing completed updates to the PUBLIC repository https://github.com/AcklayVers/cyberpunk-remaster and wants future changes from the existing chat uploaded there automatically. Keep working in this directory; do not publish the parent workspace or unrelated modules.

After each completed module change:

1. Read the current module.json and Git status. Fetch origin/main before editing. Preserve unrelated local edits and never force-push. The release branch is main; finish the user's authorized changes there (or integrate a working branch into main) so publication runs.
2. Preserve the module ID, compendium UUIDs, asset paths and gameplay data unless the user's task requires changes. Never edit a live world's database to publish a release. Keep numbered packs/**/*.log files: these are essential LevelDB transaction data. LOCK, LOG and LOG.old are transient.
3. Increment the version with `python tools/set-version.py NEXT_VERSION` (e.g. the next patch version). This updates module.json, the versioned download URL and package metadata where present. Keep the stable manifest URL `https://github.com/AcklayVers/cyberpunk-remaster/releases/latest/download/module.json`. Update README and CHANGELOG for the actual changes.
4. Run the relevant module checks. For Remaster run `npm ci --no-audit --no-fund` if dependencies are missing, then `npm test`. Run `python -m unittest discover -s tools -p test_release.py` in either repository.
5. Stage only the intended files, then run `python tools/release.py --repository AcklayVers/cyberpunk-remaster --output dist`. This validates declared resources and compendiums and verifies every packaged file byte for byte. Never publish .author-paths.local.json, secrets, .env, node_modules, worlds, backups or files outside this repository.
6. Commit the verified change and `git push origin main`. The user already authorized this normal publication flow; do not ask for the same permission again. GitHub Actions creates a release only after its checks pass. A new release requires a higher version. Never overwrite a published tag or release.
7. Wait for the Actions run for the pushed commit, inspect failures and fix them. Verify that the public latest module.json has the intended version and that its ZIP download succeeds. Report the released version with the stable manifest link and ZIP link. Do not claim publication when only a local ZIP exists.

GitHub CLI on this computer: `C:/Users/AcklayVers/AppData/Local/CodexTools/github-cli/bin/gh.exe`. It is signed in using the OS keyring; never print or copy its token. Useful commands: `gh run list --repo AcklayVers/cyberpunk-remaster`, `gh run view RUN_ID --repo AcklayVers/cyberpunk-remaster`, and `gh run watch RUN_ID --repo AcklayVers/cyberpunk-remaster --exit-status`.

See GITHUB_PUBLISHING.md. User instructions take precedence over these defaults.
