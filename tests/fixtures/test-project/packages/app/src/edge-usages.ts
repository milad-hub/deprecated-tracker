import { AncientClient, ancientCall, modernCall } from "legacy-lib";
import { each } from "lodash";
import { Api } from "../../library/src/api";
import {
  OldContractBase,
  StrangeApi,
  nestedDeprecated,
  old$Method$$,
  renamedOld,
  старыйМетод,
} from "../../library/src/strange";
import { TaggedService } from "../../library/src/tagged";

declare const maybeApi: Api | undefined;
maybeApi?.oldMethod();

const tagged = new TaggedService();
tagged.obsoleteTaggedMethod();
tagged.legacyTaggedMethod();
tagged.reasonlessMethod();
tagged.modernCall();

const strange = new StrangeApi();
strange["old method with spaces"]();
strange["old-kebab-case"]();
strange.load("direct/path.ts");
strange.load({ path: "modern.ts" });
void strange.twin;
strange.twin = "writing is fine";
void StrangeApi.oldStatic;
strange.oldGeneric("value");
strange.hostileReason();

старыйМетод();
old$Method$$();
renamedOld();
nestedDeprecated();

class BatchImpl extends OldContractBase {
  public oldAbstract(): void {}
}
new BatchImpl().oldAbstract();

ancientCall();
new AncientClient().connect();
modernCall();

each([1, 2, 3]);
