export * from "./public.js";
export type Locale = "ar" | "en";
export interface ApiFailure {
  ok: false;
  code: string;
  errors?: Record<string, string>;
}
export * from "./permissions.js";
export * from "./requests.js";
export * from "./validation.js";
export * from "./blocks.js";
export * from "./resource-access.js";
export * from "./admin.js";

export type {
  AccountDashboardData,
  AccountProfileData,
  AccountScreen,
  AccountPayload,
  AccountIdentity,
} from "./account.js";

export { CONTENT_SCHEMA_VERSION, MAX_TREE_DEPTH, MAX_TREE_NODES, MAX_CONTENT_BYTES, CONTAINER_TYPES, isContainerType, BLOCK_REGISTRY, LIBRARY_HIDDEN_TYPES, countNodes, maxDepth, findNode, removeNode, cloneWithNewIds, collectIds, newNodeId, defaultNode, cleanStyle } from "./content/tree.js";
export type { ContentNode, ContentEnvelope, ContainerType, BlockType as ContentBlockType } from "./content/tree.js";
export * from "./content/style.js";
export * from "./content/migrate.js";
export * from "./content/validate.js";
export * from "./content/inline-fields.js";
export * from "./content/clipboard.js";
export * from "./page-settings.js";

export * from "./schedule.js";
export * from "./track.js";

export * from "./media.js";
export * from "./content/tree-move.js";

export * from "./outbox.js";
