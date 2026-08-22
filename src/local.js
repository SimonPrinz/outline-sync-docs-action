import * as fs from "fs";
import * as path from "path";

/**
 * @param path {String}
 * @returns {boolean}
 */
export function directoryExists(path) {
    try {
        return fs.statSync(path).isDirectory();
    } catch (err) {
        return false;
    }
}

/**
 * @param raw {String}
 * @returns {{title: String, body: String}|null} null if no `# Heading` present
 */
function extractTitle(raw) {
    const match = raw.match(/^\s*#\s+(.+)\r?\n?/);
    if (!match) {
        return null;
    }
    return {
        title: match[1].trim(),
        body: raw.slice(match[0].length).replace(/^\s*\r?\n/, '').replace(/\s+$/, '')
    };
}

/**
 * @typedef {Object} TreeNode
 * @property {'file'|'folder'} type
 * @property {String} title - required; from the file's (or folder's index file's) first `# Heading`
 * @property {String} body - markdown with the extracted H1 line stripped
 * @property {TreeNode[]} [children] - folders only
 */

/**
 * Walks a directory, returning its eligible children plus its own index-file title/body (if any).
 * @param dirPath {String}
 * @returns {{children: TreeNode[], indexed: {title: String, body: String}|null}}
 */
function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, {withFileTypes: true})
        .sort((a, b) => a.name.localeCompare(b.name));

    let indexed = null;
    const children = [];
    /** @type {Map<String, String[]>} title -> source paths, for duplicate detection */
    const sourcesByTitle = new Map();

    const trackTitle = (title, sourcePath) => {
        if (!sourcesByTitle.has(title)) {
            sourcesByTitle.set(title, []);
        }
        sourcesByTitle.get(title).push(sourcePath);
    };

    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            const sub = walk(entryPath);
            if (sub.children.length === 0) {
                continue;
            }
            if (!sub.indexed) {
                throw new Error(`Folder "${entryPath}" has documents to sync but no index.md/README.md with a "# Heading" title.`);
            }
            children.push({type: 'folder', title: sub.indexed.title, body: sub.indexed.body, children: sub.children});
            trackTitle(sub.indexed.title, entryPath);
            continue;
        }

        if (!entry.isFile() || !entry.name.endsWith('.md')) {
            continue;
        }

        if (entry.name === 'index.md' || entry.name === 'README.md') {
            if (!indexed) {
                indexed = extractTitle(fs.readFileSync(entryPath, 'utf-8'));
            }
            continue;
        }

        const extracted = extractTitle(fs.readFileSync(entryPath, 'utf-8'));
        if (extracted) {
            children.push({type: 'file', title: extracted.title, body: extracted.body});
            trackTitle(extracted.title, entryPath);
        }
    }

    for (const [title, sources] of sourcesByTitle) {
        if (sources.length > 1) {
            throw new Error(`Duplicate title "${title}" in "${dirPath}": ${sources.join(', ')}. Titles must be unique among siblings.`);
        }
    }

    return {children, indexed};
}

/**
 * @param dirPath {String}
 * @returns {{children: TreeNode[], indexed: {title: String, body: String}|null}}
 */
export function buildLocalTree(dirPath) {
    return walk(dirPath);
}
