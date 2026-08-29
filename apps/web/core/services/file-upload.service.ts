/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { AxiosRequestConfig } from "axios";
import axios, { CancelToken, isCancel } from "axios";
import type { TFileUploadData } from "@plane/types";

// services
import { APIService } from "@/services/api.service";

export class FileUploadService extends APIService {
  private cancelSource: any;

  constructor() {
    super("");
  }

  async uploadFile(
    uploadData: TFileUploadData,
    file: File,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<void> {
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
        onUploadProgress: uploadProgressHandler,
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

  cancelUpload() {
    this.cancelSource.cancel("Upload canceled");
  }
}
