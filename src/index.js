import * as core from "@actions/core";
import * as github from "@actions/github";
import Api from "./api";
import {buildLocalTree, directoryExists} from "./local";
import {flattenIds, indexRemoteTree, buildPlan, executePlan} from "./plan";

try {
    let url = core.getInput("url");
    if (url === '') url = 'https://app.getoutline.com';
    const apiKey = core.getInput("apiKey", {required: true});
    let collectionId = core.getInput("collectionId", {required: true});
    /** @type {String | null} */
    let documentId = core.getInput("documentId");
    if (documentId === '') documentId = null
    let repositoryPath = core.getInput("repositoryPath");
    if (repositoryPath === '') repositoryPath = 'docs/';

    if (!directoryExists(repositoryPath)) {
        core.setFailed(`Repository path does not exist: ${repositoryPath}`);
        process.exit();
    }

    const outline = new Api(url, apiKey);
    const authInfo = await outline.authInfo();
    core.info(`Connected to Outline API as ${authInfo.user.email} in team ${authInfo.team.name}`);

    const collection = await outline.collectionsInfo(collectionId);
    core.debug(`Collection found: ${collection.name} (${collection.id})`);
    collectionId = collection.id;

    let remoteRootNodes;
    let rootDocument = null;
    if (documentId) {
        rootDocument = await outline.documentsInfo(documentId);
        core.debug(`Document found: ${rootDocument.title} (${rootDocument.id})`);
        documentId = rootDocument.id;
        const rootTree = await outline.documentsDocuments(documentId);
        remoteRootNodes = rootTree.children || [];
    } else {
        remoteRootNodes = await outline.collectionsDocuments(collectionId);
    }

    const {children: localTree, indexed: rootIndex} = buildLocalTree(repositoryPath);

    if (rootIndex) {
        if (documentId) {
            if (rootDocument.title !== rootIndex.title || rootDocument.text !== rootIndex.body) {
                await outline.documentsUpdate({id: documentId, title: rootIndex.title, text: rootIndex.body});
                core.info(`Updated root document: ${rootIndex.title} (${documentId})`);
            } else {
                core.debug(`No changes to root document: ${rootIndex.title} (${documentId})`);
            }
        } else {
            if (collection.name !== rootIndex.title || collection.description !== rootIndex.body) {
                await outline.collectionsUpdate({id: collectionId, name: rootIndex.title, description: rootIndex.body});
                core.info(`Updated collection: ${rootIndex.title} (${collectionId})`);
            } else {
                core.debug(`No changes to collection: ${rootIndex.title} (${collectionId})`);
            }
        }
    }

    const remoteById = new Map();
    const remoteByTitle = new Map();
    indexRemoteTree(remoteRootNodes, documentId, remoteById, remoteByTitle);

    const keptIds = new Set();
    const plan = await buildPlan(localTree, remoteRootNodes, outline, remoteById, remoteByTitle, keptIds);
    await executePlan(plan, documentId, outline, collectionId);

    const allRemoteIds = flattenIds(remoteRootNodes);
    const orphanIds = allRemoteIds.filter(id => !keptIds.has(id));
    for (const id of orphanIds) {
        await outline.documentsArchive(id);
        core.info(`Archived: ${id}`);
    }
} catch (error) {
    core.setFailed(error.message);
}
