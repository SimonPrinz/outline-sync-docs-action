import {test} from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {buildLocalTree, directoryExists} from "./local.js";

function makeFixture(structure) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-test-"));
    writeStructure(dir, structure);
    return dir;
}

function writeStructure(dir, structure) {
    for (const [name, content] of Object.entries(structure)) {
        const entryPath = path.join(dir, name);
        if (typeof content === "string") {
            fs.writeFileSync(entryPath, content);
        } else {
            fs.mkdirSync(entryPath);
            writeStructure(entryPath, content);
        }
    }
}

function withFixture(t, structure) {
    const dir = makeFixture(structure);
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    return dir;
}

test("directoryExists returns true for a real directory", (t) => {
    const dir = withFixture(t, {});
    assert.equal(directoryExists(dir), true);
});

test("directoryExists returns false for a missing path", () => {
    assert.equal(directoryExists("/does/not/exist"), false);
});

test("extracts title from heading and strips trailing whitespace from body", (t) => {
    const dir = withFixture(t, {"doc.md": "# My Title\n\nbody text\n"});
    const {children} = buildLocalTree(dir);
    assert.equal(children.length, 1);
    assert.equal(children[0].title, "My Title");
    assert.equal(children[0].body, "body text");
});

test("a file with no heading is silently excluded", (t) => {
    const dir = withFixture(t, {"no-heading.md": "just text, no heading\n"});
    const {children} = buildLocalTree(dir);
    assert.deepEqual(children, []);
});

test("folder title/body come from its index.md, which is not also a child", (t) => {
    const dir = withFixture(t, {
        sub: {
            "index.md": "# Sub Folder\n\nfolder body\n",
            "child.md": "# Child\n\nchild body\n"
        }
    });
    const {children} = buildLocalTree(dir);
    assert.equal(children.length, 1);
    const folder = children[0];
    assert.equal(folder.type, "folder");
    assert.equal(folder.title, "Sub Folder");
    assert.equal(folder.body, "folder body");
    assert.equal(folder.children.length, 1);
    assert.equal(folder.children[0].title, "Child");
});

test("a folder with content but no index file throws, naming the folder", (t) => {
    const dir = withFixture(t, {sub: {"child.md": "# Child\n"}});
    assert.throws(() => buildLocalTree(dir), /sub/);
});

test("an empty folder is silently skipped, no error", (t) => {
    const dir = withFixture(t, {empty: {}});
    const {children} = buildLocalTree(dir);
    assert.deepEqual(children, []);
});

test("duplicate sibling titles throw, naming the shared title", (t) => {
    const dir = withFixture(t, {
        "one.md": "# Same Title\n",
        "two.md": "# Same Title\n"
    });
    assert.throws(() => buildLocalTree(dir), /Same Title/);
});

test("the same title at different nesting levels is allowed", (t) => {
    const dir = withFixture(t, {
        "top.md": "# Shared\n",
        sub: {
            "index.md": "# Sub\n",
            "nested.md": "# Shared\n"
        }
    });
    assert.doesNotThrow(() => buildLocalTree(dir));
});

test("a root-level index.md is returned separately from children", (t) => {
    const dir = withFixture(t, {
        "index.md": "# Root\n\nroot body\n",
        "sibling.md": "# Sibling\n"
    });
    const {children, indexed} = buildLocalTree(dir);
    assert.equal(indexed.title, "Root");
    assert.equal(indexed.body, "root body");
    assert.equal(children.length, 1);
    assert.equal(children[0].title, "Sibling");
});
