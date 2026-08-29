/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import axios, { CancelToken, isCancel } from "axios";
import type { TFileUploadData } from "@plane/types";

// api service
import { APIService } from "../api.service";

/**
 * Service class for handling file upload operations
 * Handles file uploads
 * @extends {APIService}
 */
export class FileUploadService extends APIService {
  private cancelSource: any;

  constructor() {
    super("");
  }

  /**
   * Uploads a file using the signed request contract returned by the API.
   */
  async uploadFile(uploadData: TFileUploadData, file: File): Promise<void> {
    this.cancelSource = CancelToken.source();

    const isPutUpload = uploadData.method === "PUT";
    const data = isPutUpload
      ? file
      : (() => {
          const formData = new FormData();
          Object.entries(uploadData.fields).forEach(([key, value]) => formData.append(key, value));
          formData.append("file", file);
          return formData;
        })();

    return axios
      .request({
        url: uploadData.url,
        method: uploadData.method,
        data,
        headers: isPutUpload ? uploadData.headers : { "Content-Type": "multipart/form-data" },
        cancelToken: this.cancelSource.token,
        withCredentials: false,
      })
      .then((response) => response?.data)
      .catch((error) => {
        if (isCancel(error)) {
          console.log(error.message);
        } else {
          throw error?.response?.data;
        }
      });
  }

  /**
   * Cancels the upload
   */
  cancelUpload() {
    this.cancelSource.cancel("Upload canceled");
  }
}
