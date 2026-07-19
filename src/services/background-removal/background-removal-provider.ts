export type RemoveBackgroundResult = {
  originalUrl: string;
  transparentUrl: string;
  thumbnailUrl?: string;
  maskUrl?: string;
  width: number;
  height: number;
  status: "processing" | "completed" | "failed";
  errorMessage?: string;
};

export interface BackgroundRemovalProvider {
  removeBackground(imageUrl: string): Promise<RemoveBackgroundResult>;
}

export const mockBackgroundRemovalProvider: BackgroundRemovalProvider = {
  async removeBackground(imageUrl) {
    return { originalUrl: imageUrl, transparentUrl: imageUrl, width: 0, height: 0, status: "completed" };
  },
};
