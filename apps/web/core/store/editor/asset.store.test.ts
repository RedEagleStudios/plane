import type { AxiosProgressEvent } from "axios";
import { describe, expect, it, vi } from "vitest";
import { EditorAssetStore } from "./asset.store";

describe("EditorAssetStore upload progress", () => {
  it("publishes every byte-based progress event immediately", async () => {
    const store = new EditorAssetStore();

    vi.spyOn(store.fileService, "uploadProjectAsset").mockImplementation(
      async (_workspaceSlug, _projectId, _data, _file, onUploadProgress) => {
        onUploadProgress?.({ loaded: 18, total: undefined } as AxiosProgressEvent);
        onUploadProgress?.({ loaded: 57, total: undefined } as AxiosProgressEvent);
        return { asset_id: "video-asset" } as never;
      }
    );

    const file = new File([new Uint8Array(100)], "video.mp4", { type: "video/mp4" });
    const upload = store.uploadEditorAsset({
      blockId: "video-block",
      data: {} as never,
      file,
      projectId: "project-id",
      workspaceSlug: "workspace",
    });

    expect(store.assetsUploadPercentage["video-block"]).toBe(57);

    await upload;
    expect(store.assetsUploadPercentage["video-block"]).toBeUndefined();
  });
});
