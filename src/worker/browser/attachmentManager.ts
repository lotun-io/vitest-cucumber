// The page's attachment manager: cucumber's (`../cucumber/attachmentManager.ts`), its string branch
// only. A page has no `Buffer` and no Node stream, and cucumber's types allow nothing else: binary
// data is a base64 string (its media type `base64:…`). Anything else is this copy's error, thrown in
// the call, as cucumber's check does. Page-safe.
import { AttachmentManager } from "../cucumber/attachmentManager.ts";

export class BrowserAttachmentManager extends AttachmentManager {
  protected override createOther(): never {
    throw Error("Invalid attachment data: must be a string");
  }
}
