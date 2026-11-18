// A World's `attach`, `log` and `link`: cucumber's attachment manager, which the runtime gives each
// test case's World (`../runner/testCaseRunner.ts`: it emits each attachment as cucumber's message,
// only while a step or hook runs). Page-safe (`@cucumber/messages` for its types only).
import { AttachmentContentEncoding } from "@cucumber/messages";

// A copy of cucumber 13.3.0's `lib/runtime/attachment_manager/index.ts`, down to `normaliseOptions`:
// its string branch (binary data as a base64 string, its media type `base64:…`), both modes'. Other
// data goes to each mode's `createOther`: node mode's has cucumber's `Buffer` and stream branches
// (`../node/attachmentManager.ts`), the page's none (strings only: `../browser/attachmentManager.ts`). Each
// attachment goes to `onAttachment` as cucumber's runtime gets it. Options given as an object are
// copied, not completed in place.

const BASE64 = AttachmentContentEncoding.BASE64;
const IDENTITY = AttachmentContentEncoding.IDENTITY;

interface IAttachmentMedia {
  encoding: AttachmentContentEncoding;
  contentType: string;
}

interface IAttachment {
  data: string;
  media: IAttachmentMedia;
  fileName?: string;
}

type IAttachFunction = (attachment: IAttachment) => void;

export interface ICreateAttachmentOptions {
  mediaType: string;
  fileName?: string;
}

export abstract class AttachmentManager {
  private readonly onAttachment: IAttachFunction;

  constructor(onAttachment: IAttachFunction) {
    this.onAttachment = onAttachment;
  }

  log(text: string): void | Promise<void> {
    return this.create(text, "text/x.cucumber.log+plain");
  }

  link(...url: string[]): void | Promise<void> {
    return this.create(url.join("\n"), "text/uri-list");
  }

  create(
    data: unknown,
    mediaTypeOrOptions?: string | ICreateAttachmentOptions,
    callback?: () => void,
  ): void | Promise<void> {
    const options = normaliseOptions(mediaTypeOrOptions);
    if (typeof data !== "string") {
      return this.createOther(data, options, callback);
    }
    options.mediaType ??= "text/plain";
    if (options.mediaType.startsWith("base64:")) {
      this.createStringAttachment(
        data,
        {
          encoding: BASE64,
          contentType: options.mediaType.replace("base64:", ""),
        },
        options.fileName,
      );
    } else {
      this.createStringAttachment(
        data,
        {
          encoding: IDENTITY,
          contentType: options.mediaType,
        },
        options.fileName,
      );
    }
  }

  /** Attaches data that isn't a string, as the mode can (else cucumber's error, thrown in the call). */
  protected abstract createOther(
    data: unknown,
    options: Partial<ICreateAttachmentOptions>,
    callback?: () => void,
  ): void | Promise<void>;

  createStringAttachment(
    data: string,
    media: IAttachmentMedia,
    fileName?: string,
  ): void {
    this.onAttachment({
      data,
      media,
      ...(fileName ? { fileName } : {}),
    });
  }
}

function normaliseOptions(
  mediaTypeOrOptions?: string | ICreateAttachmentOptions,
): Partial<ICreateAttachmentOptions> {
  if (!mediaTypeOrOptions) {
    return {};
  }
  if (typeof mediaTypeOrOptions === "string") {
    return {
      mediaType: mediaTypeOrOptions,
    };
  }
  return { ...mediaTypeOrOptions };
}
