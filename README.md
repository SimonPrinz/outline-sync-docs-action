# Outline Sync Docs Action

Sync a folder of markdown files to a collection in your [Outline](https://www.getoutline.com/) wiki. Each `.md` file becomes a document; folders become nested documents. On every run: creates docs with no match yet, updates changed ones, archives docs whose local file was removed.

- Matching is **by title** — the first `# Heading` in the file (filenames/folder names are never used) — not by any id, and nothing is written back to your repository. A file with no heading is ignored.
- A folder needs an `index.md`/`README.md` with a heading to sync as its own document; required only if the folder has something to sync. Sibling files/folders can't share a title (the run fails naming the conflict); the same title at different nesting levels is fine.
- A root-level `index.md`/`README.md` syncs into the collection (name + description) when `documentId` is empty, or into that document when `documentId` is set — optional either way.
- Moving a file/folder without changing its title reparents the existing document, keeping its history. **Renaming** (title changes) is always delete + create, since a changed title can't be told apart from a new file.
- Outline reformats markdown on save, so a document may briefly show as changed right after syncing — harmless. Document ordering in Outline is never touched.

## Inputs

### `url`

Outline base URL. Default `"https://app.getoutline.com"`.

### `apiKey`

**Required** Outline API key.

### `collectionId`

**Required** Id of the Outline collection to sync into.

### `documentId`

Id of an existing Outline document to sync under. If omitted, documents are synced at the root of the collection.

### `repositoryPath`

Path in the repository to read markdown files from. Default `"docs/"`.

## Example usage

```yaml
- uses: actions/checkout@v6
- uses: SimonPrinz/outline-sync-docs-action@v1
  with:
    apiKey: ${{ secrets.OUTLINE_API_KEY }}
    collectionId: 8e4f2a1c-3b5d-4c6e-9f1a-2b3c4d5e6f7a
    repositoryPath: docs/
```

`@v1` tracks the latest `v1.x.y` release. Pin a specific tag (e.g. `@v1.2.3`) or a commit SHA instead if you want stricter reproducibility.

## Releasing

Maintainers: go to the Actions tab → "Release" workflow → Run workflow → pick `patch`/`minor`/`major`. This bumps the version, rebuilds `dist/`, commits, tags, publishes a GitHub Release, and moves the floating `v1`-style major tag — no manual steps needed.
