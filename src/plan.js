import * as core from "@actions/core";

/**
 * @param nodes {Array<{id: String, children?: Array<Object>}>}
 * @returns {String[]}
 */
export function flattenIds(nodes) {
    let ids = [];
    for (const node of nodes) {
        ids.push(node.id);
        if (node.children) {
            ids = ids.concat(flattenIds(node.children));
        }
    }
    return ids;
}

/**
 * Flattens the remote tree into two lookups: by id (for parent/children info) and by title
 * (for the move-detection fallback search).
 * @param nodes {Array<{id: String, title: String, children?: Array<Object>}>}
 * @param parentId {String|null}
 * @param byId {Map<String, {id: String, title: String, parentId: String|null, children: Array<Object>}>}
 * @param byTitle {Map<String, String[]>}
 */
export function indexRemoteTree(nodes, parentId, byId, byTitle) {
    for (const node of nodes) {
        byId.set(node.id, {id: node.id, title: node.title, parentId, children: node.children || []});
        if (!byTitle.has(node.title)) {
            byTitle.set(node.title, []);
        }
        byTitle.get(node.title).push(node.id);
        if (node.children) {
            indexRemoteTree(node.children, node.id, byId, byTitle);
        }
    }
}

/**
 * @typedef {Object} PlanNode
 * @property {'file'|'folder'} type
 * @property {String} title
 * @property {String} text
 * @property {String|null} remoteId - null means create; otherwise update/move an existing doc
 * @property {String|null} currentParentId - the doc's current parent, only meaningful when remoteId is set
 * @property {Boolean} contentChanged - only meaningful when remoteId is set
 * @property {PlanNode[]} children
 */

/**
 * Read-only planning pass: decides create/update/move/no-op for every local node, without
 * performing any mutating API calls.
 * @param localNodes {import("./local").TreeNode[]}
 * @param remoteScopeNodes {Array<{id: String, title: String, children?: Array<Object>}>}
 * @param outline {import("./api").default}
 * @param remoteById {Map<String, Object>}
 * @param remoteByTitle {Map<String, String[]>}
 * @param keptIds {Set<String>}
 * @returns {Promise<PlanNode[]>}
 */
export async function buildPlan(localNodes, remoteScopeNodes, outline, remoteById, remoteByTitle, keptIds) {
    const plan = [];

    for (const node of localNodes) {
        let matchId = null;
        const scopeMatch = remoteScopeNodes.find(remote => remote.title === node.title);
        if (scopeMatch) {
            matchId = scopeMatch.id;
        } else {
            const candidateIds = (remoteByTitle.get(node.title) || []).filter(id => !keptIds.has(id));
            if (candidateIds.length === 1) {
                matchId = candidateIds[0];
            }
        }

        let remoteId = null;
        let currentParentId = null;
        let contentChanged = false;
        let childScope = [];

        if (matchId) {
            const remoteNode = remoteById.get(matchId);
            remoteId = matchId;
            currentParentId = remoteNode.parentId;
            childScope = remoteNode.children;
            keptIds.add(matchId);

            const info = await outline.documentsInfo(matchId);
            contentChanged = info.text !== node.body;
        }

        const children = node.type === 'folder'
            ? await buildPlan(node.children, childScope, outline, remoteById, remoteByTitle, keptIds)
            : [];

        plan.push({type: node.type, title: node.title, text: node.body, remoteId, currentParentId, contentChanged, children});
    }

    return plan;
}

/**
 * Mutation pass: replays the decisions made by buildPlan.
 * @param planNodes {PlanNode[]}
 * @param parentId {String|null}
 * @param outline {import("./api").default}
 * @param collectionId {String}
 */
export async function executePlan(planNodes, parentId, outline, collectionId) {
    for (const node of planNodes) {
        let id;

        if (node.remoteId === null) {
            const created = await outline.documentsCreate({title: node.title, text: node.text, collectionId, parentDocumentId: parentId});
            id = created.id;
            core.info(`Created: ${node.title} (${id})`);
        } else {
            id = node.remoteId;

            if (node.currentParentId !== parentId) {
                await outline.documentsMove({id, collectionId, parentDocumentId: parentId});
                core.info(`Moved: ${node.title} (${id})`);
            }

            if (node.contentChanged) {
                await outline.documentsUpdate({id, title: node.title, text: node.text});
                core.info(`Updated: ${node.title} (${id})`);
            }

            if (node.currentParentId === parentId && !node.contentChanged) {
                core.debug(`No changes: ${node.title} (${id})`);
            }
        }

        await executePlan(node.children, id, outline, collectionId);
    }
}
