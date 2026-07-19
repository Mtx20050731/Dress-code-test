import type { StyleSession } from "@/types/style";

export type AccountIdentity = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
};

export type CloudSessionEnvelope = {
  schemaVersion: "style-session-cloud-v1";
  accountId: string;
  session: StyleSession;
  revision: number;
  updatedAt: string;
};

export type CloudMediaRef = {
  id: string;
  accountId: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  privateUrl: string;
  createdAt: string;
};

export type SyncConflict = {
  localRevision: number;
  remoteRevision: number;
  resolution: "keep-local" | "keep-remote" | "manual";
};

export interface AccountProvider {
  current(): Promise<AccountIdentity | null>;
  signOut(): Promise<void>;
}

export interface CloudSyncProvider {
  pull(accountId: string): Promise<CloudSessionEnvelope | null>;
  push(envelope: CloudSessionEnvelope): Promise<CloudSessionEnvelope>;
  uploadPrivateMedia(accountId: string, mediaId: string, blob: Blob): Promise<CloudMediaRef>;
  deletePrivateMedia(accountId: string, mediaId: string): Promise<void>;
}

export type CloudCapability = {
  accountEnabled: boolean;
  syncEnabled: boolean;
  provider: "disabled" | "unconfigured";
  reason: string;
};
