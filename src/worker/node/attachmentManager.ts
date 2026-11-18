// Node mode's attachment manager: cucumber's (`../cucumber/attachmentManager.ts`), with its `Buffer`
// and stream branches (cucumber 13.3.0's `lib/runtime/attachment_manager/index.ts`, its
// `value_checker`'s `doesNotHaveValue` as `== null`): a `Buffer` as base64, a readable stream read to
// its end, then as a `Buffer`. Node only.
import { AttachmentContentEncoding } from "@cucumber/messages";
import { isReadable, type Readable } from "node:stream";
import {
  AttachmentManager,
  type ICreateAttachmentOptions,
} from "../cucumber/attachmentManager.ts";

export class NodeAttachmentManager extends AttachmentManager {
  protected override createOther(
    data: unknown,
    options: Partial<ICreateAttachmentOptions>,
    callback?: () => void,
  ): void | Promise<void> {
    if (Buffer.isBuffer(data)) {
      if (options.mediaType == null) {
        throw Error("Buffer attachments must specify a media type");
      }
      this.createBufferAttachment(data, options.mediaType, options.fileName);
    } else if (isReadable(data as Readable)) {
      if (options.mediaType == null) {
        throw Error("Stream attachments must specify a media type");
      }
      return this.createStreamAttachment(
        data as Readable,
        options.mediaType,
        options.fileName,
        callback,
      );
    } else {
      throw Error(
        "Invalid attachment data: must be a buffer, readable stream, or string",
      );
    }
  }

  createBufferAttachment(
    data: Buffer,
    mediaType: string,
    fileName?: string,
  ): void {
    this.createStringAttachment(
      data.toString("base64"),
      {
        encoding: AttachmentContentEncoding.BASE64,
        contentType: mediaType,
      },
      fileName,
    );
  }

  createStreamAttachment(
    data: Readable,
    mediaType: string,
    fileName?: string,
    callback?: () => void,
  ): void | Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      const buffers: Uint8Array[] = [];
      data.on("data", (chunk: Uint8Array) => {
        buffers.push(chunk);
      });
      data.on("end", () => {
        this.createBufferAttachment(
          Buffer.concat(buffers),
          mediaType,
          fileName,
        );
        resolve();
      });
      data.on("error", reject);
    });
    if (callback != null) {
      void promise.then(callback, callback);
    } else {
      return promise;
    }
  }
}
