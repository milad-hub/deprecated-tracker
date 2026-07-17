import { Api } from "../../library/src/api";

declare const api: Api;

api.currentMethod();

declare const dynamicKey: string;
const apiWithDynamicKey = api as unknown as Record<string, () => void>;
apiWithDynamicKey[dynamicKey]();

declare const apiAsAny: any;
apiAsAny.oldMethod();

const plainComment = {
  // @deprecated This is not JSDoc.
  plainCommentMethod(): void {},
};
plainComment.plainCommentMethod();
